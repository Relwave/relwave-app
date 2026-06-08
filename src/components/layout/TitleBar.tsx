import { Maximize2, Minus, Square, X, Settings as SettingsIcon } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import BridgeStatus from './BridgeStatus';
import { SettingsDialog } from '@/features/settings/components';
import { useState } from 'react';

const TitleBar = () => {
    const [settingsOpen, setSettingsOpen] = useState(false);

    const handleMinimize = async () => {
        try {
            const appWindow = getCurrentWindow();
            await appWindow.minimize();
        } catch (error) {
            console.error('Failed to minimize:', error);
        }
    };

    const handleMaximize = async () => {
        try {
            const appWindow = getCurrentWindow();
            await appWindow.toggleMaximize();
        } catch (error) {
            console.error('Failed to toggle maximize:', error);
        }
    };

    const handleClose = async () => {
        try {
            const appWindow = getCurrentWindow();
            await appWindow.close();
        } catch (error) {
            console.error('Failed to close:', error);
        }
    };

    return (
        <div
            data-tauri-drag-region
            className="h-8 bg-background border-b border-border/10 flex items-center justify-between select-none fixed top-0 left-0 right-0 z-[100]"
        >
            {/* App Title - Left */}
            <div data-tauri-drag-region className="flex items-center gap-2 px-3 h-full">
                <div className="w-3 h-3 rounded-full bg-linear-to-br from-primary/80 to-primary" />
                <span className="text-xs font-medium text-muted-foreground">RelWave</span>
            </div>

            {/* Bridge Status - Center */}
            <div data-tauri-drag-region className="flex-1 flex justify-center h-full">
                <BridgeStatus />
            </div>

            {/* Window Controls - Right */}
            <div className="flex items-center gap-4 px-3 h-full">
                {/* Settings Button */}
                <button
                    onClick={() => setSettingsOpen(true)}
                    className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors nodrag"
                    aria-label="Settings"
                    data-tauri-drag-region=""
                >
                    <SettingsIcon className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2">
                {/* Close - Red */}
                <button
                    onClick={handleClose}
                    className="group relative w-3 h-3 rounded-full bg-[#FF5F57] border border-[#E0443E] flex items-center justify-center transition-all hover:brightness-90 focus:outline-none"
                    aria-label="Close"
                >
                    <X className="h-2 w-2 text-[#820005] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={2.5} />
                </button>

                {/* Minimize - Yellow */}
                <button
                    onClick={handleMinimize}
                    className="group relative w-3 h-3 rounded-full bg-[#FEBC2E] border border-[#D89E1D] flex items-center justify-center transition-all hover:brightness-90 focus:outline-none"
                    aria-label="Minimize"
                >
                    <Minus className="h-2 w-2 text-[#7D5A00] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={2.5} />
                </button>

                {/* Maximize - Green */}
                <button
                    onClick={handleMaximize}
                    className="group relative w-3 h-3 rounded-full bg-[#28C840] border border-[#1DAD2B] flex items-center justify-center transition-all hover:brightness-90 focus:outline-none"
                    aria-label="Maximize"
                >
                    <Maximize2 className="h-2 w-2 text-[#006500] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={2.5} />
                </button>
                </div>
            </div>

            <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
    );
};

export default TitleBar;
