import { invoke } from "@tauri-apps/api/core";
import { trackEvent as aptabaseTrackEvent } from "@aptabase/tauri";

export const analyticsService = {
    async trackEvent(eventName: string, props?: Record<string, any>): Promise<void> {
        try {
            const enabled = await this.isEnabled();
            if (enabled) {
                console.log("Dispatching to Aptabase:", eventName, props);
                if (props) {
                    await aptabaseTrackEvent(eventName, props as any);
                } else {
                    await aptabaseTrackEvent(eventName);
                }
            }
        } catch (e) {
            console.warn("Failed to track analytics event:", e);
        }
    },

    async isEnabled(): Promise<boolean> {
        try {
            return await invoke<boolean>("get_analytics_enabled");
        } catch (e) {
            console.warn("Failed to get analytics status:", e);
            return false;
        }
    },

    async setEnabled(enabled: boolean): Promise<void> {
        try {
            await invoke("set_analytics_enabled", { enabled });
        } catch (e) {
            console.warn("Failed to set analytics status:", e);
        }
    },

    trackDatabaseAdded(type?: string): void {
        this.trackEvent("database_added", { type });
    },

    trackDatabaseConnected(type?: string): void {
        this.trackEvent("database_connected", { type });
    },

    trackDatabaseConnectionFailed(type?: string, error?: string): void {
        this.trackEvent("database_connection_failed", { type, error });
    },

    trackDatabaseRemoved(type?: string): void {
        this.trackEvent("database_removed", { type });
    },

    trackSshConnectionSuccess(): void {
        this.trackEvent("ssh_connection_success");
    },

    trackProjectCreated(): void {
        this.trackEvent("project_created");
    },

    trackProjectOpened(): void {
        this.trackEvent("project_opened");
    },

    trackQueryExecuted(): void {
        this.trackEvent("query_executed");
    },

    trackErDiagramOpened(): void {
        this.trackEvent("er_diagram_opened");
    },

    trackErDiagramExported(format: string): void {
        this.trackEvent("er_diagram_exported", { format });
    },

    trackMigrationCreated(): void {
        this.trackEvent("migration_created");
    },

    trackMigrationApplied(): void {
        this.trackEvent("migration_applied");
    },

    trackGitInitialized(): void {
        this.trackEvent("git_initialized");
    },

    trackGitCommit(): void {
        this.trackEvent("git_commit");
    },

    trackAiChatOpened(): void {
        this.trackEvent("ai_chat_opened");
    },

    trackChartCreated(): void {
        this.trackEvent("chart_created");
    }
};
