import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SchemaDiff } from "../types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useState } from "react";
import { projectService } from "@/services/bridge/project";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SchemaDriftSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  connectionName: string;
  capturedDate?: string;
  driftDetails?: SchemaDiff;
  onRefresh: () => void;
}

export function SchemaDriftSheet({
  open,
  onOpenChange,
  projectId,
  connectionName,
  capturedDate,
  driftDetails,
  onRefresh,
}: SchemaDriftSheetProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await projectService.refreshSchemaCache(projectId);
      toast.success("Schema cache refreshed successfully");
      onRefresh();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to refresh cache", { description: error.message });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!driftDetails) return null;

  const hasAdded = driftDetails.tablesAdded.length > 0;
  const hasRemoved = driftDetails.tablesRemoved.length > 0;
  const hasModified = driftDetails.tablesModified.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-3/4 flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Schema Drift — {connectionName}</SheetTitle>
          <SheetDescription>
            Live database differs from schema.json{capturedDate ? ` captured ${new Date(capturedDate).toLocaleString()}` : ""}.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-4">
            {hasAdded && (
              <Collapsible defaultOpen className="border rounded-md">
                <CollapsibleTrigger className="flex items-center justify-between w-full p-4 font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">Tables Added</span>
                    <Badge variant="outline" className="bg-green-600/10 text-green-600 border-green-600/20">
                      {driftDetails.tablesAdded.length}
                    </Badge>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-0 border-t bg-muted/20">
                  <ul className="list-disc pl-4 mt-2 text-sm text-green-600">
                    {driftDetails.tablesAdded.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}

            {hasRemoved && (
              <Collapsible defaultOpen className="border rounded-md">
                <CollapsibleTrigger className="flex items-center justify-between w-full p-4 font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-destructive">Tables Removed</span>
                    <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
                      {driftDetails.tablesRemoved.length}
                    </Badge>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-0 border-t bg-muted/20">
                  <ul className="list-disc pl-4 mt-2 text-sm text-destructive">
                    {driftDetails.tablesRemoved.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}

            {hasModified && (
              <Collapsible defaultOpen className="border rounded-md">
                <CollapsibleTrigger className="flex items-center justify-between w-full p-4 font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-600">Tables Modified</span>
                    <Badge variant="outline" className="bg-orange-600/10 text-orange-600 border-orange-600/20">
                      {driftDetails.tablesModified.length}
                    </Badge>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-0 border-t bg-muted/20">
                  <div className="space-y-4 mt-2">
                    {driftDetails.tablesModified.map((m) => (
                      <div key={m.tableName} className="text-sm">
                        <div className="font-semibold text-foreground mb-1">{m.tableName}</div>
                        {m.columnsAdded.length > 0 && (
                          <div className="text-green-600 ml-2">+ {m.columnsAdded.join(", ")}</div>
                        )}
                        {m.columnsRemoved.length > 0 && (
                          <div className="text-destructive ml-2">- {m.columnsRemoved.join(", ")}</div>
                        )}
                        {m.columnsChanged.length > 0 && (
                          <div className="text-orange-600 ml-2">~ {m.columnsChanged.join(", ")}</div>
                        )}
                        {m.constraintsChanged.length > 0 && (
                          <div className="text-blue-600 ml-2">~ {m.constraintsChanged.join(", ")}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t mt-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
            Refresh Cache
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
