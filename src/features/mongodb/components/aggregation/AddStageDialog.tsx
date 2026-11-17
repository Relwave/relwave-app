import React, { useState, useMemo } from "react";
import { SupportedStageType } from "./types";
import { STAGE_DEFINITIONS } from "./stages/registry";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export interface AddStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectStage: (type: SupportedStageType) => void;
}

export const AddStageDialog: React.FC<AddStageDialogProps> = ({
  open,
  onOpenChange,
  onSelectStage,
}) => {
  const [search, setSearch] = useState("");

  const stagesList = useMemo(() => {
    const list = Object.values(STAGE_DEFINITIONS);
    if (!search.trim()) return list;
    const term = search.toLowerCase();
    return list.filter(
      (s) =>
        s.type.toLowerCase().includes(term) ||
        s.label.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term),
    );
  }, [search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b border-border/40">
          <DialogTitle className="text-sm font-semibold">Add Aggregation Stage</DialogTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stages ($match, $group, $sort)..."
              className="h-8 pl-8 text-xs"
              autoFocus
            />
          </div>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {stagesList.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No aggregation stages found matching "{search}".
            </div>
          ) : (
            stagesList.map((st) => (
              <button
                key={st.type}
                type="button"
                onClick={() => {
                  onSelectStage(st.type);
                  onOpenChange(false);
                  setSearch("");
                }}
                className="w-full text-left p-2.5 rounded-md hover:bg-accent/60 transition-colors flex items-start gap-3 group"
              >
                <Badge
                  variant="outline"
                  className="font-mono text-xs font-semibold px-2 py-0.5 shrink-0 group-hover:border-primary/60"
                >
                  {st.type}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground">{st.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{st.description}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
