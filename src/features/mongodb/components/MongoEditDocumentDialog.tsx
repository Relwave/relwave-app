import React, { useState, useEffect, useMemo } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Edit, FileCode, Check, AlertCircle, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { EJSONDocument } from "../types";
import { useUpdateMongoDocument, useReplaceMongoDocument } from "../hooks/useMongoMutations";
import { computeDocumentDiff } from "../hooks/useDocumentDiff";
import { validateJsonDocument } from "../utils/validation";

interface MongoEditDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  collection: string;
  document: EJSONDocument | null;
  onRefreshView: () => void;
}

export function MongoEditDocumentDialog({
  open,
  onOpenChange,
  dbId,
  collection,
  document,
  onRefreshView,
}: MongoEditDocumentDialogProps) {
  const [mode, setMode] = useState<"patch" | "replace">("patch");
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateMongoDocument(dbId);
  const replaceMutation = useReplaceMongoDocument(dbId);

  useEffect(() => {
    if (open && document) {
      setJsonText(JSON.stringify(document, null, 2));
      setError(null);
      setMode("patch");
    }
  }, [open, document]);

  const idFormatted = useMemo(() => {
    if (!document?._id) return "unknown";
    if (typeof document._id === "object" && "$oid" in document._id) {
      return document._id.$oid;
    }
    return String(document._id);
  }, [document]);

  const parsedDoc = useMemo(() => {
    try {
      const p = JSON.parse(jsonText);
      return typeof p === "object" && p !== null && !Array.isArray(p) ? p : null;
    } catch {
      return null;
    }
  }, [jsonText]);

  const diffResult = useMemo(() => {
    if (!document || !parsedDoc || mode !== "patch") return null;
    try {
      return computeDocumentDiff(document, parsedDoc);
    } catch (err: any) {
      return { error: err.message };
    }
  }, [document, parsedDoc, mode]);

  const handleTextChange = (text: string) => {
    setJsonText(text);
    const val = validateJsonDocument(text);
    if (!val.valid) {
      setError(val.error || "Invalid JSON");
      return;
    }
    if (document?._id !== undefined) {
      const parsed = val.doc;
      if (parsed && JSON.stringify(parsed._id) !== JSON.stringify(document._id)) {
        setError("_id is immutable and cannot be modified");
        return;
      }
    }
    setError(null);
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

  const isSaving = updateMutation.isPending || replaceMutation.isPending;

  const handleSubmit = async () => {
    if (!document) return;
    const val = validateJsonDocument(jsonText);
    if (!val.valid || !val.doc) {
      setError(val.error || "Please enter valid JSON");
      return;
    }

    const editedDoc = val.doc;

    try {
      if (mode === "patch") {
        const diff = computeDocumentDiff(document, editedDoc);
        if (!diff.hasChanges || !diff.updateDoc) {
          toast.info("No changes made", {
            description: "The document already contained the specified values.",
          });
          onOpenChange(false);
          return;
        }

        const res = await updateMutation.mutateAsync({
          collection,
          filter: { _id: document._id },
          update: diff.updateDoc,
        });

        if (res.matchedCount === 0) {
          toast.error("Document not found", {
            description:
              "The target document no longer exists. It may have been deleted concurrently.",
          });
          onRefreshView();
          onOpenChange(false);
          return;
        }

        if (res.modifiedCount === 0) {
          toast.info("No changes made", {
            description: "The document already contained the specified values.",
          });
        } else {
          toast.success("Document updated successfully");
        }
        onOpenChange(false);
      } else {
        // Mode B: Full Document Replacement
        const res = await replaceMutation.mutateAsync({
          collection,
          filter: { _id: document._id },
          replacement: editedDoc,
        });

        if (res.matchedCount === 0) {
          toast.error("Document not found", {
            description:
              "The target document no longer exists. It may have been deleted concurrently.",
          });
          onRefreshView();
          onOpenChange(false);
          return;
        }

        if (res.modifiedCount === 0) {
          toast.info("No changes made", {
            description: "The replacement was identical to current document.",
          });
        } else {
          toast.success("Document replaced successfully");
        }
        onOpenChange(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to update document");
      toast.error("Update failed", { description: err.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-4 w-4 text-emerald-500" />
              Edit Document in <span className="font-mono text-emerald-500">{collection}</span>
            </DialogTitle>
          </div>
          <DialogDescription className="flex items-center gap-2 pt-1 font-mono text-xs">
            <Lock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">_id:</span>
            <span className="bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">
              {idFormatted}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Mode Selector and Controls */}
        <div className="flex items-center justify-between gap-2 py-1 border-b border-border/40">
          <Tabs value={mode} onValueChange={(val) => setMode(val as "patch" | "replace")}>
            <TabsList className="h-7 bg-muted/60">
              <TabsTrigger value="patch" className="text-xs px-2.5 h-6">
                Field Patch Mode (Safe)
              </TabsTrigger>
              <TabsTrigger value="replace" className="text-xs px-2.5 h-6">
                Full Replacement
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFormat}
            disabled={isSaving}
            className="h-7 text-xs gap-1.5"
          >
            <FileCode className="h-3.5 w-3.5" />
            Format JSON
          </Button>
        </div>

        {/* Warning banner in Replacement Mode */}
        {mode === "replace" && (
          <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <strong>Warning:</strong> Full Replacement mode replaces the entire document. Fields
              omitted from this editor will be permanently deleted.
            </span>
          </div>
        )}

        {/* Editor Area */}
        <div className="flex-1 min-h-[220px] flex flex-col py-1">
          <Textarea
            value={jsonText}
            onChange={(e) => handleTextChange(e.target.value)}
            className="flex-1 font-mono text-xs leading-relaxed resize-none bg-background/50 border-border/50 min-h-[220px]"
            spellCheck={false}
          />

          {/* MQL Preview in Patch mode */}
          {mode === "patch" && diffResult && (
            <div className="mt-2 p-2 rounded bg-muted/40 border border-border/40 text-xs font-mono max-h-24 overflow-auto">
              {"error" in diffResult ? (
                <span className="text-destructive font-sans">{diffResult.error}</span>
              ) : diffResult.hasChanges ? (
                <div className="space-y-1">
                  <span className="text-muted-foreground font-sans font-medium text-[11px] block">
                    Generated MQL Preview:
                  </span>
                  <pre className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    {JSON.stringify(diffResult.updateDoc, null, 2)}
                  </pre>
                </div>
              ) : (
                <span className="text-muted-foreground font-sans text-xs">
                  No changes detected.
                </span>
              )}
            </div>
          )}

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
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={Boolean(
              isSaving ||
              error ||
              (mode === "patch" &&
                diffResult &&
                "hasChanges" in diffResult &&
                !diffResult.hasChanges),
            )}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
