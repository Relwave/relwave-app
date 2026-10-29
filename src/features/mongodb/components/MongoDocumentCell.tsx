import React, { useState } from "react";
import { formatTimestamp } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export interface MongoFormattedValue {
  type: string;
  display: string;
  raw: any;
  badgeText?: string;
  badgeColor?: string;
  isExpandable?: boolean;
}

export function formatMongoValue(value: any, _column?: string): MongoFormattedValue {
  if (value === null || value === undefined) {
    return { type: "null", display: "NULL", raw: value, badgeText: "NULL" };
  }

  if (typeof value === "boolean") {
    return {
      type: "bool",
      display: value ? "true" : "false",
      raw: value,
      badgeText: "BOOL",
    };
  }

  if (typeof value === "number") {
    return {
      type: "number",
      display: value.toLocaleString(),
      raw: value,
      badgeText: "NUM",
    };
  }

  if (typeof value === "string") {
    return { type: "string", display: value, raw: value };
  }

  if (typeof value === "object") {
    if ("$oid" in value) {
      return {
        type: "objectId",
        display: String(value.$oid),
        raw: value,
        badgeText: "OID",
        badgeColor: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
      };
    }

    if ("$date" in value) {
      let isoStr = "";
      if (typeof value.$date === "string") {
        isoStr = value.$date;
      } else if (value.$date && typeof value.$date === "object" && "$numberLong" in value.$date) {
        const ms = parseInt(value.$date.$numberLong, 10);
        isoStr = !isNaN(ms) ? new Date(ms).toISOString() : String(value.$date.$numberLong);
      } else {
        isoStr = String(value.$date);
      }
      return {
        type: "date",
        display: formatTimestamp(isoStr) || isoStr,
        raw: value,
        badgeText: "DATE",
        badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      };
    }

    if ("$numberLong" in value) {
      return {
        type: "long",
        display: String(value.$numberLong),
        raw: value,
        badgeText: "LONG",
        badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      };
    }

    if ("$numberDecimal" in value) {
      return {
        type: "decimal",
        display: String(value.$numberDecimal),
        raw: value,
        badgeText: "DEC",
        badgeColor: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
      };
    }

    if ("$numberInt" in value) {
      return {
        type: "number",
        display: String(value.$numberInt),
        raw: value,
        badgeText: "INT",
      };
    }

    if ("$numberDouble" in value) {
      return {
        type: "number",
        display: String(value.$numberDouble),
        raw: value,
        badgeText: "DBL",
      };
    }

    if ("$binary" in value) {
      const b64 = value.$binary.base64 || value.$binary.$base64 || "";
      return {
        type: "binary",
        display: `<Binary ${b64.length} chars>`,
        raw: value,
        badgeText: "BIN",
        badgeColor: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
      };
    }

    if ("$timestamp" in value) {
      const t = value.$timestamp.t ?? value.$timestamp.$t ?? 0;
      const i = value.$timestamp.i ?? value.$timestamp.$i ?? 0;
      return {
        type: "timestamp",
        display: `Timestamp(${t}, ${i})`,
        raw: value,
        badgeText: "TS",
      };
    }

    if ("$regex" in value) {
      return {
        type: "regex",
        display: `/${value.$regex}/${value.$options || ""}`,
        raw: value,
        badgeText: "REGEX",
      };
    }

    if ("$undefined" in value) {
      return { type: "undefined", display: "undefined", raw: value, badgeText: "UNDEF" };
    }

    if (Array.isArray(value)) {
      return {
        type: "array",
        display: `Array(${value.length})`,
        raw: value,
        badgeText: `[${value.length}]`,
        badgeColor:
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        isExpandable: true,
      };
    }

    const keys = Object.keys(value);
    return {
      type: "object",
      display: `{${keys.length} fields}`,
      raw: value,
      badgeText: `{${keys.length}}`,
      badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      isExpandable: true,
    };
  }

  return { type: "unknown", display: String(value), raw: value };
}

export function MongoDocumentCell({
  value,
  column,
  row: _row,
}: {
  value: any;
  column: string;
  row: Record<string, any>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatted = formatMongoValue(value, column);

  const handleCopyJson = (e: React.MouseEvent) => {
    e.stopPropagation();
    const str = JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(str);
    setCopied(true);
    toast.success("JSON copied to clipboard", { duration: 1500 });
    setTimeout(() => setCopied(false), 1500);
  };

  if (formatted.type === "null") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono italic text-muted-foreground/45 bg-muted/40 border border-border/20 select-none">
        NULL
      </span>
    );
  }

  if (formatted.type === "bool") {
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium border ${
          formatted.display === "true"
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
        }`}
      >
        {formatted.display}
      </span>
    );
  }

  if (formatted.isExpandable) {
    const jsonStr = JSON.stringify(value);
    const truncatedPreview = jsonStr.length > 50 ? `${jsonStr.slice(0, 50)}…` : jsonStr;

    return (
      <>
        <div className="flex items-center gap-1.5 group/expand">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDialogOpen(true);
            }}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border hover:brightness-110 cursor-pointer transition-all ${
              formatted.badgeColor || "bg-muted text-muted-foreground border-border/40"
            }`}
            title="Click to view full structure"
          >
            <span>{formatted.badgeText}</span>
            <ChevronRight className="h-3 w-3 opacity-60 group-hover/expand:translate-x-0.5 transition-transform" />
          </button>
          <span className="text-muted-foreground text-xs font-mono truncate max-w-[200px]">
            {truncatedPreview}
          </span>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between pr-6">
                <div>
                  <DialogTitle className="font-mono text-base flex items-center gap-2">
                    <span>{column}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                      {formatted.type}
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-1">
                    Document field inspection
                  </DialogDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyJson}
                  className="gap-1.5 text-xs h-8"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy JSON"}
                </Button>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-auto bg-muted/30 border border-border/40 rounded-md p-3">
              <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-all select-text">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {formatted.badgeText && (
        <span
          className={`px-1 py-0.2 rounded text-[9px] font-mono tracking-wider border select-none ${
            formatted.badgeColor || "bg-muted/60 text-muted-foreground border-border/30"
          }`}
        >
          {formatted.badgeText}
        </span>
      )}
      <span className="font-mono text-xs text-foreground truncate">{formatted.display}</span>
    </div>
  );
}
