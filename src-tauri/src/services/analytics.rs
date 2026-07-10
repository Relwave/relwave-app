use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AnalyticsService {
    enabled: Arc<RwLock<bool>>,
}

impl AnalyticsService {
    pub fn new(_app: &AppHandle) -> Self {
        Self {
            enabled: Arc::new(RwLock::new(false)),
        }
    }

    pub async fn is_enabled(&self) -> bool {
        *self.enabled.read().await
    }

    pub async fn set_enabled(&self, enabled: bool) {
        let mut e = self.enabled.write().await;
        *e = enabled;
        if enabled {
            println!("Analytics have been enabled by the user.");
        } else {
            println!("Analytics have been disabled by the user.");
        }
    }
}
