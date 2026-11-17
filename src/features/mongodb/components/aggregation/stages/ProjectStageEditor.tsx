import { FC } from "react";
import { StageEditorProps } from "../types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

export const ProjectStageEditor: FC<StageEditorProps> = ({ stage, onChange }) => {
  const fields: Array<{ field: string; value: any }> = stage.config.fields || [];

  const handleFieldChange = (index: number, key: string, value: any) => {
    const next = [...fields];
    next[index] = { ...next[index], [key]: value };
    onChange({ ...stage.config, fields: next });
  };

  const handleAddField = () => {
    onChange({
      ...stage.config,
      fields: [...fields, { field: "", value: 1 }],
    });
  };

  const handleRemoveField = (index: number) => {
    onChange({
      ...stage.config,
      fields: fields.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Specify field projection: 1 (Include), 0 (Exclude), or an expression string.
      </div>

      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={f.field}
              onChange={(e) => handleFieldChange(i, "field", e.target.value)}
              placeholder="field name (e.g. email)"
              className="h-8 text-xs font-mono flex-1"
            />
            <div className="flex items-center gap-1 border border-border/60 rounded-md p-0.5 bg-muted/40">
              <Button
                type="button"
                variant={f.value === 1 ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => handleFieldChange(i, "value", 1)}
              >
                1
              </Button>
              <Button
                type="button"
                variant={f.value === 0 ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => handleFieldChange(i, "value", 0)}
              >
                0
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemoveField(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={handleAddField}
      >
        <Plus className="h-3 w-3" />
        Add Field
      </Button>
    </div>
  );
};
