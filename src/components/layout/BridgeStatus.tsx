import { useEffect, useState } from 'react';
import { onConnectionStateChange, isBridgeHealthy, restartBridge } from '@/services/bridge/bridgeClient';
import { WifiOff, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const BridgeStatus = () => {
  const [healthy, setHealthy] = useState(isBridgeHealthy());
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    // Sync initial state
    setHealthy(isBridgeHealthy());
    
    // Subscribe to changes
    return onConnectionStateChange((h) => setHealthy(h));
  }, []);

  if (healthy) return null;

  const handleRestart = async () => {
    if (restarting) return;
    setRestarting(true);
    try {
      await restartBridge();
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 h-full animate-in fade-in slide-in-from-top-1 duration-300">
      <div className="flex items-center gap-1.5 py-0.5 px-2 rounded-full bg-destructive/10 border border-destructive/20">
        <WifiOff className="h-3 w-3 text-destructive" />
        <span className="text-[10px] font-bold text-destructive uppercase tracking-tight">Bridge Disconnected</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleRestart}
        disabled={restarting}
        className={cn(
          "size-6 rounded-md hover:bg-muted/50 group",
          restarting && "opacity-50 cursor-not-allowed"
        )}
        title="Attempt Reconnect"
      >
        <RefreshCcw className={cn("h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors", restarting && "animate-spin")} />
      </Button>
    </div>
  );
};

export default BridgeStatus;
