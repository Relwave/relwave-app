mod process;
mod commands;

pub use process::BridgeProcess;
pub use commands::{bridge_write, bridge_restart, bridge_status};

use tauri::AppHandle;
use std::process::Child;

/// Initialize and spawn the bridge process
pub fn init(app_handle: AppHandle) -> Option<Child> {
    match process::spawn_bridge(app_handle) {
        Ok(child) => Some(child),
        Err(e) => {
            eprintln!("Failed to spawn bridge: {}", e);
            None
        }
    }
}
