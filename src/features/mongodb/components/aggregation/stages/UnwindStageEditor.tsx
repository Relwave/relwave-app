import { FC } from "react";
import { StageEditorProps } from "../types";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const UnwindStageEditor: FC<StageEditorProps> = ({ stage, onChange }) => {
  const path = stage.config.path ?? "$items";
  const preserve = Boolean(stage.config.preserveNullAndEmptyArrays);

  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-1">
        <label className="text-muted-foreground font-medium">Array Field Path</label>
        <Input
          value={path}
          onChange={(e) => onChange({ ...stage.config, path: e.target.value })}
          placeholder="$items or items"
          className="h-8 text-xs font-mono w-full"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="space-y-0.5">
          <div className="font-medium text-foreground">Preserve Null and Empty Arrays</div>
          <div className="text-[11px] text-muted-foreground">
            If true, documents with null or missing array values will not be dropped.
          </div>
        </div>
        <Switch
          checked={preserve}
          onCheckedChange={(checked) =>
            onChange({ ...stage.config, preserveNullAndEmptyArrays: checked })
          }
        />
      </div>
    </div>
  );
};
