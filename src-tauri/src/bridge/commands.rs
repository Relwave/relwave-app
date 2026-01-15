use std::io::Write;
use tauri::State;

use super::process::{spawn_bridge, BridgeProcess};

/// Write data to the bridge process stdin
#[tauri::command]
pub fn bridge_write(data: String, state: State<'_, BridgeProcess>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    
    let child = guard.as_mut().ok_or("bridge not available")?;

    // Check if the process is still alive
    match child.try_wait() {
        Ok(Some(status)) => {
            return Err(format!("bridge process exited with status: {:?}", status));
        }
        Ok(None) => {} // Process is still running
        Err(e) => {
            return Err(format!("failed to check bridge status: {}", e));
        }
    }

    let stdin = child.stdin.as_mut().ok_or("bridge stdin missing")?;
    
    stdin.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Restart the bridge process
#[tauri::command]
pub fn bridge_restart(
    app_handle: tauri::AppHandle,
    state: State<'_, BridgeProcess>,
) -> Result<String, String> {
    let mut guard = state.0.lock().unwrap();

    // Kill existing process if any
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    // Spawn new bridge process
    let child = spawn_bridge(app_handle)?;
    *guard = Some(child);
    
    Ok("Bridge restarted successfully".into())
}

/// Check if bridge process is alive
#[tauri::command]
pub fn bridge_status(state: State<'_, BridgeProcess>) -> Result<String, String> {
    let mut guard = state.0.lock().unwrap();
    
    match guard.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(Some(status)) => Ok(format!("exited:{:?}", status)),
            Ok(None) => Ok("running".into()),
            Err(e) => Err(format!("error checking status: {}", e)),
        },
        None => Ok("not_started".into()),
    }
}
