//! Phase-5 (M5.0, B1) native audio capture — CPAL input → lock-free ringbuffer
//! → interleaved 32-bit-float WAV take in `takes/`. See ADR-0022.
//!
//! Music analogy: the RT audio callback is the microphone diaphragm — it must
//! never stall. So the callback does the *minimum*: convert the incoming frame
//! to `f32` and `push` it into a lock-free [`ringbuf`] queue (no locks, no I/O,
//! no allocation in the steady state). A separate writer thread is the tape
//! machine: it drains the queue to a streaming WAV file on disk and emits
//! `audio:record` status events (frames written + input peak) so the browser can
//! *display* level and progress. The browser never touches the audio samples —
//! capture and monitoring stay native (ADR-0022, PHASE_5 §5.9).
//!
//! Takes are **immutable**: a recording is written once and only ever referenced
//! by an [`crate::persistence::AudioClip`] (Phase-5 B2); nothing mutates the file
//! afterwards. Count-in / loop-record / punch and MIDI-take promotion build on
//! this core in later M5.0 steps.

use std::fs::File;
use std::io::{BufWriter, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::HeapRb;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};
use uuid::Uuid;

/// Capture-window options (Phase-5 B1). All times are seconds from the moment
/// capture starts. Defaults (all zero / `None`) record everything immediately.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct RecordOptions {
    /// Count-in: discard this many seconds at the head of the take (the click
    /// plays during count-in but is not part of the recording).
    #[serde(default)]
    pub count_in_secs: f64,
    /// Punch-in: don't write anything before this second. Combined with
    /// `count_in_secs`, the later of the two wins.
    #[serde(default)]
    pub punch_in_secs: Option<f64>,
    /// Punch-out: stop writing at this second (capture keeps monitoring).
    #[serde(default)]
    pub punch_out_secs: Option<f64>,
}

impl RecordOptions {
    /// Resolve the effective write window `[start, end)` in **interleaved sample
    /// indices** for the given format. `end` is `u64::MAX` when open-ended.
    fn sample_window(&self, sample_rate: u32, channels: u16) -> (u64, u64) {
        let ch = channels.max(1) as u64;
        let secs_to_sample = |t: f64| (t.max(0.0) * sample_rate as f64).round() as u64 * ch;
        let write_start = self.count_in_secs.max(self.punch_in_secs.unwrap_or(0.0));
        let start = secs_to_sample(write_start);
        let end = match self.punch_out_secs {
            Some(t) if t > write_start => secs_to_sample(t),
            Some(_) => start, // punch-out at//before the start ⇒ empty window
            None => u64::MAX,
        };
        (start, end)
    }
}

/// Intersection of the drained chunk `[seen, seen + n)` with the write window
/// `[start, end)`, as offsets `[lo, hi)` within `0..n`. Empty ⇒ `(0, 0)`.
fn window_slice(seen: u64, n: usize, start: u64, end: u64) -> (usize, usize) {
    if n == 0 || end <= start {
        return (0, 0);
    }
    let chunk_end = seen + n as u64;
    let lo = start.saturating_sub(seen).min(n as u64) as usize;
    let hi = if end >= chunk_end {
        n
    } else {
        end.saturating_sub(seen).min(n as u64) as usize
    };
    if hi <= lo {
        (0, 0)
    } else {
        (lo, hi)
    }
}

/// The opened CPAL input, bundled so the recorder thread takes one value.
struct DeviceStream {
    device: cpal::Device,
    config: StreamConfig,
    sample_format: SampleFormat,
}

/// Managed Tauri state for the single active recording (one at a time).
#[derive(Default)]
pub struct AudioRecorder {
    stop: Arc<AtomicBool>,
    handle: Mutex<Option<JoinHandle<RecordSummary>>>,
    active: Mutex<Option<String>>,
}

