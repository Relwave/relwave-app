import { FC } from "react";
import { StageEditorProps } from "../types";
import { Input } from "@/components/ui/input";

export const LimitSkipStageEditor: FC<StageEditorProps> = ({ stage, onChange }) => {
  const isLimit = stage.type === "$limit";
  const val = isLimit ? (stage.config.limit ?? 10) : (stage.config.skip ?? 0);

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">
        {isLimit ? "Number of documents to pass ($limit):" : "Number of documents to skip ($skip):"}
      </label>
      <Input
        type="number"
        min={isLimit ? 1 : 0}
        value={val}
        onChange={(e) => {
          const num = parseInt(e.target.value, 10);
          onChange({ [isLimit ? "limit" : "skip"]: isNaN(num) ? 0 : num });
        }}
        className="h-8 text-xs font-mono w-48"
      />
    </div>
  );
};
