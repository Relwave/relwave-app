use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Wrapper for the bridge child process
pub struct BridgeProcess(pub Arc<Mutex<Option<Child>>>);

impl BridgeProcess {
    pub fn new(child: Option<Child>) -> Self {
        Self(Arc::new(Mutex::new(child)))
    }
}

/// Try to spawn a program with args and return Child or an error message
fn try_spawn(program: &str, args: &[&str]) -> Result<Child, String> {
    let mut cmd = Command::new(program);
    for a in args {
        cmd.arg(a);
    }
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd.spawn()
        .map_err(|e| format!("failed to spawn '{}': {}", program, e))
}

fn try_spawn_with_env(program: &str, args: &[&str], envs: &[(&str, &str)]) -> Result<Child, String> {
    let mut cmd = Command::new(program);
    for a in args {
        cmd.arg(a);
    }
    for (key, value) in envs {
        cmd.env(key, value);
    }
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd.spawn()
        .map_err(|e| format!("failed to spawn '{}': {}", program, e))
}

/// Get the resource directory path for bundled resources
fn get_resource_path(app_handle: &AppHandle) -> Option<PathBuf> {
    app_handle.path().resource_dir().ok()
}

/// Get the directory where the executable is located
fn get_exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

fn find_sqlite_native_binding(base_dir: &Path) -> Option<PathBuf> {
    let mut candidates = vec![
        base_dir.join("better_sqlite3.node"),
        base_dir.join("bridge").join("better_sqlite3.node"),
        base_dir.join("resources").join("better_sqlite3.node"),
        base_dir.join("Resources").join("better_sqlite3.node"),
        base_dir.join("_up_").join("better_sqlite3.node"),
        base_dir.join("_up_").join("bridge").join("better_sqlite3.node"),
        base_dir.join("_up_").join("resources").join("better_sqlite3.node"),
    ];

    if let Some(parent) = base_dir.parent() {
        candidates.extend([
            parent.join("better_sqlite3.node"),
            parent.join("resources").join("better_sqlite3.node"),
            parent.join("Resources").join("better_sqlite3.node"),
            parent.join("_up_").join("better_sqlite3.node"),
            parent.join("_up_").join("resources").join("better_sqlite3.node"),
        ]);
    }

    candidates.into_iter().find(|p| p.exists())
}

/// Resolve candidate bridge paths and try spawn strategies in order
fn spawn_bridge_process(app_handle: &AppHandle) -> Result<Child, String> {
    // 1) BRIDGE_DEV_CMD override (for development/testing)
    if let Ok(cmdline) = std::env::var("BRIDGE_DEV_CMD") {
        let parts: Vec<&str> = cmdline.split_whitespace().collect();
        if !parts.is_empty() {
            let prog = parts[0];
            let args: Vec<&str> = parts.iter().skip(1).copied().collect();
            if let Ok(c) = try_spawn(prog, &args) {
                return Ok(c);
            }
        }
    }

    // --- Development: prefer Node scripts over pkg binaries ---
    // In debug builds, Tauri copies the pkg-compiled bridge binary from
    // externalBin into target/debug/. That binary cannot load native modules
    // (e.g. better-sqlite3), so we must find and run the Node script first.
    #[cfg(debug_assertions)]
    {
        // Try local development path ./bridge/dist
        if let Some(child) = try_local_dev_path() {
            return Ok(child);
        }

        // Check ../../bridge/dist (two levels up from target/debug)
        if let Some(child) = try_parent_dev_path() {
            return Ok(child);
        }

        // Try bundled scripts in resource directory
        if let Some(resource_path) = get_resource_path(app_handle) {
            if let Some(child) = try_bundled_scripts(&resource_path) {
                return Ok(child);
            }
        }

        // Try scripts in exe directory
        if let Some(exe_dir) = get_exe_dir() {
            if let Some(child) = try_exe_dir_scripts(&exe_dir) {
                return Ok(child);
            }
        }

        // Try pnpm dev as last resort
        if let Some(child) = try_pnpm_dev() {
            return Ok(child);
        }
    }

    // --- Production: prefer bundled binaries ---
    #[cfg(not(debug_assertions))]
    {
        // Try bundled bridge executable (compiled with pkg)
        if let Some(resource_path) = get_resource_path(app_handle) {
            if let Some(child) = try_bundled_exe(&resource_path) {
                return Ok(child);
            }
            if let Some(child) = try_bundled_scripts(&resource_path) {
                return Ok(child);
            }
        }

        // Try exe directory (works for deb/appimage on Linux)
        if let Some(exe_dir) = get_exe_dir() {
            if let Some(child) = try_exe_dir_binary(&exe_dir) {
                return Ok(child);
            }
            if let Some(child) = try_exe_dir_scripts(&exe_dir) {
                return Ok(child);
            }
        }

        // Fallback to local dev paths
        if let Some(child) = try_local_dev_path() {
            return Ok(child);
        }
        if let Some(child) = try_parent_dev_path() {
            return Ok(child);
        }
    }

    Err(
        "All bridge spawn attempts failed. \
        For production: ensure bridge files are bundled and Node.js is installed. \
        For development: ensure bridge/dist/index.cjs or index.js exists. \
        Try setting BRIDGE_DEV_CMD environment variable."
            .into(),
    )
}

