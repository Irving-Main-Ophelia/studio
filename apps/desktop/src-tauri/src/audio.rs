//! Phase 0 audio input meter — CPAL → Tauri event stream.
//!
//! Opens the default macOS input device, computes an RMS-based peak each
//! ~33 ms, and emits an `audio:meter` event with `{ peak: f32, rms: f32 }`.
//!
//! This is *metering only* — it never keeps the samples. Real capture (the
//! ringbuffer → WAV take path) lives in its sibling [`crate::recorder`]
//! (Phase-5 B1, ADR-0022); the two share the same CPAL device-open idiom.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};

#[derive(Default)]
pub struct AudioMeter {
    stop: Arc<AtomicBool>,
    handle: std::sync::Mutex<Option<JoinHandle<()>>>,
    device_name: std::sync::Mutex<Option<String>>,
}

#[derive(Serialize, Clone, Default)]
pub struct MeterEvent {
    pub peak: f32,
    pub rms: f32,
    pub device: String,
}

#[derive(Serialize)]
pub struct MeterStartResponse {
    pub device: String,
    pub sample_rate: u32,
    pub channels: u16,
}

impl AudioMeter {
    pub fn start(&self, app: AppHandle) -> Result<MeterStartResponse, String> {
        if self.handle.lock().unwrap().is_some() {
            return Err("Input meter is already running.".to_string());
        }

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

        info!(
            "Starting input meter on {} @ {} Hz, {} ch, {:?}",
            device_name, sample_rate, channels, sample_format
        );

        let stop = self.stop.clone();
        stop.store(false, Ordering::Relaxed);
        let device_name_for_state = device_name.clone();
        let device_name_for_thread = device_name.clone();

        let handle = thread::Builder::new()
            .name("stockhausen-audio-meter".to_string())
            .spawn(move || {
                if let Err(e) = run_meter(
                    app,
                    device,
                    stream_config,
                    sample_format,
                    device_name_for_thread,
                    stop,
                ) {
                    warn!("audio meter thread exited with error: {e}");
                }
            })
            .map_err(|e| format!("Could not spawn audio thread: {e}"))?;

        *self.handle.lock().unwrap() = Some(handle);
        *self.device_name.lock().unwrap() = Some(device_name_for_state.clone());

        Ok(MeterStartResponse {
            device: device_name_for_state,
            sample_rate,
            channels,
        })
    }

    pub fn stop(&self) -> Result<(), String> {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.lock().unwrap().take() {
            let _ = handle.join();
        }
        *self.device_name.lock().unwrap() = None;
        info!("input meter stopped");
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.handle.lock().unwrap().is_some()
    }

    pub fn device(&self) -> Option<String> {
        self.device_name.lock().unwrap().clone()
    }
}

fn run_meter(
    app: AppHandle,
    device: cpal::Device,
    config: StreamConfig,
    sample_format: SampleFormat,
    device_name: String,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    let acc = Arc::new(parking_window::Window::default());

    let err_fn = |err| warn!("CPAL stream error: {err}");
    let acc_for_cb = acc.clone();
    let stream = match sample_format {
        SampleFormat::F32 => device
            .build_input_stream(
                &config,
                move |data: &[f32], _| acc_for_cb.feed_f32(data),
                err_fn,
                None,
            )
            .map_err(|e| format!("CPAL build_input_stream (f32) failed: {e}"))?,
        SampleFormat::I16 => device
            .build_input_stream(
                &config,
                move |data: &[i16], _| acc_for_cb.feed_i16(data),
                err_fn,
                None,
            )
            .map_err(|e| format!("CPAL build_input_stream (i16) failed: {e}"))?,
        SampleFormat::U16 => device
            .build_input_stream(
                &config,
                move |data: &[u16], _| acc_for_cb.feed_u16(data),
                err_fn,
                None,
            )
            .map_err(|e| format!("CPAL build_input_stream (u16) failed: {e}"))?,
        other => return Err(format!("Unsupported sample format: {other:?}")),
    };

    stream
        .play()
        .map_err(|e| format!("CPAL stream play failed: {e}"))?;

    let tick = Duration::from_millis(33);
    let mut last = Instant::now();
    while !stop.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(5));
        if last.elapsed() < tick {
            continue;
        }
        last = Instant::now();
        let (peak, rms) = acc.drain();
        let _ = app.emit(
            "audio:meter",
            MeterEvent {
                peak,
                rms,
                device: device_name.clone(),
            },
        );
    }
    drop(stream);
    Ok(())
}

/// A small accumulator window updated from the CPAL callback thread.
mod parking_window {
    use std::sync::Mutex;

    #[derive(Default)]
    pub struct Window {
        inner: Mutex<Acc>,
    }

    #[derive(Default)]
    struct Acc {
        sum_sq: f64,
        count: u64,
        peak: f32,
    }

    impl Window {
        pub fn feed_f32(&self, data: &[f32]) {
            let mut acc = self.inner.lock().unwrap();
            for s in data {
                let v = s.abs();
                if v > acc.peak {
                    acc.peak = v;
                }
                acc.sum_sq += (*s as f64) * (*s as f64);
                acc.count += 1;
            }
        }

        pub fn feed_i16(&self, data: &[i16]) {
            let mut acc = self.inner.lock().unwrap();
            for s in data {
                let f = (*s as f32) / i16::MAX as f32;
                let v = f.abs();
                if v > acc.peak {
                    acc.peak = v;
                }
                acc.sum_sq += (f as f64) * (f as f64);
                acc.count += 1;
            }
        }

        pub fn feed_u16(&self, data: &[u16]) {
            let mut acc = self.inner.lock().unwrap();
            for s in data {
                let f = ((*s as f32) - (u16::MAX as f32 / 2.0)) / (u16::MAX as f32 / 2.0);
                let v = f.abs();
                if v > acc.peak {
                    acc.peak = v;
                }
                acc.sum_sq += (f as f64) * (f as f64);
                acc.count += 1;
            }
        }

        pub fn drain(&self) -> (f32, f32) {
            let mut acc = self.inner.lock().unwrap();
            let rms = if acc.count > 0 {
                (acc.sum_sq / acc.count as f64).sqrt() as f32
            } else {
                0.0
            };
            let peak = acc.peak;
            acc.peak = 0.0;
            acc.sum_sq = 0.0;
            acc.count = 0;
            (peak, rms)
        }
    }
}
