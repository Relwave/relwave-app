import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Sparkles, FileCode, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useInsertMongoDocument } from "../hooks/useMongoMutations";
import { useMongoSchema } from "@/features/project/hooks/useDbQueries";
import { validateJsonDocument } from "../utils/validation";

interface MongoInsertDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  collection: string;
}

export function MongoInsertDocumentDialog({
  open,
  onOpenChange,
  dbId,
  collection,
}: MongoInsertDocumentDialogProps) {
  const [jsonText, setJsonText] = useState("{\n  \n}");
  const [error, setError] = useState<string | null>(null);

  const insertMutation = useInsertMongoDocument(dbId);
  const { data: schemaData, isLoading: schemaLoading } = useMongoSchema(
    dbId,
    collection,
    undefined,
    undefined,
    open,
  );

  useEffect(() => {
    if (open) {
      setJsonText("{\n  \n}");
      setError(null);
    }
  }, [open, collection]);

  const handleTextChange = (text: string) => {
    setJsonText(text);
    const val = validateJsonDocument(text);
    setError(val.valid ? null : val.error || "Invalid JSON");
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch (e: any) {
      setError(e.message || "Cannot format invalid JSON");
    }
  };

  const handleEmpty = () => {
    setJsonText("{\n  \n}");
    setError(null);
  };

  const handleGenerateTemplate = () => {
    if (!schemaData?.fields || schemaData.fields.length === 0) {
      toast.info("No inferred schema fields available yet for this collection.");
      return;
    }

    const template: Record<string, any> = {};
    for (const field of schemaData.fields) {
      if (field.depth > 0) continue; // Keep top-level keys in template
      if (field.path === "_id") continue; // MongoDB generates _id automatically

      switch (field.bsonType) {
        case "string":
          template[field.path] = "";
          break;
        case "number":
          template[field.path] = 0;
          break;
        case "long":
          template[field.path] = { $numberLong: "0" };
          break;
        case "decimal":
          template[field.path] = { $numberDecimal: "0.0" };
          break;
        case "date":
          template[field.path] = { $date: new Date().toISOString() };
          break;
        case "bool":
          template[field.path] = false;
          break;
        case "array":
          template[field.path] = [];
          break;
        case "object":
          template[field.path] = {};
          break;
        case "null":
          template[field.path] = null;
          break;
        default:
          template[field.path] = "";
      }
    }

    setJsonText(JSON.stringify(template, null, 2));
    setError(null);
    toast.success("Generated template from inferred collection schema");
  };

  const handleSubmit = async () => {
    const val = validateJsonDocument(jsonText);
    if (!val.valid || !val.doc) {
      setError(val.error || "Please enter a valid JSON document");
      return;
    }

    try {
      await insertMutation.mutateAsync({
        collection,
        document: val.doc,
      });
      toast.success("Document inserted successfully");
      onOpenChange(false);
    } catch (err: any) {
      const msg = err.message || "Failed to insert document";
      if (msg.includes("E11000") || msg.includes("duplicate key")) {
        setError("Duplicate Key Error: A document with this unique key or _id already exists.");
        toast.error("Duplicate key error (E11000)");
      } else {
        setError(msg);
        toast.error("Insert failed", { description: msg });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-500" />
            Insert Document into <span className="font-mono text-emerald-500">{collection}</span>
          </DialogTitle>
          <DialogDescription>
            Enter document fields in standard JSON or Extended JSON (EJSON v2) format.
          </DialogDescription>
        </DialogHeader>

        {/* Action toolbar */}
        <div className="flex items-center justify-between gap-2 py-1 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateTemplate}
              disabled={schemaLoading || insertMutation.isPending}
              className="h-7 text-xs gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              Generate from Schema
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleEmpty}
              disabled={insertMutation.isPending}
              className="h-7 text-xs gap-1.5"
            >
              Empty Document
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFormat}
            disabled={insertMutation.isPending}
            className="h-7 text-xs gap-1.5"
          >
            <FileCode className="h-3.5 w-3.5" />
            Format JSON
          </Button>
        </div>

        {/* Editor Area */}
        <div className="flex-1 min-h-[260px] flex flex-col py-2">
          <Textarea
            value={jsonText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder='{\n  "name": "Example"\n}'
            className="flex-1 font-mono text-xs leading-relaxed resize-none bg-background/50 border-border/50 min-h-[240px]"
            spellCheck={false}
          />

          {error && (
            <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={insertMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={insertMutation.isPending || !!error}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {insertMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Inserting...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Insert Document
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