/// Returned by `start` — enough for the UI to show status and, later, to
/// register the take in `project.json`.
#[derive(Serialize, Clone)]
pub struct RecordStartResponse {
    pub take_id: String,
    pub path: PathBuf,
    pub device: String,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Returned by `stop` — the finished take's metadata.
#[derive(Serialize, Clone)]
pub struct RecordSummary {
    pub take_id: String,
    pub path: PathBuf,
    pub sample_rate: u32,
    pub channels: u16,
    /// Per-channel frame count.
    pub frames: u64,
    pub duration_secs: f64,
    /// Samples the ringbuffer could not accept (writer fell behind). Should be 0;
    /// non-zero means the disk could not keep up with capture.
    pub dropped_samples: u64,
}

/// Progress event streamed to the browser while recording (display only).
#[derive(Serialize, Clone)]
struct RecordEvent {
    take_id: String,
    frames: u64,
    peak: f32,
}

impl AudioRecorder {
    /// Open the default input device and start capturing into a new take under
    /// `takes_dir`. Returns immediately with the take id + stream format; the
    /// capture runs on a dedicated thread until [`stop`](Self::stop).
    pub fn start(
        &self,
        app: AppHandle,
        takes_dir: PathBuf,
        opts: RecordOptions,
    ) -> Result<RecordStartResponse, String> {
        if self.handle.lock().unwrap().is_some() {
            return Err("A recording is already in progress.".to_string());
        }
        std::fs::create_dir_all(&takes_dir)
            .map_err(|e| format!("mkdir {}: {e}", takes_dir.display()))?;

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No default input device found.".to_string())?;
        let device_name = device.name().unwrap_or_else(|_| "Unknown".to_string());
        let config = device
            .default_input_config()
            .map_err(|e| format!("Could not read input config: {e}"))?;
        let sample_format = config.sample_format();
        let stream_config: StreamConfig = config.clone().into();
        let channels = stream_config.channels;
        let sample_rate = stream_config.sample_rate.0;

        let take_id = format!("take-{}", Uuid::new_v4().simple());
        let path = takes_dir.join(format!("{take_id}.wav"));

        info!(
            "Starting recording {} on {} @ {} Hz, {} ch, {:?}",
            take_id, device_name, sample_rate, channels, sample_format
        );

        let stop = self.stop.clone();
        stop.store(false, Ordering::Relaxed);
        let take_id_thread = take_id.clone();
        let path_thread = path.clone();

        let device_stream = DeviceStream {
            device,
            config: stream_config,
            sample_format,
        };

        let handle = thread::Builder::new()
            .name("stockhausen-audio-recorder".to_string())
            .spawn(move || {
                run_recorder(app, device_stream, take_id_thread, path_thread, stop, opts)
            })
            .map_err(|e| format!("Could not spawn recorder thread: {e}"))?;

        *self.handle.lock().unwrap() = Some(handle);
        *self.active.lock().unwrap() = Some(take_id.clone());

        Ok(RecordStartResponse {
            take_id,
            path,
            device: device_name,
            sample_rate,
            channels,
        })
    }

    /// Stop the active recording, finalise the WAV, and return its metadata.
    pub fn stop(&self) -> Result<RecordSummary, String> {
        self.stop.store(true, Ordering::Relaxed);
        let handle = self
            .handle
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| "No recording is in progress.".to_string())?;
        let summary = handle
            .join()
            .map_err(|_| "Recorder thread panicked.".to_string())?;
        *self.active.lock().unwrap() = None;
        Ok(summary)
    }

    pub fn is_running(&self) -> bool {
        self.handle.lock().unwrap().is_some()
    }

    pub fn active_take(&self) -> Option<String> {
        self.active.lock().unwrap().clone()
    }
}

/// Thread body: capture until `stop`, then return the take summary. All fallible
/// setup is funnelled through [`record_to_disk`]; a failure yields an empty
/// summary (and a logged warning) rather than a panic that would poison `join`.
fn run_recorder(
    app: AppHandle,
    device_stream: DeviceStream,
    take_id: String,
    path: PathBuf,
    stop: Arc<AtomicBool>,
    opts: RecordOptions,
) -> RecordSummary {
    let channels = device_stream.config.channels;
    let sample_rate = device_stream.config.sample_rate.0;

    match record_to_disk(&app, device_stream, &take_id, &path, &stop, &opts) {
        Ok((frames, dropped_samples)) => RecordSummary {
            take_id,
            path,
            sample_rate,
            channels,
            frames,
            duration_secs: frames as f64 / sample_rate.max(1) as f64,
            dropped_samples,
        },
        Err(e) => {
            warn!("recording {take_id} failed: {e}");
            RecordSummary {
                take_id,
                path,
                sample_rate,
                channels,
                frames: 0,
                duration_secs: 0.0,
                dropped_samples: 0,
            }
        }
    }
}

