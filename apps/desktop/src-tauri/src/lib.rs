//! Stockhausen desktop — native (Rust) core.
//!
//! The native side handles low-latency audio I/O, MIDI I/O, filesystem,
//! and on-device ML inference. The UI lives in the WebView via React.

use serde::Serialize;
use tracing::info;

mod commands;

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
        phase: "0",
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
        .invoke_handler(tauri::generate_handler![
            app_info,
            commands::ping
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
