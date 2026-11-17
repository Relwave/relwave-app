import { FC } from "react";
import { StageEditorProps } from "../types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

export const AddFieldsStageEditor: FC<StageEditorProps> = ({ stage, onChange }) => {
  const fields: Array<{ key: string; value: string }> = stage.config.fields || [];

  const handleFieldChange = (index: number, key: string, value: string) => {
    const next = [...fields];
    next[index] = { ...next[index], [key]: value };
    onChange({ ...stage.config, fields: next });
  };

  const handleAddField = () => {
    onChange({
      ...stage.config,
      fields: [...fields, { key: "", value: '""' }],
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
        Compute and add new fields to existing documents.
      </div>

      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={f.key}
              onChange={(e) => handleFieldChange(i, "key", e.target.value)}
              placeholder="fieldName"
              className="h-8 text-xs font-mono w-1/3"
            />
            <Input
              value={f.value}
              onChange={(e) => handleFieldChange(i, "value", e.target.value)}
              placeholder='expression or literal (e.g. { "$concat": ... })'
              className="h-8 text-xs font-mono flex-1"
            />
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
