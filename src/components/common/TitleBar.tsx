import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const TitleBar = () => {
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
            className="h-8 bg-background border-b border-border/10 flex items-center justify-between select-none fixed top-0 left-0 right-0 z-100"
        >
            {/* App Title - Left */}
            <div data-tauri-drag-region className="flex items-center gap-2 px-3 h-full">
                <div className="w-3 h-3 rounded-full bg-linear-to-br from-primary/80 to-primary" />
                <span className="text-xs font-medium text-muted-foreground">RelWave</span>
            </div>

            {/* Window Controls - Right */}
            <div className="flex items-center h-full">
                <button
                    onClick={handleMinimize}
                    className="h-full px-4 hover:bg-muted/50 transition-colors flex items-center justify-center group"
                    aria-label="Minimize"
                >
                    <Minus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>
                <button
                    onClick={handleMaximize}
                    className="h-full px-4 hover:bg-muted/50 transition-colors flex items-center justify-center group"
                    aria-label="Maximize"
                >
                    <Square className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>
                <button
                    onClick={handleClose}
                    className="h-full px-4 hover:bg-red-500 transition-colors flex items-center justify-center group"
                    aria-label="Close"
                >
                    <X className="h-3.5 w-3.5 text-muted-foreground group-hover:text-white transition-colors" />
                </button>
            </div>
        </div>
    );
};

export default TitleBar;
