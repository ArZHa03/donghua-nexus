pub mod third_party_paths;
pub mod video_metadata;
pub mod subtitle_info;
pub mod natural_sort;
pub mod ffprobe_runner;
pub mod mpv_ipc_client;
pub mod commands;

use std::sync::Arc;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(commands::mpv_control::MpvState {
            client: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            commands::video_import::import_videos,
            commands::video_import::import_folder,
            commands::mpv_control::mpv_start,
            commands::mpv_control::mpv_load_file,
            commands::mpv_control::mpv_seek,
            commands::mpv_control::mpv_toggle_pause,
            commands::mpv_control::mpv_frame_step,
            commands::mpv_control::mpv_unload,
            commands::mpv_embed::update_mpv_bounds,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
