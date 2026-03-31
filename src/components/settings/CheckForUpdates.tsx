import { Button } from '@/components/ui/button'
import { useUpdater } from '@/hooks/useUpdater';
import { AlertCircle, CheckCircle2, Download, Info, Loader2, RefreshCw } from 'lucide-react'

export default function CheckForUpdates() {
    const { status, updateInfo, downloadProgress, error: updateError, checkForUpdates, downloadAndInstall, relaunchApp } = useUpdater();
    return (
        <section className="border border-border/20 rounded-lg p-6 bg-background">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <RefreshCw className="h-4 w-4 text-muted-foreground/60" />
                    <div>
                        <h2 className="text-sm font-medium">Updates</h2>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                            Check for new versions of RelWave
                        </p>
                    </div>
                </div>

                {status === "idle" || status === "up-to-date" || status === "error" || status === "dev-mode" ? (
                    <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={checkForUpdates}
                    >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Check for Updates
                    </Button>
                ) : status === "checking" ? (
                    <Button size="sm" variant="outline" className="text-xs" disabled>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Checking...
                    </Button>
                ) : null}
            </div>

            {/* Status messages */}
            {status === "up-to-date" && (
                <div className="mt-4 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <p className="text-xs text-green-600 dark:text-green-400">You're running the latest version.</p>
                    </div>
                </div>
            )}

            {status === "dev-mode" && (
                <div className="mt-4 p-3 rounded-md bg-muted/30 border border-border/20">
                    <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground">Update checks are disabled in development mode.</p>
                    </div>
                </div>
            )}

            {status === "error" && updateError && (
                <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <p className="text-xs text-destructive">{updateError}</p>
                    </div>
                </div>
            )}

            {status === "available" && updateInfo && (
                <div className="mt-4 space-y-3">
                    <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium">v{updateInfo.version} available</p>
                                {updateInfo.body && (
                                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{updateInfo.body}</p>
                                )}
                            </div>
                            <Button size="sm" className="text-xs shrink-0" onClick={downloadAndInstall}>
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Download & Install
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {status === "downloading" && (
                <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Downloading update...</span>
                        <span>{downloadProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${downloadProgress}%` }}
                        />
                    </div>
                </div>
            )}

            {status === "ready" && (
                <div className="mt-4 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            <p className="text-xs text-green-600 dark:text-green-400">Update downloaded. Restart to apply.</p>
                        </div>
                        <Button size="sm" className="text-xs" onClick={relaunchApp}>
                            Restart Now
                        </Button>
                    </div>
                </div>
            )}
        </section>
    )
}
