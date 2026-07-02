//! Stockhausen desktop — native (Rust) core.
//!
//! The native side handles low-latency audio I/O, MIDI I/O, filesystem,
//! and on-device ML inference. The UI lives in the WebView via React.

use serde::Serialize;
use tracing::info;

mod audio;
mod commands;
mod persistence;
mod recorder;
mod rubberband;

use audio::AudioMeter;
use recorder::AudioRecorder;

/// Native app identity. `name` + `version` are authoritative for the built binary
/// (version from `Cargo.toml`). The roadmap **phase** is intentionally NOT here —
/// it lives in one place, the WebView's `src/lib/appInfo.ts` (`APP_PHASE`), so the
/// phase string never drifts between Rust and TS. Reconciled June 27, 2026 (M3.5.0).
#[derive(Serialize)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "Stockhausen",
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("Stockhausen desktop starting");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AudioMeter::default())
        .manage(AudioRecorder::default())
        .invoke_handler(tauri::generate_handler![
            app_info,
            commands::ping,
            commands::open_score_file,
            commands::start_input_meter,
            commands::stop_input_meter,
            commands::input_meter_status,
            commands::start_recording,
            commands::stop_recording,
            commands::recording_status,
            persistence::project_new,
            persistence::project_open,
            persistence::project_open_dialog,
            persistence::project_save,
            persistence::project_close,
            persistence::project_recent_list,
            persistence::project_recent_forget,
            persistence::project_default_root,
            rubberband::rubberband_stretch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
