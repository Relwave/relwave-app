use tauri::{AppHandle, Manager, WebviewWindow};

/// Open the devtools for the main window
#[tauri::command]
pub fn open_devtools(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.open_devtools();
        Ok(())
    } else {
        Err("Main window not found".into())
    }
}

/// Close the devtools for the main window
#[tauri::command]
pub fn close_devtools(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.close_devtools();
        Ok(())
    } else {
        Err("Main window not found".into())
    }
}

/// Check if devtools are open
#[tauri::command]
pub fn is_devtools_open(app_handle: AppHandle) -> Result<bool, String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        Ok(window.is_devtools_open())
    } else {
        Err("Main window not found".into())
    }
}

/// Reload the webview
#[tauri::command]
pub fn reload_webview(window: WebviewWindow) -> Result<(), String> {
    window
        .eval("window.location.reload()")
        .map_err(|e| e.to_string())
}

/// Navigate back in history
#[tauri::command]
pub fn navigate_back(window: WebviewWindow) -> Result<(), String> {
    window
        .eval("window.history.back()")
        .map_err(|e| e.to_string())
}

/// Navigate forward in history
#[tauri::command]
pub fn navigate_forward(window: WebviewWindow) -> Result<(), String> {
    window
        .eval("window.history.forward()")
        .map_err(|e| e.to_string())
}