#[cfg(not(debug_assertions))]
fn try_bundled_exe(resource_path: &Path) -> Option<Child> {
    // Try platform-specific binary names first
    #[cfg(target_os = "windows")]
    let bridge_candidates = vec![
        resource_path.join("bridge-x86_64-pc-windows-msvc.exe"),
        resource_path.join("bridge.exe"),
    ];
    #[cfg(target_os = "linux")]
    let bridge_candidates = vec![
        resource_path.join("bridge-x86_64-unknown-linux-gnu"),
        resource_path.join("bridge"),
    ];
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    let bridge_candidates = vec![
        resource_path.join("bridge"),
    ];

    for bridge_exe in bridge_candidates {
        if bridge_exe.exists() {
            if let Some(exe_str) = bridge_exe.to_str() {
                let binding_path = find_sqlite_native_binding(resource_path);
                let result = if let Some(binding) = binding_path.as_ref().and_then(|p| p.to_str()) {
                    try_spawn_with_env(exe_str, &[], &[("RELWAVE_SQLITE_NATIVE_BINDING", binding)])
                } else {
                    try_spawn(exe_str, &[])
                };
                if let Ok(c) = result {
                    return Some(c);
                }
            }
        }
    }

    // Check _up_ directory
    #[cfg(target_os = "windows")]
    let bridge_exe_up = resource_path.join("_up_").join("bridge-x86_64-pc-windows-msvc.exe");
    #[cfg(not(target_os = "windows"))]
    let bridge_exe_up = resource_path.join("_up_").join("bridge");

    if bridge_exe_up.exists() {
        if let Some(exe_str) = bridge_exe_up.to_str() {
            let binding_path = find_sqlite_native_binding(&resource_path.join("_up_"));
            let result = if let Some(binding) = binding_path.as_ref().and_then(|p| p.to_str()) {
                try_spawn_with_env(exe_str, &[], &[("RELWAVE_SQLITE_NATIVE_BINDING", binding)])
            } else {
                try_spawn(exe_str, &[])
            };
            if let Ok(c) = result {
                return Some(c);
            }
        }
    }

    None
}

fn try_bundled_scripts(resource_path: &Path) -> Option<Child> {
    let search_paths = [
        resource_path.join("bridge").join("dist"),
        resource_path.to_path_buf(),
        resource_path.join("_up_").join("bridge").join("dist"),
    ];

    for base_path in &search_paths {
        for ext in &["cjs", "js"] {
            let script = base_path.join(format!("index.{}", ext));
            if script.exists() {
                if let Some(script_str) = script.to_str() {
                    if let Ok(c) = try_spawn("node", &[script_str]) {
                        return Some(c);
                    }
                }
            }
        }
    }

    None
}

