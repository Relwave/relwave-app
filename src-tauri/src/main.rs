#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod devtools;

use bridge::{bridge_restart, bridge_status, bridge_write, BridgeProcess};
use devtools::{close_devtools, is_devtools_open, navigate_back, navigate_forward, open_devtools, reload_webview};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let child = bridge::init(handle);
            app.manage(BridgeProcess::new(child));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bridge_write,
            bridge_restart,
            bridge_status,
            open_devtools,
            close_devtools,
            is_devtools_open,
            reload_webview,
            navigate_back,
            navigate_forward
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Kill bridge process on app exit to prevent orphaned processes
                if let Some(state) = app_handle.try_state::<BridgeProcess>() {
                    let mut guard = state.0.lock().unwrap();
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}
