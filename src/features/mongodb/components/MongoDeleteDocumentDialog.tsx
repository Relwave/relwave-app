import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { EJSONDocument } from "../types";
import { useDeleteMongoDocument } from "../hooks/useMongoMutations";

interface MongoDeleteDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  collection: string;
  document: EJSONDocument | null;
  onRefreshView: () => void;
}

export function MongoDeleteDocumentDialog({
  open,
  onOpenChange,
  dbId,
  collection,
  document,
  onRefreshView,
}: MongoDeleteDocumentDialogProps) {
  const deleteMutation = useDeleteMongoDocument(dbId);

  const idFormatted = useMemo(() => {
    if (!document?._id) return "unknown";
    if (typeof document._id === "object" && "$oid" in document._id) {
      return document._id.$oid;
    }
    return String(document._id);
  }, [document]);

  const previewFields = useMemo(() => {
    if (!document) return [];
    return Object.entries(document)
      .filter(([k]) => k !== "_id")
      .slice(0, 4)
      .map(([k, v]) => ({
        key: k,
        val: typeof v === "object" ? JSON.stringify(v) : String(v),
      }));
  }, [document]);

  const handleDelete = async () => {
    if (!document?._id) return;
    try {
      const res = await deleteMutation.mutateAsync({
        collection,
        filter: { _id: document._id },
        options: { multi: false },
      });

      if (res.deletedCount === 0) {
        toast.warning("Document not found", {
          description: "The document may have already been deleted concurrently.",
        });
      } else {
        toast.success("Document deleted successfully");
      }

      onRefreshView();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Delete failed", { description: err.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Document
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this document from{" "}
            <span className="font-mono text-foreground font-semibold">{collection}</span>?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Target details */}
          <div className="p-3 rounded-md bg-muted/50 border border-border/50 text-xs font-mono space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-semibold">_id:</span>
              <span className="text-foreground font-bold">{idFormatted}</span>
            </div>

            {previewFields.length > 0 && (
              <div className="pt-1.5 border-t border-border/30 space-y-1">
                {previewFields.map(({ key, val }) => (
                  <div key={key} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground truncate">{key}:</span>
                    <span className="text-foreground/90 truncate max-w-[200px]">{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-2.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            Filter: <code className="font-mono">{"{ _id: " + idFormatted + " }"}</code>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="gap-2"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete Document
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
