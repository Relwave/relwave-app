import { useEffect } from "react";
import { useUpdater } from "@/hooks/useUpdater";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";

export function UpdateNotification() {
  const {
    status,
    updateInfo,
    downloadProgress,
    error,
    checkForUpdates,
    downloadAndInstall,
    relaunchApp,
  } = useUpdater();

  // Show toast notifications based on status
  useEffect(() => {
    // Skip notifications in dev mode
    if (status === "dev-mode") return;

    if (status === "available" && updateInfo) {
      toast.info(`Update Available: v${updateInfo.version}`, {
        description: updateInfo.body || "A new version is available",
        duration: 10000,
        action: {
          label: "Download",
          onClick: downloadAndInstall,
        },
      });
    }
  }, [status, updateInfo, downloadAndInstall]);

  useEffect(() => {
    if (status === "ready") {
      toast.success("Update Ready!", {
        description: "The update has been downloaded. Restart to apply.",
        duration: Infinity,
        action: {
          label: "Restart Now",
          onClick: relaunchApp,
        },
      });
    }
  }, [status, relaunchApp]);

  useEffect(() => {
    if (status === "error" && error) {
      toast.error("Update Error", {
        description: error,
        duration: 5000,
      });
    }
  }, [status, error]);

  // This component can also render inline UI if needed
  return null;
}

// Standalone update checker button for settings
export function UpdateCheckerButton() {
  const {
    status,
    updateInfo,
    downloadProgress,
    checkForUpdates,
    downloadAndInstall,
    relaunchApp,
  } = useUpdater();

  const getButtonContent = () => {
    switch (status) {
      case "checking":
        return (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Checking...
          </>
        );
      case "available":
        return (
          <>
            <Download className="h-4 w-4 mr-2" />
            Download v{updateInfo?.version}
          </>
        );
      case "downloading":
        return (
          <div className="flex items-center gap-2 w-full">
            <Loader2 className="h-4 w-4 animate-spin" />
            <Progress value={downloadProgress} className="flex-1 h-2" />
            <span className="text-xs">{downloadProgress}%</span>
          </div>
        );
      case "ready":
        return (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Restart to Update
          </>
        );
      case "up-to-date":
        return (
          <>
            <CheckCircle className="h-4 w-4 mr-2" />
            Up to Date
          </>
        );
      case "error":
        return (
          <>
            <XCircle className="h-4 w-4 mr-2" />
            Check Failed - Retry
          </>
        );
      case "dev-mode":
        return (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Updates disabled (dev)
          </>
        );
      default:
        return (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Check for Updates
          </>
        );
    }
  };

  const handleClick = () => {
    switch (status) {
      case "available":
        downloadAndInstall();
        break;
      case "ready":
        relaunchApp();
        break;
      case "downloading":
        // Do nothing while downloading
        break;
      default:
        checkForUpdates();
        break;
    }
  };

  return (
    <Button
      variant={status === "available" ? "default" : "outline"}
      size="sm"
      onClick={handleClick}
      disabled={status === "downloading" || status === "checking" || status === "dev-mode"}
      className="min-w-[180px]"
    >
      {getButtonContent()}
    </Button>
  );
}
