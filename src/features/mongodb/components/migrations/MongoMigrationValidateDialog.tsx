import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck,
  ShieldAlert,
  Loader2,
  Code,
} from "lucide-react";
import { useValidateMongoMigration } from "../../hooks/useMongoMigrations";
import type {
  MongoMigrationManifest,
  MongoMigrationValidateResult,
} from "@/features/mongodb/types/migration";

interface MongoMigrationValidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId?: string;
}

const SAMPLE_MANIFEST: MongoMigrationManifest = {
  version: "1.0.0",
  id: "20261031_001_init_users",
  name: "Initialize Users Collection",
  description: "Creates users collection with schema validator and index",
  allowIrreversible: false,
  up: [
    {
      type: "createCollection",
      collection: "users",
      options: {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["email", "status"],
            properties: {
              email: { bsonType: "string" },
              status: { enum: ["active", "suspended"] },
            },
          },
        },
      },
    },
    {
      type: "createIndex",
      collection: "users",
      key: { email: 1 },
      options: { unique: true, name: "idx_users_email" },
    },
  ],
  down: [
    {
      type: "dropIndex",
      collection: "users",
      indexName: "idx_users_email",
    },
    {
      type: "dropCollection",
      collection: "users",
    },
  ],
};

export function MongoMigrationValidateDialog({
  open,
  onOpenChange,
  dbId,
}: MongoMigrationValidateDialogProps) {
  const [manifestText, setManifestText] = useState(() => JSON.stringify(SAMPLE_MANIFEST, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<MongoMigrationValidateResult | null>(null);

  const validateMutation = useValidateMongoMigration(dbId);

  const handleValidate = async () => {
    setParseError(null);
    setResult(null);

    let parsed: any;
    try {
      parsed = JSON.parse(manifestText);
    } catch (e: any) {
      setParseError(`JSON Syntax Error: ${e.message}`);
      return;
    }

    try {
      const res = await validateMutation.mutateAsync(parsed as MongoMigrationManifest);
      setResult(res);
    } catch {
      // toast already handled by hook
    }
  };

  const handleResetToSample = () => {
    setManifestText(JSON.stringify(SAMPLE_MANIFEST, null, 2));
    setParseError(null);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-5 gap-4">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <FileCheck className="h-5 w-5 text-emerald-500" />
            Validate Migration Manifest
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Performs static AST and expression safety verification without acquiring locks or
            touching database state.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <Code className="h-3.5 w-3.5 text-muted-foreground" />
              Manifest JSON Definition
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetToSample}
              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
            >
              Reset to Sample
            </Button>
          </div>

          <Textarea
            value={manifestText}
            onChange={(e) => setManifestText(e.target.value)}
            className="flex-1 min-h-[180px] font-mono text-xs p-3 resize-none bg-muted/20 border-border"
            placeholder="Paste your .mql.json manifest here..."
            spellCheck={false}
          />

          {parseError && (
            <Alert variant="destructive" className="py-2 text-xs">
              <XCircle className="h-4 w-4 shrink-0" />
              <AlertDescription className="font-mono text-[11px]">{parseError}</AlertDescription>
            </Alert>
          )}

          {result && (
            <ScrollArea className="max-h-[200px] rounded-md border border-border/50 p-3 bg-muted/10">
              <div className="space-y-3">
                {/* Result Status Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {result.valid ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 gap-1 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Valid Manifest Structure
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <XCircle className="h-3.5 w-3.5" />
                        Validation Failed
                      </Badge>
                    )}
                  </div>

                  {/* Step Breakdown */}
                  {result.stepsBreakdown && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <Badge variant="outline" className="text-[10px] bg-muted/40 font-mono">
                        DDL: {result.stepsBreakdown.ddlCount}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] bg-muted/40 font-mono">
                        Transforms: {result.stepsBreakdown.dataTransformCount}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-mono"
                      >
                        Reversible: {result.stepsBreakdown.reversibleCount}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30 font-mono"
                      >
                        Irreversible: {result.stepsBreakdown.irreversibleCount}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Errors List */}
                {result.errors && result.errors.length > 0 && (
                  <Alert variant="destructive" className="py-2 text-xs">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <AlertTitle className="text-xs font-semibold">
                      Errors ({result.errors.length})
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-4 space-y-1 mt-1 text-[11px] font-mono">
                        {result.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Warnings List */}
                {result.warnings && result.warnings.length > 0 && (
                  <Alert className="py-2 text-xs border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <AlertTitle className="text-xs font-semibold">
                      Warnings ({result.warnings.length})
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-4 space-y-1 mt-1 text-[11px] font-mono">
                        {result.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="shrink-0 flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-border/40">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={validateMutation.isPending}
          >
            Close
          </Button>
          <Button
            size="sm"
            onClick={handleValidate}
            disabled={validateMutation.isPending || !manifestText.trim()}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {validateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Validate Manifest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
