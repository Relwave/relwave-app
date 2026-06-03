import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIResultDialog } from "@/features/ai/components/AIResultDialog";
import { useAISettings } from "@/features/ai/hooks/useAISettings";
import { aiService } from "@/services/bridge/ai";

interface ExplainQueryButtonProps {
  sql: string;
  disabled?: boolean;
}

export function ExplainQueryButton({ sql, disabled }: ExplainQueryButtonProps) {
  const settings = useAISettings();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markdown, setMarkdown] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const handleExplain = async () => {
    setOpen(true);
    setMarkdown(undefined);
    setError(null);
    setLoading(true);

    try {
      const result = await aiService.explainQuery(settings, {
        sql: sql.trim(),
      });
      setMarkdown(result);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
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
        onClick={handleExplain}
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
      />
    </>
  );
}
