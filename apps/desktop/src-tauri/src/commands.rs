//! Tauri command handlers exposed to the React UI.
//!
//! Phase 0 surface:
//! - `ping` — sanity check.
//! - `open_score_file` — native open dialog + read text file (used by File→Open).
//! - `start_input_meter` / `stop_input_meter` — CPAL audio input level meter.
//!
//! Phase 5 (M5.0, B1):
//! - `start_recording` / `stop_recording` / `recording_status` — native CPAL
//!   capture to a WAV take in the project's `takes/` (ADR-0022).

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::audio::{AudioMeter, MeterStartResponse};
use crate::recorder::{AudioRecorder, RecordOptions, RecordStartResponse, RecordSummary};

#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}

#[derive(Serialize)]
pub struct OpenedScore {
    pub filename: String,
    pub musicxml: String,
}

/// Open a native file picker for MusicXML files; read the chosen file as text.
/// Returns `None` if the user cancelled.
#[tauri::command]
pub async fn open_score_file(app: AppHandle) -> Result<Option<OpenedScore>, String> {
    let path_opt = app
        .dialog()
        .file()
        .add_filter("MusicXML", &["musicxml", "xml", "mxl"])
        .blocking_pick_file();

    let Some(path) = path_opt else {
        return Ok(None);
    };

    let Some(real_path) = path.as_path() else {
        return Err("Could not resolve the picked file path.".to_string());
    };

    let filename = real_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "score.musicxml".to_string());

    let bytes = fs::read(real_path).map_err(|e| format!("read error: {e}"))?;
    let musicxml = String::from_utf8(bytes).map_err(|e| format!("utf-8 error: {e}"))?;

    Ok(Some(OpenedScore { filename, musicxml }))
}

#[tauri::command]
pub fn start_input_meter(
    app: AppHandle,
    meter: State<'_, AudioMeter>,
) -> Result<MeterStartResponse, String> {
    meter.start(app)
}

#[tauri::command]
pub fn stop_input_meter(meter: State<'_, AudioMeter>) -> Result<(), String> {
    meter.stop()
}

#[tauri::command]
pub fn input_meter_status(meter: State<'_, AudioMeter>) -> serde_json::Value {
    serde_json::json!({
        "running": meter.is_running(),
        "device": meter.device(),
    })
}

#[derive(Deserialize)]
pub struct StartRecordingArgs {
    /// The project folder; the take lands in `<project_path>/takes/`.
    pub project_path: PathBuf,
    /// Count-in / punch window (Phase-5 B1). Omitted ⇒ record everything.
    #[serde(default)]
    pub options: RecordOptions,
}

/// Start a native CPAL recording into a new take under the project's `takes/`.
#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    recorder: State<'_, AudioRecorder>,
    args: StartRecordingArgs,
) -> Result<RecordStartResponse, String> {
    recorder.start(app, args.project_path.join("takes"), args.options)
}

/// Stop the active recording and return the finished take's metadata.
#[tauri::command]
pub fn stop_recording(recorder: State<'_, AudioRecorder>) -> Result<RecordSummary, String> {
    recorder.stop()
}

#[tauri::command]
pub fn recording_status(recorder: State<'_, AudioRecorder>) -> serde_json::Value {
    serde_json::json!({
        "running": recorder.is_running(),
        "take_id": recorder.active_take(),
    })
}
