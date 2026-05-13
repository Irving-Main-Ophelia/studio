//! Tauri command handlers exposed to the React UI.
//!
//! As Phase 0 progresses we add: audio meter (Week 3), MIDI ports (Week 3),
//! score I/O (Week 2), and agent IPC proxies (Week 4).

#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}
