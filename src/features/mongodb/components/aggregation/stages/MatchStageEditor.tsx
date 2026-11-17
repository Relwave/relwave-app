import { FC, useMemo } from "react";
import { StageEditorProps } from "../types";
import { MongoMqlEditor } from "../../editor/MongoMqlEditor";
import { AlertCircle } from "lucide-react";

export const MatchStageEditor: FC<StageEditorProps> = ({ stage, onChange }) => {
  const filterText = stage.config.filter ?? '{\n  "status": "active"\n}';

  const parseError = useMemo(() => {
    const raw = (filterText || "").trim();
    if (!raw) return null;
    try {
      JSON.parse(raw);
      return null;
    } catch (err: any) {
      return err.message;
    }
  }, [filterText]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Query Filter Expression (JSON)</span>
        {parseError && (
          <span className="flex items-center gap-1 text-destructive text-[11px]">
            <AlertCircle className="h-3 w-3" />
            Syntax error
          </span>
        )}
      </div>
      <div className="rounded-md border border-border/60 overflow-hidden bg-background">
        <MongoMqlEditor
          value={filterText}
          onChange={(val) => onChange({ ...stage.config, filter: val })}
          minHeight="120px"
        />
      </div>
    </div>
  );
};
