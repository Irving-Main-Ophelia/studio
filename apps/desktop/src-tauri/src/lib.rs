//! Stockhausen desktop — native (Rust) core.
//!
//! The native side handles low-latency audio I/O, MIDI I/O, filesystem,
//! and on-device ML inference. The UI lives in the WebView via React.

use serde::Serialize;
use tracing::info;

mod audio;
mod commands;
mod persistence;
mod rubberband;

use audio::AudioMeter;

#[derive(Serialize)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub phase: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "Stockhausen",
        version: env!("CARGO_PKG_VERSION"),
        phase: "1",
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
        .invoke_handler(tauri::generate_handler![
            app_info,
            commands::ping,
            commands::open_score_file,
            commands::start_input_meter,
            commands::stop_input_meter,
            commands::input_meter_status,
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
