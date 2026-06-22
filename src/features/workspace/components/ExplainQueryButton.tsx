import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIResultDialog } from "@/features/ai/components/AIResultDialog";
import { useAISettings } from "@/features/ai/hooks/useAISettings";
import { aiService } from "@/services/bridge/ai";

interface ExplainQueryButtonProps {
  sql: string;
  disabled?: boolean;
  databaseName?: string;
}

export function ExplainQueryButton({ sql, disabled, databaseName }: ExplainQueryButtonProps) {
  const { settings } = useAISettings();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markdown, setMarkdown] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean | undefined>();
  const [createdAt, setCreatedAt] = useState<string | undefined>();

  const doExplain = async (skipCache = false) => {
    setOpen(true);
    setMarkdown(undefined);
    setError(null);
    setLoading(true);

    try {
      const result = await aiService.explainQuery(settings, {
        sql: sql.trim(),
      }, { skipCache, datasourceName: databaseName });
      setMarkdown(result.markdown);
      setCached(result.cached);
      setCreatedAt(result.createdAt);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReanalyze = () => {
    setCached(undefined);
    setCreatedAt(undefined);
    doExplain(true);
  };

  const shortSQL =
    sql.trim().length > 60
      ? sql.trim().slice(0, 60).replace(/\s+/g, " ") + "…"
      : sql.trim().replace(/\s+/g, " ");

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs border-border/40"
        onClick={() => doExplain()}
        disabled={disabled || !sql.trim()}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
        Explain
      </Button>

      <AIResultDialog
        open={open}
        onOpenChange={setOpen}
        title="Query Explanation"
        description={shortSQL || "No query"}
        markdown={markdown}
        loading={loading}
        error={error}
        cached={cached}
        createdAt={createdAt}
        onReanalyze={handleReanalyze}
      />
    </>
  );
}