/// Build the CPAL input stream (pushing into a ring), drain the ring to a
/// streaming WAV until `stop`, then finalise. Returns `(frames, dropped)`.
fn record_to_disk(
    app: &AppHandle,
    device_stream: DeviceStream,
    take_id: &str,
    path: &Path,
    stop: &Arc<AtomicBool>,
    opts: &RecordOptions,
) -> Result<(u64, u64), String> {
    let DeviceStream {
        device,
        config,
        sample_format,
    } = device_stream;
    let channels = config.channels.max(1);
    let sample_rate = config.sample_rate.0;
    let (window_start, window_end) = opts.sample_window(sample_rate, channels);

    // ~4 s of headroom so a momentary disk hiccup never drops samples.
    let ring_capacity = ((sample_rate as usize) * (channels as usize) * 4).max(8192);
    let rb = HeapRb::<f32>::new(ring_capacity);
    let (mut prod, mut cons) = rb.split();

    let dropped = Arc::new(AtomicU64::new(0));
    let dropped_cb = dropped.clone();
    let err_fn = |err| warn!("CPAL record stream error: {err}");

    // Only the callback holds `prod`; each match arm moves it (arms are exclusive).
    // Integer devices convert to f32 into a reusable scratch buffer (no per-call
    // alloc once it has grown once).
    let stream = match sample_format {
        SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _| {
                let pushed = prod.push_slice(data);
                if pushed < data.len() {
                    dropped_cb.fetch_add((data.len() - pushed) as u64, Ordering::Relaxed);
                }
            },
            err_fn,
            None,
        ),
        SampleFormat::I16 => {
            let mut scratch: Vec<f32> = Vec::new();
            device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    scratch.clear();
                    scratch.extend(data.iter().map(|s| *s as f32 / i16::MAX as f32));
                    let pushed = prod.push_slice(&scratch);
                    if pushed < scratch.len() {
                        dropped_cb.fetch_add((scratch.len() - pushed) as u64, Ordering::Relaxed);
                    }
                },
                err_fn,
                None,
            )
        }
        SampleFormat::U16 => {
            let mut scratch: Vec<f32> = Vec::new();
            device.build_input_stream(
                &config,
                move |data: &[u16], _| {
                    let half = u16::MAX as f32 / 2.0;
                    scratch.clear();
                    scratch.extend(data.iter().map(|s| ((*s as f32) - half) / half));
                    let pushed = prod.push_slice(&scratch);
                    if pushed < scratch.len() {
                        dropped_cb.fetch_add((scratch.len() - pushed) as u64, Ordering::Relaxed);
                    }
                },
                err_fn,
                None,
            )
        }
        other => return Err(format!("Unsupported sample format: {other:?}")),
    }
    .map_err(|e| format!("CPAL build_input_stream failed: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("CPAL stream play failed: {e}"))?;

    let mut writer = WavStreamWriter::create(path, sample_rate, channels)
        .map_err(|e| format!("create take WAV {}: {e}", path.display()))?;

    // `stream` is dropped (capture halts) the moment `stop` is observed; we then
    // drain whatever the callback already pushed before breaking.
    let mut stream = Some(stream);
    let mut scratch = vec![0.0f32; 8192];
    // `seen` counts every captured sample; `written` counts only what landed in
    // the take (i.e. inside the count-in/punch window).
    let mut seen: u64 = 0;
    let mut written: u64 = 0;
    let mut last_emit = Instant::now();
    let mut peak_since_emit = 0.0f32;

    loop {
        let n = cons.pop_slice(&mut scratch);
        if n > 0 {
            // Peak is over the whole captured chunk (monitoring), window or not.
            for &s in &scratch[..n] {
                let a = s.abs();
                if a > peak_since_emit {
                    peak_since_emit = a;
                }
            }
            let (lo, hi) = window_slice(seen, n, window_start, window_end);
            if hi > lo {
                writer
                    .write_f32(&scratch[lo..hi])
                    .map_err(|e| format!("take write: {e}"))?;
                written += (hi - lo) as u64;
            }
            seen += n as u64;
        }

        // Once we've passed punch-out, there is nothing left to capture — stop.
        if stop.load(Ordering::Relaxed) || (window_end != u64::MAX && seen >= window_end) {
            stream = None;
        }

        if n == 0 {
            if stream.is_none() {
                break;
            }
            thread::sleep(Duration::from_millis(4));
        }

        if last_emit.elapsed() >= Duration::from_millis(100) {
            last_emit = Instant::now();
            let _ = app.emit(
                "audio:record",
                RecordEvent {
                    take_id: take_id.to_string(),
                    frames: written / channels as u64,
                    peak: peak_since_emit,
                },
            );
            peak_since_emit = 0.0;
        }
    }

    writer
        .finalize()
        .map_err(|e| format!("finalize take WAV: {e}"))?;

    let frames = written / channels as u64;
    let dropped_total = dropped.load(Ordering::Relaxed);
    info!(
        "recorded take {take_id} — {frames} frames ({} ch), {dropped_total} dropped",
        channels
    );
    Ok((frames, dropped_total))
}

/// Minimal streaming writer for a canonical 32-bit-float WAV
/// (RIFF / `WAVE_FORMAT_IEEE_FLOAT`, format code 3). Writes a 44-byte header with
/// placeholder sizes, appends interleaved little-endian `f32` frames as they
/// arrive, then back-patches the RIFF and `data` chunk sizes on [`finalize`].
///
/// Kept dependency-free (no `hound`) and unit-tested. Size fields are `u32`, so a
/// single take is bounded to the 4 GiB the WAV container allows anyway.
pub struct WavStreamWriter {
    file: BufWriter<File>,
    data_bytes: u32,
}

impl WavStreamWriter {
    pub fn create(path: &Path, sample_rate: u32, channels: u16) -> std::io::Result<Self> {
        let mut file = BufWriter::new(File::create(path)?);
        write_wav_header(&mut file, sample_rate, channels, 0)?;
        Ok(Self {
            file,
            data_bytes: 0,
        })
    }

    /// Append interleaved `f32` samples (already in capture channel order).
    pub fn write_f32(&mut self, samples: &[f32]) -> std::io::Result<()> {
        for &s in samples {
            self.file.write_all(&s.to_le_bytes())?;
        }
        self.data_bytes = self
            .data_bytes
            .saturating_add((samples.len() * 4) as u32);
        Ok(())
    }

    /// Flush, back-patch the two size fields, and fsync.
    pub fn finalize(self) -> std::io::Result<()> {
        let mut file = self
            .file
            .into_inner()
            .map_err(|e| e.into_error())?;
        // RIFF chunk size (offset 4) = 36 + data_bytes.
        file.seek(SeekFrom::Start(4))?;
        file.write_all(&36u32.saturating_add(self.data_bytes).to_le_bytes())?;
        // `data` chunk size (offset 40).
        file.seek(SeekFrom::Start(40))?;
        file.write_all(&self.data_bytes.to_le_bytes())?;
        file.sync_all()?;
        Ok(())
    }
}

fn write_wav_header<W: Write>(
    w: &mut W,
    sample_rate: u32,
    channels: u16,
    data_bytes: u32,
) -> std::io::Result<()> {
    let byte_rate = sample_rate * channels as u32 * 4;
    let block_align = channels * 4;
    w.write_all(b"RIFF")?;
    w.write_all(&(36u32.saturating_add(data_bytes)).to_le_bytes())?;
    w.write_all(b"WAVE")?;
    w.write_all(b"fmt ")?;
    w.write_all(&16u32.to_le_bytes())?; // PCM/float fmt chunk size
    w.write_all(&3u16.to_le_bytes())?; // WAVE_FORMAT_IEEE_FLOAT
    w.write_all(&channels.to_le_bytes())?;
    w.write_all(&sample_rate.to_le_bytes())?;
    w.write_all(&byte_rate.to_le_bytes())?;
    w.write_all(&block_align.to_le_bytes())?;
    w.write_all(&32u16.to_le_bytes())?; // bits per sample
    w.write_all(b"data")?;
    w.write_all(&data_bytes.to_le_bytes())?;
    Ok(())
}

/* ---------------------- Tests ----------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn read_u32(b: &[u8], off: usize) -> u32 {
        u32::from_le_bytes([b[off], b[off + 1], b[off + 2], b[off + 3]])
    }
    fn read_u16(b: &[u8], off: usize) -> u16 {
        u16::from_le_bytes([b[off], b[off + 1]])
    }
    fn read_f32(b: &[u8], off: usize) -> f32 {
        f32::from_le_bytes([b[off], b[off + 1], b[off + 2], b[off + 3]])
    }

    #[test]
    fn wav_writer_round_trips_header_and_samples() {
        let tmp = tempdir().unwrap();
        let path = tmp.path().join("take.wav");
        let samples = vec![0.0f32, 0.5, -0.5, 1.0, -1.0, 0.25];

        let mut w = WavStreamWriter::create(&path, 48_000, 2).unwrap();
        w.write_f32(&samples).unwrap();
        w.finalize().unwrap();

        let b = std::fs::read(&path).unwrap();
        assert_eq!(&b[0..4], b"RIFF");
        assert_eq!(&b[8..12], b"WAVE");
        assert_eq!(&b[12..16], b"fmt ");
        assert_eq!(read_u32(&b, 16), 16);
        assert_eq!(read_u16(&b, 20), 3, "IEEE-float format code");
        assert_eq!(read_u16(&b, 22), 2, "channels");
        assert_eq!(read_u32(&b, 24), 48_000, "sample rate");
        assert_eq!(read_u32(&b, 28), 48_000 * 2 * 4, "byte rate");
        assert_eq!(read_u16(&b, 32), 2 * 4, "block align");
        assert_eq!(read_u16(&b, 34), 32, "bits per sample");
        assert_eq!(&b[36..40], b"data");

        let data_len = read_u32(&b, 40) as usize;
        assert_eq!(data_len, samples.len() * 4);
        assert_eq!(read_u32(&b, 4) as usize, 36 + data_len, "RIFF size");
        assert_eq!(b.len(), 44 + samples.len() * 4);

        let round: Vec<f32> = (0..samples.len()).map(|i| read_f32(&b, 44 + i * 4)).collect();
        assert_eq!(round, samples);
    }

    #[test]
    fn wav_writer_empty_take_is_a_valid_zero_length_file() {
        let tmp = tempdir().unwrap();
        let path = tmp.path().join("empty.wav");
        WavStreamWriter::create(&path, 44_100, 1)
            .unwrap()
            .finalize()
            .unwrap();

        let b = std::fs::read(&path).unwrap();
        assert_eq!(b.len(), 44);
        assert_eq!(read_u32(&b, 40), 0, "data size");
        assert_eq!(read_u32(&b, 4), 36, "RIFF size with no data");
    }

    #[test]
    fn window_slice_covers_the_edge_cases() {
        // Fully open window → whole chunk.
        assert_eq!(window_slice(0, 10, 0, u64::MAX), (0, 10));
        // Straddling the start → tail of the chunk.
        assert_eq!(window_slice(0, 10, 4, u64::MAX), (4, 10));
        // Straddling the end → head of the chunk.
        assert_eq!(window_slice(0, 10, 0, 6), (0, 6));
        // Window strictly inside the chunk.
        assert_eq!(window_slice(0, 10, 3, 7), (3, 7));
        // Chunk entirely before the window.
        assert_eq!(window_slice(0, 10, 20, 30), (0, 0));
        // Chunk entirely after the window.
        assert_eq!(window_slice(10, 5, 0, 6), (0, 0));
        // Empty window.
        assert_eq!(window_slice(0, 10, 5, 5), (0, 0));
        // Later chunk, window still open.
        assert_eq!(window_slice(100, 8, 0, u64::MAX), (0, 8));
    }

    #[test]
    fn sample_window_applies_count_in_and_punch() {
        // Count-in of 1 s at 48 kHz stereo → skip 48000*2 samples, open-ended.
        let opts = RecordOptions { count_in_secs: 1.0, ..Default::default() };
        assert_eq!(opts.sample_window(48_000, 2), (96_000, u64::MAX));

        // Punch 2 s → 4 s, mono at 1 kHz → [2000, 4000).
        let opts = RecordOptions {
            count_in_secs: 0.0,
            punch_in_secs: Some(2.0),
            punch_out_secs: Some(4.0),
        };
        assert_eq!(opts.sample_window(1_000, 1), (2_000, 4_000));

        // The later of count-in / punch-in wins as the start.
        let opts = RecordOptions {
            count_in_secs: 3.0,
            punch_in_secs: Some(1.0),
            punch_out_secs: None,
        };
        assert_eq!(opts.sample_window(1_000, 1), (3_000, u64::MAX));

        // Punch-out before the start collapses to an empty window.
        let opts = RecordOptions {
            count_in_secs: 5.0,
            punch_in_secs: None,
            punch_out_secs: Some(2.0),
        };
        let (s, e) = opts.sample_window(1_000, 1);
        assert_eq!(s, e);

        // Defaults record everything from sample 0.
        assert_eq!(RecordOptions::default().sample_window(44_100, 2), (0, u64::MAX));
    }

    #[test]
    fn wav_writer_handles_writes_larger_than_its_buffer() {
        let tmp = tempdir().unwrap();
        let path = tmp.path().join("big.wav");
        let samples: Vec<f32> = (0..5000).map(|i| (i as f32) * 1.0e-4).collect();

        let mut w = WavStreamWriter::create(&path, 48_000, 1).unwrap();
        w.write_f32(&samples).unwrap();
        w.finalize().unwrap();

        let b = std::fs::read(&path).unwrap();
        assert_eq!(read_u32(&b, 40) as usize, samples.len() * 4);
        let last = read_f32(&b, 44 + (samples.len() - 1) * 4);
        assert_eq!(last, samples[samples.len() - 1]);
    }
}
