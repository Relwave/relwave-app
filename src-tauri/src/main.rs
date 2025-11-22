#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command, Stdio};
use std::io::{BufRead, BufReader, Write};
use std::sync::{Arc, Mutex};
use std::path::Path;
use tauri::{Manager, State, Emitter};

struct BridgeProcess(Arc<Mutex<Option<Child>>>);

#[tauri::command]
fn bridge_write(data: String, state: State<'_, BridgeProcess>) -> Result<(), String> {
  let guard = state.0.lock().unwrap();
  if let Some(child) = guard.as_ref() {
    if let Some(stdin) = child.stdin.as_ref() {
      let mut handle = stdin;
      handle.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
      handle.write_all(b"\n").map_err(|e| e.to_string())?;
      handle.flush().map_err(|e| e.to_string())?;
      return Ok(());
    } else {
      return Err("bridge stdin missing".into());
    }
  }
  Err("bridge not available".into())
}

/// Try to spawn program with args and return Child or an error message (string).
fn try_spawn(program: &str, args: &[&str]) -> Result<Child, String> {
  eprintln!("tauri: attempting to spawn: {} {}", program, args.join(" "));
  let mut cmd = Command::new(program);
  for a in args { cmd.arg(a); }
  cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
  match cmd.spawn() {
    Ok(child) => Ok(child),
    Err(e) => Err(format!("failed to spawn '{}': {}", program, e)),
  }
}

/// Resolve candidate bridge paths and try spawn strategies in order.
/// Returns Ok(child) if any strategy succeeds, otherwise Err(msg).
fn spawn_bridge_process() -> Result<Child, String> {
  // 1) BRIDGE_DEV_CMD override
  if let Ok(cmdline) = std::env::var("BRIDGE_DEV_CMD") {
    let parts: Vec<&str> = cmdline.split_whitespace().collect();
    if !parts.is_empty() {
      let prog = parts[0];
      let args: Vec<&str> = parts.iter().skip(1).copied().collect();
      match try_spawn(prog, &args) {
        Ok(c) => return Ok(c),
        Err(e) => eprintln!("tauri: BRIDGE_DEV_CMD spawn failed: {}", e),
      }
    }
  }

  // 2) Prefer built JS in ./bridge/dist/index.js (inside project)
  let cand_local = Path::new("bridge").join("dist").join("index.js");
  if cand_local.exists() {
    if let Ok(abs) = cand_local.canonicalize() {
      match try_spawn("node", &[abs.to_str().unwrap()]) {
        Ok(c) => return Ok(c),
        Err(e) => eprintln!("tauri: node spawn failed for local dist: {}", e),
      }
    }
  }

  // 3) Check sibling ../bridge/dist/index.js (if bridge lives outside)
  let cand_parent = Path::new("..").join("bridge").join("dist").join("index.js");
  if cand_parent.exists() {
    if let Ok(abs) = cand_parent.canonicalize() {
      match try_spawn("node", &[abs.to_str().unwrap()]) {
        Ok(c) => return Ok(c),
        Err(e) => eprintln!("tauri: node spawn failed for parent dist: {}", e),
      }
    }
  }

  // 4) Try pnpm --prefix bridge dev (windows aware)
  #[cfg(target_os = "windows")]
  {
    // Use cmd /C to run a composite command in windows shell context
    match try_spawn("cmd", &["/C", "pnpm", "--prefix", "bridge", "dev"]) {
      Ok(c) => return Ok(c),
      Err(e) => eprintln!("tauri: pnpm spawn (local) failed: {}", e),
    }
    // also try parent prefix
    match try_spawn("cmd", &["/C", "pnpm", "--prefix", "..\\bridge", "dev"]) {
      Ok(c) => return Ok(c),
      Err(e) => eprintln!("tauri: pnpm spawn (parent) failed: {}", e),
    }
  }
  #[cfg(not(target_os = "windows"))]
  {
    match try_spawn("pnpm", &["--prefix", "bridge", "dev"]) {
      Ok(c) => return Ok(c),
      Err(e) => eprintln!("tauri: pnpm spawn (local) failed: {}", e),
    }
    match try_spawn("pnpm", &["--prefix", "../bridge", "dev"]) {
      Ok(c) => return Ok(c),
      Err(e) => eprintln!("tauri: pnpm spawn (parent) failed: {}", e),
    }
  }

  Err("All bridge spawn attempts failed. Ensure BRIDGE_DEV_CMD, pnpm or node is available and bridge/dist/index.js exists.".into())
}

/// Spawn the bridge and connect its stdout/stderr to events for the frontend.
fn spawn_bridge(app_handle: tauri::AppHandle) -> Result<Child, String> {
  let mut child = spawn_bridge_process()?;
  // log pid
  eprintln!("tauri: spawned bridge pid {}", child.id());

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
          eprintln!("tauri: bridge attached to app state");
          Ok(())
        }
        Err(err_msg) => {
          // Log and continue without bridge attached (helpful in dev)
          eprintln!("ERROR: could not start bridge: {}", err_msg);
          app.manage(BridgeProcess(Arc::new(Mutex::new(None))));
          Ok(())
        }
      }
    })
    .invoke_handler(tauri::generate_handler![bridge_write])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
