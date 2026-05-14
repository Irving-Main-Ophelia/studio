//! Rubber Band integration scaffold (M1.2).
//!
//! Music analogy: Rubber Band is the studio engineer who can stretch a
//! recording without making it sound chipmunk-y — change the tempo while
//! keeping the pitch intact. We expose the operation as a Rust function
//! that takes interleaved 32-bit float audio and a tempo ratio, and we
//! plan to back it with the GPL Rubber Band C++ library bound through an
//! FFI bridge (M1.2 extended scope).
//!
//! For Phase-1 M1.2 we ship the *interface* — the same Tauri command the
//! UI / WAV exporter will call from M1.5. The implementation today is a
//! no-op fallback that just emits the original samples, with a structured
//! log line explaining why. This keeps the wiring honest: the frontend
//! never has to special-case "rubber band missing"; the exporter will
//! always produce a WAV — it just won't be tempo-stretched until the C++
//! bridge lands.
//!
//! When the GPL bridge lands (ADR-0010 extension, post-Phase-1) it will
//! drop in here without touching the Tauri surface above.

use serde::{Deserialize, Serialize};
use tracing::warn;

/// Sample-rate / channel description for an interleaved-f32 buffer.
#[derive(Debug, Clone, Deserialize)]
pub struct AudioBufferIn {
    pub samples: Vec<f32>,
    pub channels: u16,
    pub sample_rate: u32,
    /// Multiplier applied to duration: 1.0 = unchanged, 0.5 = half speed.
    pub time_ratio: f32,
    /// Multiplier applied to pitch in semitones: 0.0 = unchanged.
    pub pitch_semitones: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioBufferOut {
    pub samples: Vec<f32>,
    pub channels: u16,
    pub sample_rate: u32,
    /// Set to `true` when the GPL bridge actually performed time/pitch
    /// stretching; `false` means we returned the input unchanged.
    pub stretched: bool,
}

/// Stretch a buffer in time and / or pitch.
///
/// Phase-1 M1.2 fallback: returns the buffer untouched and logs a warning
/// when a non-trivial ratio was requested. The frontend should treat
/// `stretched == false && time_ratio != 1.0` as "feature not yet built"
/// rather than as an error.
#[tauri::command]
pub fn rubberband_stretch(input: AudioBufferIn) -> Result<AudioBufferOut, String> {
    let non_trivial =
        (input.time_ratio - 1.0).abs() > f32::EPSILON || input.pitch_semitones.abs() > f32::EPSILON;

    if non_trivial {
        warn!(
            "rubberband_stretch called with time_ratio={}, pitch_semitones={} but the \
             GPL bridge is not yet linked into this build; returning the input unchanged. \
             Track progress via ADR-0010.",
            input.time_ratio, input.pitch_semitones
        );
    }

    Ok(AudioBufferOut {
        samples: input.samples,
        channels: input.channels,
        sample_rate: input.sample_rate,
        stretched: false,
    })
}

/* ---------------------- Tests ----------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_passthrough() {
        let buf = AudioBufferIn {
            samples: vec![0.1, -0.2, 0.3, -0.4],
            channels: 2,
            sample_rate: 48_000,
            time_ratio: 1.0,
            pitch_semitones: 0.0,
        };
        let out = rubberband_stretch(buf).unwrap();
        assert_eq!(out.samples, vec![0.1, -0.2, 0.3, -0.4]);
        assert!(!out.stretched);
        assert_eq!(out.channels, 2);
        assert_eq!(out.sample_rate, 48_000);
    }

    #[test]
    fn stretch_returns_unchanged_with_flag_set_false() {
        // Until the GPL bridge ships, even non-trivial requests return the
        // identity buffer with `stretched=false`.
        let buf = AudioBufferIn {
            samples: vec![0.0; 1024],
            channels: 1,
            sample_rate: 44_100,
            time_ratio: 0.5,
            pitch_semitones: 0.0,
        };
        let out = rubberband_stretch(buf).unwrap();
        assert_eq!(out.samples.len(), 1024);
        assert!(!out.stretched);
    }
}
