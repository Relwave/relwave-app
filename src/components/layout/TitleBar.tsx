import { Maximize2, Minus, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLocation, Link } from "react-router-dom";
import BridgeStatus from "./BridgeStatus";
import { useDatabase } from "@/features/project/hooks/useDbQueries";
import { DatabaseLogo } from "@/lib/databases";

const TitleBar = () => {
  const location = useLocation();
  const dbId = location.pathname !== "/" ? location.pathname.split("/")[1] : undefined;
  const { data: database } = useDatabase(dbId);

  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error("Failed to minimize:", error);
    }
  };

  const handleMaximize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
    } catch (error) {
      console.error("Failed to toggle maximize:", error);
    }
  };

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWindow();
      // Hide window immediately for instant feedback (guarded in try-catch)
      try {
        await appWindow.hide();
      } catch {
        // Proceed even if hide has an issue
      }
      await appWindow.close();
    } catch (error) {
      console.error("Failed to close:", error);
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
        <Link
          to="/"
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          RelWave
        </Link>
        {database && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/40">
            <span>/</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/40 border border-border/30 text-[11px] font-medium text-foreground">
              <DatabaseLogo type={database.type} className="w-3.5 h-3.5" />
              <span className="max-w-[140px] truncate">{database.name}</span>
            </div>
          </div>
        )}
      </div>

      {/* Bridge Status - Center */}
      <div data-tauri-drag-region className="flex-1 flex justify-center h-full">
        <BridgeStatus />
      </div>

      {/* Window Controls - Right */}
      <div className="flex items-center gap-4 px-3 h-full">
        <div className="flex items-center gap-2">
          {/* Close - Red */}
          <button
            onClick={handleClose}
            className="group relative w-3 h-3 rounded-full bg-[#FF5F57] border border-[#E0443E] flex items-center justify-center transition-all hover:brightness-90 focus:outline-none"
            aria-label="Close"
          >
            <X
              className="h-2 w-2 text-[#820005] opacity-0 group-hover:opacity-100 transition-opacity"
              strokeWidth={2.5}
            />
          </button>

          {/* Minimize - Yellow */}
          <button
            onClick={handleMinimize}
            className="group relative w-3 h-3 rounded-full bg-[#FEBC2E] border border-[#D89E1D] flex items-center justify-center transition-all hover:brightness-90 focus:outline-none"
            aria-label="Minimize"
          >
            <Minus
              className="h-2 w-2 text-[#7D5A00] opacity-0 group-hover:opacity-100 transition-opacity"
              strokeWidth={2.5}
            />
          </button>

          {/* Maximize - Green */}
          <button
            onClick={handleMaximize}
            className="group relative w-3 h-3 rounded-full bg-[#28C840] border border-[#1DAD2B] flex items-center justify-center transition-all hover:brightness-90 focus:outline-none"
            aria-label="Maximize"
          >
            <Maximize2
              className="h-2 w-2 text-[#006500] opacity-0 group-hover:opacity-100 transition-opacity"
              strokeWidth={2.5}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
