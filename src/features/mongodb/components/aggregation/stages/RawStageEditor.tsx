import { FC, useMemo } from "react";
import { StageEditorProps } from "../types";
import { MongoMqlEditor } from "../../editor/MongoMqlEditor";
import { AlertCircle } from "lucide-react";

export const RawStageEditor: FC<StageEditorProps> = ({ stage, onChange }) => {
  const rawText = stage.config.raw ?? '{\n  "$facet": {}\n}';

  const parseError = useMemo(() => {
    const raw = (rawText || "").trim();
    if (!raw) return null;
    try {
      JSON.parse(raw);
      return null;
    } catch (err: any) {
      return err.message;
    }
  }, [rawText]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Freeform Stage JSON</span>
        {parseError && (
          <span className="flex items-center gap-1 text-destructive text-[11px]">
            <AlertCircle className="h-3 w-3" />
            Invalid JSON
          </span>
        )}
      </div>
      <div className="rounded-md border border-border/60 overflow-hidden bg-background">
        <MongoMqlEditor
          value={rawText}
          onChange={(val) => onChange({ ...stage.config, raw: val })}
          minHeight="140px"
        />
      </div>
    </div>
  );
};
