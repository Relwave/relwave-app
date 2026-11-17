import { FC } from "react";
import { StageEditorProps } from "../types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const LookupStageEditor: FC<StageEditorProps> = ({ stage, onChange, collections = [] }) => {
  const { from = "", localField = "", foreignField = "", as = "" } = stage.config;

  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      <div className="space-y-1">
        <label className="text-muted-foreground font-medium">Foreign Collection (from)</label>
        {collections.length > 0 ? (
          <Select value={from} onValueChange={(val) => onChange({ ...stage.config, from: val })}>
            <SelectTrigger className="h-8 text-xs font-mono">
              <SelectValue placeholder="Select collection" />
            </SelectTrigger>
            <SelectContent>
              {collections.map((c) => (
                <SelectItem key={c} value={c} className="text-xs font-mono">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={from}
            onChange={(e) => onChange({ ...stage.config, from: e.target.value })}
            placeholder="orders"
            className="h-8 text-xs font-mono"
          />
        )}
      </div>

      <div className="space-y-1">
        <label className="text-muted-foreground font-medium">Local Field (localField)</label>
        <Input
          value={localField}
          onChange={(e) => onChange({ ...stage.config, localField: e.target.value })}
          placeholder="_id"
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="space-y-1">
        <label className="text-muted-foreground font-medium">Foreign Field (foreignField)</label>
        <Input
          value={foreignField}
          onChange={(e) => onChange({ ...stage.config, foreignField: e.target.value })}
          placeholder="userId"
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="space-y-1">
        <label className="text-muted-foreground font-medium">Output Field (as)</label>
        <Input
          value={as}
          onChange={(e) => onChange({ ...stage.config, as: e.target.value })}
          placeholder="userOrders"
          className="h-8 text-xs font-mono"
        />
      </div>
    </div>
  );
};
