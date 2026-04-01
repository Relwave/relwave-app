import VerticalIconBar from "@/components/layout/VerticalIconBar";
import { CheckForUpdates, ColorVariant, DeveloperMode, Header, Preview, ThemeMode, Version } from "@/features/settings/components";

const Settings = () => {
    return (
        <div className="h-full flex bg-background text-foreground overflow-hidden">
            <VerticalIconBar />

            <main className="flex-1 ml-15">
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
