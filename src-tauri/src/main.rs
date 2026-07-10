#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod devtools;
mod services;

use bridge::{bridge_restart, bridge_kill, bridge_status, bridge_write, BridgeProcess};
use devtools::{close_devtools, is_devtools_open, navigate_back, navigate_forward, open_devtools, reload_webview};
use services::analytics::AnalyticsService;
use tauri::{Manager, State};
use tauri_plugin_aptabase::EventTracker;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init());

    if let Some(app_key) = option_env!("APTABASE_APP_KEY") {
        if !app_key.is_empty() {
            println!("Aptabase enabled with key: {}", app_key);
            builder = builder.plugin(
                tauri_plugin_aptabase::Builder::new(app_key)
                    .with_options(tauri_plugin_aptabase::InitOptions {
                        flush_interval: Some(std::time::Duration::from_secs(1)),
                        ..Default::default()
                    })
                    .build()
            );
        }
    } else {
        println!("APTABASE_APP_KEY not found in environment at build time");
    }

    builder
        .setup(|app| {
            if option_env!("APTABASE_APP_KEY").is_some() {
                let _ = app.track_event("app_started", None);
            }

            let analytics = AnalyticsService::new(app.handle());
            app.manage(analytics);

            let handle = app.handle().clone();
            let child = bridge::init(handle);
            app.manage(BridgeProcess::new(child));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bridge_write,
            bridge_kill,
            bridge_restart,
            bridge_status,
            open_devtools,
            close_devtools,
            is_devtools_open,
            reload_webview,
            navigate_back,
            navigate_forward,
            get_analytics_enabled,
            set_analytics_enabled
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Track exit event before killing bridge
                let _ = app_handle.track_event("app_exited", None);
                app_handle.flush_events_blocking();
                
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



#[tauri::command]
async fn get_analytics_enabled(analytics: State<'_, AnalyticsService>) -> Result<bool, String> {
    Ok(analytics.is_enabled().await)
}

#[tauri::command]
async fn set_analytics_enabled(enabled: bool, analytics: State<'_, AnalyticsService>) -> Result<(), String> {
    analytics.set_enabled(enabled).await;
    Ok(())
}
