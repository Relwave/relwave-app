#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command, Stdio};
use std::io::{BufRead, BufReader, Write};
use std::sync::{Arc, Mutex};
use std::path::{Path, PathBuf};
use tauri::{Manager, State, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct BridgeProcess(Arc<Mutex<Option<Child>>>);

#[tauri::command]
fn bridge_write(data: String, state: State<'_, BridgeProcess>) -> Result<(), String> {
  let mut guard = state.0.lock().unwrap();
  if let Some(child) = guard.as_mut() {
    if let Some(stdin) = child.stdin.as_mut() {
      stdin.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
      stdin.write_all(b"\n").map_err(|e| e.to_string())?;
      stdin.flush().map_err(|e| e.to_string())?;
      return Ok(());
    } else {
      return Err("bridge stdin missing".into());
    }
  }
  Err("bridge not available".into())
}

/// Try to spawn program with args and return Child or an error message (string).
fn try_spawn(program: &str, args: &[&str]) -> Result<Child, String> {
  let mut cmd = Command::new(program);
  for a in args { cmd.arg(a); }
  cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
  
  // Hide console window on Windows
  #[cfg(target_os = "windows")]
  cmd.creation_flags(CREATE_NO_WINDOW);
  
  match cmd.spawn() {
    Ok(child) => Ok(child),
    Err(e) => Err(format!("failed to spawn '{}': {}", program, e)),
  }
}

/// Get the resource directory path for bundled resources
fn get_resource_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
  match app_handle.path().resource_dir() {
    Ok(path) => Some(path),
    Err(_) => None
  }
}

/// Get the directory where the executable is located
fn get_exe_dir() -> Option<PathBuf> {
  match std::env::current_exe() {
    Ok(exe_path) => {
      if let Some(exe_dir) = exe_path.parent() {
        return Some(exe_dir.to_path_buf());
      }
      None
    },
    Err(_) => None
  }
}

