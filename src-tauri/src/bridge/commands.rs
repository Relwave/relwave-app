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

pub fn kill_bridge_child(state: &BridgeProcess) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            #[cfg(target_os = "windows")]
            {
                let pid = child.id();
                // 1. Instantly terminate all processes in the Windows Job Object (<1ms)
                super::process::job::terminate_job();
                // 2. Terminate the child handle directly
                let _ = child.kill();

                // 3. Fallback taskkill in a background thread without blocking the UI/main thread
                std::thread::spawn(move || {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    let _ = std::process::Command::new("taskkill")
                        .args(["/F", "/T", "/PID", &pid.to_string()])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();
                });
            }

            #[cfg(not(target_os = "windows"))]
            {
                let _ = child.kill();
            }

            let _ = child.wait();
        }
    }
}

/// Kill the bridge process and wait for it to fully exit.
/// Called before applying an update so the bridge releases file handles on
/// bundled resources (e.g. better_sqlite3.node) before the installer overwrites them.
#[tauri::command]
pub fn bridge_kill(state: State<'_, BridgeProcess>) -> Result<(), String> {
    kill_bridge_child(&state);
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
