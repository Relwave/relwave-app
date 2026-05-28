import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ShortcutsTriggerProps {
  onClick: () => void;
}

export function ShortcutsTrigger({ onClick }: ShortcutsTriggerProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-all"
          onClick={onClick}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="sr-only">Show shortcuts</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[10px] px-2 py-1">
        <p>Shortcuts <kbd className="font-mono opacity-60">?</kbd></p>
      </TooltipContent>
    </Tooltip>
  );
}
