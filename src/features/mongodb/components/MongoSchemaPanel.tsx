import React, { useState } from "react";
import { useMongoSchema } from "@/features/project/hooks/useDbQueries";
import { MongoBsonType, MongoInferredField } from "../types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, GitBranch, AlertTriangle, Database } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";

function getBsonTypeBadge(type: MongoBsonType) {
  switch (type) {
    case "objectId":
      return "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30";
    case "string":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "number":
      return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30";
    case "long":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "decimal":
      return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30";
    case "date":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30";
    case "bool":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    case "array":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
    case "object":
      return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30";
    case "binary":
      return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
    default:
      return "bg-muted text-muted-foreground border-border/40";
  }
}

export function MongoSchemaPanel({ dbId, collection }: { dbId: string; collection: string }) {
  const [sampleSize, setSampleSize] = useState<number>(100);

  const {
    data: schema,
    isLoading,
    refetch,
    isFetching,
  } = useMongoSchema(dbId, collection, sampleSize);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Header toolbar */}
      <div className="p-3 border-b border-border/40 flex flex-wrap items-center justify-between gap-3 bg-sidebar/20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold text-xs text-foreground">
              Statistical Schema Inference
            </span>
          </div>

          {schema && (
            <span className="text-xs text-muted-foreground">
              Scanned <strong>{schema.sampleSize}</strong> of ~
              <strong>{schema.totalDocs.toLocaleString()}</strong> docs &bull; Discovered{" "}
              <strong>{schema.fieldCount}</strong> fields ({schema.nestedFieldCount} nested,{" "}
              {schema.arrayFieldCount} arrays) &bull; {formatTimestamp(schema.inferredAt)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Sample size:</span>
            <Select value={String(sampleSize)} onValueChange={(val) => setSampleSize(Number(val))}>
              <SelectTrigger className="h-7 w-20 text-xs bg-background/50 border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="250">250</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1,000</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            className="h-7 gap-1.5 text-xs"
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Re-infer
          </Button>
        </div>
      </div>

      {/* Main Field Tree Area */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
            <p className="text-xs">Sampling documents and inferring schema...</p>
          </div>
        ) : !schema || schema.fields.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="rounded-full bg-muted/40 p-4 mb-3">
              <Database className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <h3 className="text-sm font-medium text-foreground">No schema inferred</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Collection "{collection}" has no documents to sample.
            </p>
          </div>
        ) : (
          <div className="border border-border/40 rounded-lg overflow-hidden bg-background/60 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-2 px-3">Field Path</th>
                  <th className="py-2 px-3 w-32">Type</th>
                  <th className="py-2 px-3 w-48">Presence</th>
                  <th className="py-2 px-3">Attributes &amp; Conflicts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 font-mono text-xs">
                {schema.fields.map((field: MongoInferredField) => {
                  const hasConflict = field.typeConflicts && field.typeConflicts.length > 1;
                  return (
                    <tr key={field.path} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3">
                        <div
                          className="flex items-center gap-1.5"
                          style={{ paddingLeft: `${field.depth * 20}px` }}
                        >
                          {field.depth > 0 && (
                            <span className="text-muted-foreground/40 font-normal">↳</span>
                          )}
                          <span
                            className={
                              field.path === "_id"
                                ? "font-semibold text-emerald-500 dark:text-emerald-400"
                                : "text-foreground font-medium"
                            }
                          >
                            {field.path}
                          </span>
                        </div>
                      </td>

                      <td className="py-2 px-3">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-mono border ${getBsonTypeBadge(
                            field.bsonType,
                          )}`}
                        >
                          {field.bsonType}
                        </span>
                      </td>

                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <Progress value={field.presencePct} className="h-1.5 w-20 bg-muted" />
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {field.presencePct}% ({field.count}/{field.sampleSize})
                          </span>
                        </div>
                      </td>

                      <td className="py-2 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {field.optional && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              optional
                            </span>
                          )}

                          {field.nullable && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              nullable ({field.nullCount})
                            </span>
                          )}

                          {field.isArray && field.arrayElementTypes && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              items: [{field.arrayElementTypes.join(", ")}]
                            </span>
                          )}

                          {hasConflict && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] bg-destructive/10 text-destructive border border-destructive/20 font-semibold">
                              <AlertTriangle className="h-3 w-3" />
                              conflict:{" "}
                              {field.typeConflicts
                                .map((c) => `${c.bsonType} (${c.count})`)
                                .join(", ")}
                            </span>
                          )}

                          {field.truncated && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-muted text-muted-foreground border border-border/30">
                              depth limit reached
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
