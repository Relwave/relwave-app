import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import { ArrowLeft, ArrowRight, RefreshCw, Bug } from "lucide-react";
import { useDevMode } from "@/features/settings/hooks/useDevMode";
import { useDevModeKeyboard } from "@/features/settings/hooks/useDevModeKeyboard";
import { useWebviewActions } from "@/features/settings/hooks/useWebviewActions";

interface DeveloperContextMenuProps {
  children: React.ReactNode;
}

export const DeveloperContextMenu = ({ children }: DeveloperContextMenuProps) => {
  const devMode = useDevMode();
  useDevModeKeyboard(devMode);
  const { reload, goBack, goForward, openDevtools } = useWebviewActions();

  if (!devMode) {
    return (
      <div className="contents" onContextMenu={(e) => e.preventDefault()}>
        {children}
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="contents">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={goBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
          <ContextMenuShortcut>Alt+←</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={goForward} className="gap-2">
          <ArrowRight className="h-4 w-4" />
          Forward
          <ContextMenuShortcut>Alt+→</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={reload} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Reload
          <ContextMenuShortcut>Ctrl+R</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={openDevtools} className="gap-2">
          <Bug className="h-4 w-4" />
          Inspect Element
          <ContextMenuShortcut>F12</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
