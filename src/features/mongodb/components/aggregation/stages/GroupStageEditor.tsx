import { FC } from "react";
import { StageEditorProps } from "../types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

const ACCUMULATORS = ["$sum", "$avg", "$min", "$max", "$first", "$last", "$push", "$addToSet"];

export const GroupStageEditor: FC<StageEditorProps> = ({ stage, onChange }) => {
  const idType = stage.config.idType || "field";
  const idField = stage.config.idField || "";
  const customId = stage.config.customId || "";
  const accumulators: Array<{ name: string; op: string; expr: string }> =
    stage.config.accumulators || [];

  const handleAccChange = (index: number, key: string, val: string) => {
    const next = [...accumulators];
    next[index] = { ...next[index], [key]: val };
    onChange({ ...stage.config, accumulators: next });
  };

  const handleAddAcc = () => {
    onChange({
      ...stage.config,
      accumulators: [...accumulators, { name: "", op: "$sum", expr: "1" }],
    });
  };

  const handleRemoveAcc = (index: number) => {
    onChange({
      ...stage.config,
      accumulators: accumulators.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-4">
      {/* _id selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground">
          Group Identifier (_id)
        </label>
        <div className="flex items-center gap-2">
          <Select
            value={idType}
            onValueChange={(val) => onChange({ ...stage.config, idType: val })}
          >
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="field" className="text-xs">
                Field Path
              </SelectItem>
              <SelectItem value="null" className="text-xs">
                null (Global)
              </SelectItem>
              <SelectItem value="custom" className="text-xs">
                Custom Expression
              </SelectItem>
            </SelectContent>
          </Select>

          {idType === "field" && (
            <Input
              value={idField}
              onChange={(e) => onChange({ ...stage.config, idField: e.target.value })}
              placeholder="$category or category"
              className="h-8 text-xs font-mono flex-1"
            />
          )}

          {idType === "custom" && (
            <Input
              value={customId}
              onChange={(e) => onChange({ ...stage.config, customId: e.target.value })}
              placeholder='{ "year": "$year", "month": "$month" }'
              className="h-8 text-xs font-mono flex-1"
            />
          )}
        </div>
      </div>

      {/* Accumulators */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground">Accumulators</div>
        <div className="space-y-2">
          {accumulators.map((acc, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={acc.name}
                onChange={(e) => handleAccChange(i, "name", e.target.value)}
                placeholder="totalAmount"
                className="h-8 text-xs font-mono w-1/3"
              />
              <Select value={acc.op} onValueChange={(val) => handleAccChange(i, "op", val)}>
                <SelectTrigger className="h-8 text-xs w-28 font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCUMULATORS.map((op) => (
                    <SelectItem key={op} value={op} className="text-xs font-mono">
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={acc.expr}
                onChange={(e) => handleAccChange(i, "expr", e.target.value)}
                placeholder="1 or $amount"
                className="h-8 text-xs font-mono flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemoveAcc(i)}
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
          onClick={handleAddAcc}
        >
          <Plus className="h-3 w-3" />
          Add Accumulator
        </Button>
      </div>
    </div>
  );
};
