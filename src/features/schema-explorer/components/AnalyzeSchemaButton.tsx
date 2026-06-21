import { useState, useEffect, useRef } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIResultDialog } from "@/features/ai/components/AIResultDialog";
import { useAISettings } from "@/features/ai/hooks/useAISettings";
import { aiService, type SchemaAnalysisInput } from "@/services/bridge/ai";
import { DatabaseSchemaDetails } from "@/features/database/types";

interface AnalyzeSchemaButtonProps {
  schemaData: DatabaseSchemaDetails & {
    schemas: Array<{
      name?: string;
      tables: Array<{
        name: string;
        columns: Array<{
          name: string;
          type: string;
          nullable?: boolean;
          isPrimaryKey?: boolean;
          isForeignKey?: boolean;
        }>;
      }>;
    }>;
  };
  databaseType?: string;
}

export function AnalyzeSchemaButton({ schemaData, databaseType }: AnalyzeSchemaButtonProps) {
  const { settings } = useAISettings();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markdown, setMarkdown] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean | undefined>();
  const [createdAt, setCreatedAt] = useState<string | undefined>();

  // Track which datasource the cached markdown belongs to
  const cachedForRef = useRef<string | undefined>(undefined);

  const tableCount = schemaData.schemas?.flatMap((s) => s.tables).length ?? 0;

  // Reset all local state when the user switches to a different database
  useEffect(() => {
    const name = schemaData.name;
    if (cachedForRef.current !== undefined && cachedForRef.current !== name) {
      setMarkdown(undefined);
      setError(null);
      setCached(undefined);
      setCreatedAt(undefined);
      cachedForRef.current = undefined;
    }
  }, [schemaData.name]);

  const buildInput = (): SchemaAnalysisInput => ({
    databaseType,
    tables: schemaData.schemas.flatMap((schema) =>
      schema.tables.map((table) => ({
        name: table.name,
        schema: schema.name,
        columns: table.columns.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          isPrimaryKey: col.isPrimaryKey,
          isForeignKey: col.isForeignKey,
        })),
      }))
    ),
  });

  const handleAnalyze = async (skipCache = false) => {
    setOpen(true);
    // Only reuse cached markdown if it's for THIS database
    if (markdown && !skipCache && cachedForRef.current === schemaData.name) return;
    setLoading(true);
    setError(null);

    try {
      const input = buildInput();
      const result = await aiService.analyzeSchema(settings, input, {
        skipCache,
        datasourceName: schemaData.name,
      });
      setMarkdown(result.markdown);
      setCached(result.cached);
      setCreatedAt(result.createdAt);
      cachedForRef.current = schemaData.name; // mark which DB this result belongs to
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReanalyze = () => {
    setMarkdown(undefined);
    setCached(undefined);
    setCreatedAt(undefined);
    cachedForRef.current = undefined;
    handleAnalyze(true);
  };

  // Reset cached result when dialog closes so next open re-fetches
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setMarkdown(undefined);
      setError(null);
      setCached(undefined);
      setCreatedAt(undefined);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs border-border/40"
        onClick={() => handleAnalyze()}
        disabled={tableCount === 0}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
        Analyze Schema
      </Button>

      <AIResultDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Schema Analysis"
        description={`AI analysis of ${schemaData.name ?? "database"} — ${tableCount} table${tableCount !== 1 ? "s" : ""}`}
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