/// Resolve candidate bridge paths and try spawn strategies in order.
/// Returns Ok(child) if any strategy succeeds, otherwise Err(msg).
fn spawn_bridge_process(app_handle: &tauri::AppHandle) -> Result<Child, String> {
  // 1) BRIDGE_DEV_CMD override (for development/testing)
  if let Ok(cmdline) = std::env::var("BRIDGE_DEV_CMD") {
    let parts: Vec<&str> = cmdline.split_whitespace().collect();
    if !parts.is_empty() {
      let prog = parts[0];
      let args: Vec<&str> = parts.iter().skip(1).copied().collect();
      match try_spawn(prog, &args) {
        Ok(c) => return Ok(c),
        Err(_) => {}
      }
    }
  }

  // 2) Try bundled bridge executable (PRODUCTION - compiled with pkg)
  if let Some(resource_path) = get_resource_path(app_handle) {
    #[cfg(target_os = "windows")]
    let bridge_exe = resource_path.join("bridge.exe");
    #[cfg(not(target_os = "windows"))]
    let bridge_exe = resource_path.join("bridge");

    // check direct resource /bridge.exe
    if bridge_exe.exists() {
      if let Some(exe_str) = bridge_exe.to_str() {
        match try_spawn(exe_str, &[]) {
          Ok(c) => return Ok(c),
          Err(_) => {}
        }
      }
    } else {
      // some installers extract under _up_ - check there as well
      let bridge_exe_up = resource_path.join("_up_").join("bridge.exe");
      if bridge_exe_up.exists() {
        if let Some(exe_str) = bridge_exe_up.to_str() {
          match try_spawn(exe_str, &[]) {
            Ok(c) => return Ok(c),
            Err(_) => {}
          }
        }
      }
    }

    // 2b) Try bundled scripts in resources
    // Check if files are in bridge/dist/ subdirectory
    let bridge_dist = resource_path.join("bridge").join("dist");
    for ext in &["cjs", "js"] {
      let bridge_script = bridge_dist.join(format!("index.{}", ext));
      
      if bridge_script.exists() {
        if let Some(bridge_str) = bridge_script.to_str() {
          match try_spawn("node", &[bridge_str]) {
            Ok(c) => return Ok(c),
            Err(_) => {}
          }
        }
      }
    }
    
    // Also check if files are directly in resources (not in subdirectory)
    for ext in &["cjs", "js"] {
      let bridge_script = resource_path.join(format!("index.{}", ext));
      
      if bridge_script.exists() {
        if let Some(bridge_str) = bridge_script.to_str() {
          match try_spawn("node", &[bridge_str]) {
            Ok(c) => return Ok(c),
            Err(_) => {}
          }
        }
      }
    }

    // Also check resource_dir/_up_/bridge/dist
    let bridge_dist_up = resource_path.join("_up_").join("bridge").join("dist");
    for ext in &["cjs", "js"] {
      let bridge_script = bridge_dist_up.join(format!("index.{}", ext));
      if bridge_script.exists() {
        if let Some(bridge_str) = bridge_script.to_str() {
          match try_spawn("node", &[bridge_str]) {
            Ok(c) => return Ok(c),
            Err(_) => {}
          }
        }
      }
    }
  }

  // 3) Try exe directory (where the .exe is located)
  if let Some(exe_dir) = get_exe_dir() {
    for ext in &["cjs", "js"] {
      let bridge_script = exe_dir.join("bridge").join("dist").join(format!("index.{}", ext));
      
      if bridge_script.exists() {
        if let Some(bridge_str) = bridge_script.to_str() {
          match try_spawn("node", &[bridge_str]) {
            Ok(c) => return Ok(c),
            Err(_) => {}
          }
        }
      }

      // check exe_dir/_up_/bridge/dist
      let bridge_script_up = exe_dir.join("_up_").join("bridge").join("dist").join(format!("index.{}", ext));
      if bridge_script_up.exists() {
        if let Some(bridge_str) = bridge_script_up.to_str() {
          match try_spawn("node", &[bridge_str]) {
            Ok(c) => return Ok(c),
            Err(_) => {}
          }
        }
      }
    }

    // Also try exe_dir/_up_/bridge.exe (native exe in exe location)
    #[cfg(target_os = "windows")]
    {
      let exe_bridge = exe_dir.join("bridge.exe");
      if exe_bridge.exists() {
        if let Some(exe_str) = exe_bridge.to_str() {
          match try_spawn(exe_str, &[]) {
            Ok(c) => return Ok(c),
            Err(_) => {}
          }
        }
      }

      let exe_bridge_up = exe_dir.join("_up_").join("bridge.exe");
      if exe_bridge_up.exists() {
        if let Some(exe_str) = exe_bridge_up.to_str() {
          match try_spawn(exe_str, &[]) {
            Ok(c) => return Ok(c),
            Err(_) => {}
          }
        }
      }
    }
  }

  // 4) Try local development path ./bridge/dist
  for ext in &["cjs", "js"] {
    let cand_local = Path::new("bridge").join("dist").join(format!("index.{}", ext));
    if cand_local.exists() {
      if let Ok(abs) = cand_local.canonicalize() {
        if let Some(abs_str) = abs.to_str() {
          match try_spawn("node", &[abs_str]) {
            Ok(c) => return Ok(c),
            Err(_) => {}
          }
        }
      }
    }
  }

  // 5) Check ../../bridge/dist (two levels up from target/release)
  for ext in &["cjs", "js"] {
    let cand_parent = Path::new("..").join("..").join("bridge").join("dist").join(format!("index.{}", ext));
    
    if cand_parent.exists() {
      if let Ok(abs) = cand_parent.canonicalize() {
        if let Some(abs_str) = abs.to_str() {
          match try_spawn("node", &[abs_str]) {
            Ok(c) => return Ok(c),
            Err(_) => {}
          }
        }
      }
    }
  }

  // 6) Try pnpm --prefix ../../bridge dev (adjusted path)
  // Only try pnpm dev in debug builds (development convenience)
  #[cfg(debug_assertions)]
  {
    #[cfg(target_os = "windows")]
    {
      match try_spawn("cmd", &["/C", "pnpm", "--prefix", "..\\bridge", "dev"]) {
        Ok(c) => return Ok(c),
        Err(_) => {}
      }
    }
    #[cfg(not(target_os = "windows"))]
    {
      match try_spawn("pnpm", &["--prefix", "../bridge", "dev"]) {
        Ok(c) => return Ok(c),
        Err(_) => {}
      }
    }
  }

  let error_msg = "All bridge spawn attempts failed. \
    For production: ensure bridge files are bundled and Node.js is installed. \
    For development: ensure bridge/dist/index.cjs or index.js exists. \
    Try setting BRIDGE_DEV_CMD environment variable.";
  
  Err(error_msg.into())
}

/// Spawn the bridge and connect its stdout/stderr to events for the frontend.
fn spawn_bridge(app_handle: tauri::AppHandle) -> Result<Child, String> {
  let mut child = spawn_bridge_process(&app_handle)?;

  // forward stdout lines to renderer as "bridge-stdout" events
  if let Some(stdout) = child.stdout.take() {
    let ah = app_handle.clone();
    std::thread::spawn(move || {
      let reader = BufReader::new(stdout);
      for line in reader.lines().flatten() {
        let _ = ah.emit("bridge-stdout", line.clone());
      }
    });
  }

  // forward stderr lines to renderer as "bridge-stderr" events
  if let Some(stderr) = child.stderr.take() {
    let ah2 = app_handle.clone();
    std::thread::spawn(move || {
      let reader = BufReader::new(stderr);
      for line in reader.lines().flatten() {
        let _ = ah2.emit("bridge-stderr", line.clone());
      }
    });
  }

  Ok(child)
}

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let handle = app.handle();
      match spawn_bridge(handle.clone()) {
        Ok(child) => {
          app.manage(BridgeProcess(Arc::new(Mutex::new(Some(child)))));
          Ok(())
        }
        Err(_) => {
          // Continue without bridge attached (helpful in dev)
          app.manage(BridgeProcess(Arc::new(Mutex::new(None))));
          Ok(())
        }
      }
    })
    .invoke_handler(tauri::generate_handler![bridge_write])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}