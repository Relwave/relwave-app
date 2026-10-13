#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod devtools;
mod services;

use bridge::{bridge_kill, bridge_restart, bridge_status, bridge_write, kill_bridge_child, BridgeProcess};
use devtools::{close_devtools, is_devtools_open, navigate_back, navigate_forward, open_devtools, reload_webview};
use services::analytics::AnalyticsService;
use tauri::{Manager, State};
use tauri_plugin_aptabase::EventTracker;

fn cleanup_bridge(app_handle: &tauri::AppHandle) {
    if let Some(state) = app_handle.try_state::<BridgeProcess>() {
        kill_bridge_child(&state);
    }
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    let _ = dotenvy::from_path("../.env");

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let _ = window.hide();
                cleanup_bridge(window.app_handle());
            }
        });

    let aptabase_key = option_env!("APTABASE_APP_KEY")
        .map(String::from)
        .or_else(|| std::env::var("APTABASE_APP_KEY").ok());

    if let Some(app_key) = aptabase_key.clone() {
        if !app_key.is_empty() {
            println!("Aptabase analytics enabled");
            builder = builder.plugin(
                tauri_plugin_aptabase::Builder::new(&app_key)
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
            let analytics = AnalyticsService::new(app.handle());
            let analytics_clone = analytics.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let is_analytics_enabled = analytics_clone.is_enabled().await;
                
                let has_aptabase = option_env!("APTABASE_APP_KEY")
                    .map(String::from)
                    .or_else(|| std::env::var("APTABASE_APP_KEY").ok())
                    .is_some();
                    
                if has_aptabase && is_analytics_enabled {
                    let _ = app_handle.track_event("app_started", None);
                    println!("🚀 Analytics is ON: Successfully dispatched 'app_started' event.");
                } else if has_aptabase && !is_analytics_enabled {
                    println!("🛑 Analytics is OFF: User opted out, no telemetry will be sent.");
                }
            });

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
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { .. } => {
                cleanup_bridge(app_handle);
            }
            tauri::RunEvent::Exit => {
                cleanup_bridge(app_handle);
                let _ = app_handle.track_event("app_exited", None);
            }
            tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::Destroyed,
                ..
            } => {
                cleanup_bridge(app_handle);
            }
            _ => {}
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