fn try_exe_dir_scripts(exe_dir: &Path) -> Option<Child> {
    let search_paths = [
        exe_dir.join("bridge").join("dist"),
        exe_dir.join("_up_").join("bridge").join("dist"),
    ];

    for base_path in &search_paths {
        for ext in &["cjs", "js"] {
            let script = base_path.join(format!("index.{}", ext));
            if script.exists() {
                if let Some(script_str) = script.to_str() {
                    if let Ok(c) = try_spawn("node", &[script_str]) {
                        return Some(c);
                    }
                }
            }
        }
    }

    None
}

/// Try to find and spawn bridge binary in the exe directory (for Linux deb/appimage and Windows)
#[cfg(not(debug_assertions))]
fn try_exe_dir_binary(exe_dir: &Path) -> Option<Child> {
    // Platform-specific binary names to search for
    #[cfg(target_os = "windows")]
    let binary_names = vec![
        "bridge-x86_64-pc-windows-msvc.exe",
        "bridge.exe",
        "_up_/bridge-x86_64-pc-windows-msvc.exe",
        "_up_/bridge.exe",
    ];
    #[cfg(target_os = "linux")]
    let binary_names = vec![
        "bridge-x86_64-unknown-linux-gnu",
        "bridge",
        "_up_/bridge-x86_64-unknown-linux-gnu",
        "_up_/bridge",
    ];
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    let binary_names = vec![
        "bridge",
        "_up_/bridge",
    ];

    for name in binary_names {
        let exe_path = exe_dir.join(name);
        if exe_path.exists() {
            if let Some(exe_str) = exe_path.to_str() {
                let binding_base = if name.starts_with("_up_") {
                    exe_dir.join("_up_")
                } else {
                    exe_dir.to_path_buf()
                };
                let binding_path = find_sqlite_native_binding(&binding_base);
                let result = if let Some(binding) = binding_path.as_ref().and_then(|p| p.to_str()) {
                    try_spawn_with_env(exe_str, &[], &[("RELWAVE_SQLITE_NATIVE_BINDING", binding)])
                } else {
                    try_spawn(exe_str, &[])
                };
                if let Ok(c) = result {
                    return Some(c);
                }
            }
        }
    }

    None
}

fn try_local_dev_path() -> Option<Child> {
    for ext in &["cjs", "js"] {
        let cand = Path::new("bridge").join("dist").join(format!("index.{}", ext));
        if cand.exists() {
            if let Ok(abs) = cand.canonicalize() {
                if let Some(abs_str) = abs.to_str() {
                    if let Ok(c) = try_spawn("node", &[abs_str]) {
                        return Some(c);
                    }
                }
            }
        }
    }
    None
}

fn try_parent_dev_path() -> Option<Child> {
    for ext in &["cjs", "js"] {
        let cand = Path::new("..")
            .join("..")
            .join("bridge")
            .join("dist")
            .join(format!("index.{}", ext));

        if cand.exists() {
            if let Ok(abs) = cand.canonicalize() {
                if let Some(abs_str) = abs.to_str() {
                    if let Ok(c) = try_spawn("node", &[abs_str]) {
                        return Some(c);
                    }
                }
            }
        }
    }
    None
}

#[cfg(debug_assertions)]
fn try_pnpm_dev() -> Option<Child> {
    #[cfg(target_os = "windows")]
    {
        try_spawn("cmd", &["/C", "pnpm", "--prefix", "..\\bridge", "dev"]).ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        try_spawn("pnpm", &["--prefix", "../bridge", "dev"]).ok()
    }
}

/// Spawn the bridge and connect stdout/stderr to Tauri events
pub fn spawn_bridge(app_handle: AppHandle) -> Result<Child, String> {
    let mut child = spawn_bridge_process(&app_handle)?;

    // Forward stdout to "bridge-stdout" events
    if let Some(stdout) = child.stdout.take() {
        let ah = app_handle.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let _ = ah.emit("bridge-stdout", line);
            }
        });
    }

    // Forward stderr to "bridge-stderr" events
    if let Some(stderr) = child.stderr.take() {
        let ah = app_handle.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = ah.emit("bridge-stderr", line);
            }
        });
    }

    Ok(child)
}
