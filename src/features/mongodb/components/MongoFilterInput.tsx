import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Filter, X, CheckCircle2, AlertCircle } from "lucide-react";
import { EJSONDocument } from "../types";

export interface MongoFilterValidation {
  isValid: boolean;
  error?: string;
  parsed?: EJSONDocument;
}

export function validateMongoFilter(text: string): MongoFilterValidation {
  const trimmed = text.trim();
  if (!trimmed) {
    return { isValid: true, parsed: undefined };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        isValid: false,
        error: 'Filter must be a JSON object, e.g. {"status": "active"}',
      };
    }
    return { isValid: true, parsed };
  } catch (err: any) {
    return { isValid: false, error: err.message || "Invalid JSON syntax" };
  }
}

export function MongoFilterInput({
  filterInput,
  onFilterInputChange,
  onApply,
  onReset,
  isApplied,
}: {
  filterInput: string;
  onFilterInputChange: (text: string) => void;
  onApply: (filter: EJSONDocument | undefined) => void;
  onReset: () => void;
  isApplied: boolean;
}) {
  const [validation, setValidation] = useState<MongoFilterValidation>(() =>
    validateMongoFilter(filterInput),
  );

  useEffect(() => {
    setValidation(validateMongoFilter(filterInput));
  }, [filterInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && validation.isValid) {
      e.preventDefault();
      onApply(validation.parsed);
    }
  };

  const handleApply = () => {
    if (validation.isValid) {
      onApply(validation.parsed);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-xl">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
          <Input
            value={filterInput}
            onChange={(e) => onFilterInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='EJSON Filter: {"status": "active"} or {"_id": {"$oid": "..."}}'
            className="pl-9 pr-8 font-mono text-xs h-9 bg-background/50 border-border/50 focus-visible:ring-emerald-500/30"
          />
          {filterInput && (
            <button
              type="button"
              onClick={onReset}
              className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Button
          size="sm"
          disabled={!validation.isValid}
          onClick={handleApply}
          className="h-9 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          Apply
        </Button>

        {isApplied && (
          <Button
            size="sm"
            variant="outline"
            onClick={onReset}
            className="h-9 px-2.5 text-xs text-muted-foreground"
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        {filterInput.trim() ? (
          validation.isValid ? (
            <span className="flex items-center gap-1 text-emerald-500 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Valid EJSON filter
            </span>
          ) : (
            <span className="flex items-center gap-1 text-destructive font-mono">
              <AlertCircle className="h-3 w-3 shrink-0" /> {validation.error}
            </span>
          )
        ) : (
          <span className="text-muted-foreground/60">
            Enter an Extended-JSON object to filter documents
          </span>
        )}
      </div>
    </div>
  );
}
