import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { aiService, type AIHistoryListItem, type AIHistoryEntry } from "@/services/bridge/ai";
import { AIHistoryDetailDialog } from "./AIHistoryDetailDialog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const FEATURE_OPTIONS = [
  { value: "all", label: "All Features" },
  { value: "schema-analysis", label: "Schema Analysis" },
  { value: "query-explanation", label: "Query Explanation" },
  { value: "chart-recommendation", label: "Chart Recommendation" },
];

const PROVIDER_OPTIONS = [
  { value: "all", label: "All Providers" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "groq", label: "Groq" },
  { value: "mistral", label: "Mistral" },
  { value: "ollama", label: "Ollama" },
];

const FEATURE_LABELS: Record<string, string> = {
  "schema-analysis": "Schema Analysis",
  "query-explanation": "Query Explanation",
  "chart-recommendation": "Chart Recommendation",
};

const FEATURE_COLORS: Record<string, string> = {
  "schema-analysis": "border-violet-500/30 text-violet-600 bg-violet-500/8",
  "query-explanation": "border-blue-500/30 text-blue-600 bg-blue-500/8",
  "chart-recommendation": "border-amber-500/30 text-amber-600 bg-amber-500/8",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  groq: "Groq",
  mistral: "Mistral",
  ollama: "Ollama",
};

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function AIHistoryPanel() {
  const [items, setItems] = useState<AIHistoryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [featureFilter, setFeatureFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<AIHistoryEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await aiService.getHistory({
        feature: featureFilter !== "all" ? featureFilter : undefined,
        provider: providerFilter !== "all" ? providerFilter : undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      console.error("Failed to load AI history:", err);
    } finally {
      setLoading(false);
    }
  }, [featureFilter, providerFilter, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [featureFilter, providerFilter]);

  const handleRowClick = async (item: AIHistoryListItem) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const entry = await aiService.getHistoryById(item.id);
      setDetailEntry(entry);
    } catch (err) {
      console.error("Failed to load history detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await aiService.deleteHistory(id);
      fetchHistory();
    } catch (err) {
      console.error("Failed to delete history entry:", err);
    }
  };

  const handleClearAll = async () => {
    try {
      await aiService.clearHistory();
      setItems([]);
      setTotal(0);
      setPage(0);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  return (
    <>
      <Card className="border-border/40 bg-card/50">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 ring-1 ring-primary/20">
                <History className="h-3.5 w-3.5 text-primary" />
              </div>
              AI History
              {total > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                  {total}
                </Badge>
              )}
            </CardTitle>

            {total > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-destructive/60 hover:text-destructive hover:bg-destructive/8"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-sm">Clear all AI history?</AlertDialogTitle>
                    <AlertDialogDescription className="text-xs">
                      This will permanently delete all {total} AI analysis entries from your local history.
                      Cached results will no longer be available. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="text-xs h-8">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="text-xs h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleClearAll}
                    >
                      Clear All History
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 mt-3">
            <Select value={featureFilter} onValueChange={setFeatureFilter}>
              <SelectTrigger className="h-8 text-xs w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEATURE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="h-8 text-xs w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <History className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/50">No AI analysis history yet.</p>
              <p className="text-[10px] text-muted-foreground/40">
                Results will appear here after you use AI features.
              </p>
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wider h-8">Feature</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider h-8">Database</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider h-8">Provider</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider h-8 text-right">Tokens</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider h-8 text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer group"
                        onClick={() => handleRowClick(item)}
                      >
                        <TableCell className="py-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-medium px-1.5 py-0",
                              FEATURE_COLORS[item.feature] ?? "border-border/40"
                            )}
                          >
                            {FEATURE_LABELS[item.feature] ?? item.feature}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-xs text-foreground/70 max-w-[140px] truncate">
                          {item.datasource_id || (
                            <span className="text-muted-foreground/40 italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-foreground/70">
                          {PROVIDER_LABELS[item.provider] ?? item.provider}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground text-right font-mono text-[11px] whitespace-nowrap">
                          {item.tokens_used != null ? (
                            <span title="Estimated tokens">~{item.tokens_used.toLocaleString()}</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground text-right whitespace-nowrap">
                          {timeAgo(item.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-border/20 mt-3">
                  <span className="text-[10px] text-muted-foreground/60">
                    Page {page + 1} of {totalPages} · {total} entries
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <AIHistoryDetailDialog
        open={detailOpen}
        onOpenChange={(next) => {
          setDetailOpen(next);
          if (!next) setDetailEntry(null);
        }}
        entry={detailLoading ? null : detailEntry}
        onDelete={handleDelete}
      />
    </>
  );
}
