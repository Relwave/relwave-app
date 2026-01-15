#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod devtools;

use bridge::{bridge_restart, bridge_status, bridge_write, BridgeProcess};
use devtools::{close_devtools, is_devtools_open, navigate_back, navigate_forward, open_devtools, reload_webview};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
