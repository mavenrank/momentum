//! The Tauri shell around the Momentum planner.
//!
//! Deliberately thin. The planner is the same web app the browser build ships;
//! all this process adds is a window, a real filesystem, and no origin scoping.
//! Storage logic lives in the frontend (`src/lib/persistence/tauriRepository.ts`)
//! and talks to disk through the fs plugin, so there is no Rust-side schema to
//! keep in step with the TypeScript one.

use tauri_plugin_fs::FsExt;

/// Widens the fs scope to cover a folder the user chose for their data.
///
/// The static capability only grants the app-data directory, which is the right
/// default — but pointing the store at a synced folder is the entire reason this
/// shell exists, and that folder cannot be known at build time. The frontend
/// calls this with the configured root before it reads or writes anything there.
///
/// This is not a hole in the sandbox so much as the user's own choice being
/// honoured: the path arrives from a native folder picker or from a settings
/// file inside the app-data directory that only this app writes.
#[tauri::command]
fn allow_data_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Reading and writing the planner store.
        .plugin(tauri_plugin_fs::init())
        // Only used for "choose a different data folder" in the Data view.
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![allow_data_dir])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
