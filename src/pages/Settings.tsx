import { AISettings, AIHistoryPanel, CheckForUpdates, ColorVariant, DeveloperMode, Header, Preview, ThemeMode, Version } from "@/features/settings/components";

const Settings = () => {
    return (
        <div className="h-[calc(100vh-32px)] flex app-surface text-foreground overflow-hidden">
            <main className="flex-1 ml-15 min-h-0 overflow-y-auto">
                {/* Header */}
                <Header />

                {/* Content */}
                <div className="container mx-auto px-8 py-8 max-w-4xl">
                    <div className="space-y-8">
                        {/* Theme Mode Section */}
                        <ThemeMode />

                        {/* Color Variant Section */}
                        <ColorVariant />

                        {/* Developer Mode Section */}
                        <DeveloperMode />

                        {/* AI Settings Section */}
                        <AISettings />

                        {/* AI History Section */}
                        <AIHistoryPanel />

                        {/* Updates Section */}
                        <CheckForUpdates />

                        {/* About Section */}
                        <Version />

                        {/* Preview Section */}
                        <Preview />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Settings;
