import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Trash2 } from "lucide-react";
import { useMongoSchema } from "@/features/project/hooks/useDbQueries";
import type { MongoCardinality, MongoRelationship } from "../../types/relationship";

export interface MongoManualRelationshipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: string[];
  initialRelationship?: MongoRelationship | null;
  onSave: (rel: MongoRelationship) => Promise<any> | void;
  onDelete?: (id: string) => Promise<any> | void;
  isSaving?: boolean;
  isDeleting?: boolean;
  dbId?: string;
}

export function MongoManualRelationshipDialog({
  open,
  onOpenChange,
  collections,
  initialRelationship,
  onSave,
  onDelete,
  isSaving = false,
  isDeleting = false,
  dbId,
}: MongoManualRelationshipDialogProps) {
  const isEditMode = Boolean(initialRelationship);

  const [sourceCollection, setSourceCollection] = useState("");
  const [sourceField, setSourceField] = useState("");
  const [targetCollection, setTargetCollection] = useState("");
  const [targetField, setTargetField] = useState("_id");
  const [cardinality, setCardinality] = useState<MongoCardinality>("many-to-one");
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Schema-assisted field discovery
  const { data: sourceSchema } = useMongoSchema(
    dbId,
    sourceCollection,
    undefined,
    undefined,
    open && Boolean(dbId && sourceCollection),
  );
  const { data: targetSchema } = useMongoSchema(
    dbId,
    targetCollection,
    undefined,
    undefined,
    open && Boolean(dbId && targetCollection),
  );

  const sourceFieldPaths = useMemo(() => {
    return (sourceSchema?.fields || []).map((f) => f.path);
  }, [sourceSchema]);

  const targetFieldPaths = useMemo(() => {
    return (targetSchema?.fields || []).map((f) => f.path);
  }, [targetSchema]);

  useEffect(() => {
    if (initialRelationship) {
      setSourceCollection(initialRelationship.sourceCollection);
      setSourceField(initialRelationship.sourceField);
      setTargetCollection(initialRelationship.targetCollection);
      setTargetField(initialRelationship.targetField || "_id");
      setCardinality(initialRelationship.cardinality);
      setDescription(initialRelationship.description || "");
    } else {
      setSourceCollection(collections[0] || "");
      setSourceField("");
      setTargetCollection(collections[1] || collections[0] || "");
      setTargetField("_id");
      setCardinality("many-to-one");
      setDescription("");
    }
    setValidationError(null);
  }, [initialRelationship, collections, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedSourceField = sourceField.trim();
    const trimmedTargetField = targetField.trim();

    if (!sourceCollection) {
      setValidationError("Source collection is required.");
      return;
    }
    if (!trimmedSourceField) {
      setValidationError("Source field is required.");
      return;
    }
    if (!targetCollection) {
      setValidationError("Target collection is required.");
      return;
    }
    if (!trimmedTargetField) {
      setValidationError("Target field is required.");
      return;
    }

    if (sourceCollection === targetCollection && trimmedSourceField === trimmedTargetField) {
      setValidationError(
        "Source and target cannot be the exact same field on the same collection.",
      );
      return;
    }

    const now = new Date().toISOString();
    const relId =
      initialRelationship?.id ||
      `${sourceCollection}.${trimmedSourceField}->${targetCollection}.${trimmedTargetField}`;

    const rel: MongoRelationship = {
      id: relId,
      sourceCollection,
      sourceField: trimmedSourceField,
      targetCollection,
      targetField: trimmedTargetField,
      cardinality,
      isManual: true,
      description: description.trim() || undefined,
      createdAt: initialRelationship?.createdAt || now,
      updatedAt: now,
    };

    await onSave(rel);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (initialRelationship && onDelete) {
      await onDelete(initialRelationship.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Manual Relationship" : "Add Manual Relationship"}
          </DialogTitle>
          <DialogDescription>
            Define reference metadata between collections. Manual relationships do not enforce
            database constraints.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {validationError && (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Source Collection</Label>
              <Select
                value={sourceCollection}
                onValueChange={setSourceCollection}
                disabled={isEditMode}
              >
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue placeholder="Select collection" />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((c) => (
                    <SelectItem key={c} value={c} className="font-mono text-xs">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Source Field</Label>
              <Input
                value={sourceField}
                onChange={(e) => setSourceField(e.target.value)}
                placeholder="e.g. user_id or author.id"
                disabled={isEditMode}
                className="h-8 text-xs font-mono"
              />
              {!isEditMode && sourceFieldPaths.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1 max-h-16 overflow-y-auto">
                  {sourceFieldPaths.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => setSourceField(path)}
                      className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40 transition-colors"
                      title={`Select field ${path}`}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Target Collection</Label>
              <Select
                value={targetCollection}
                onValueChange={setTargetCollection}
                disabled={isEditMode}
              >
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue placeholder="Select collection" />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((c) => (
                    <SelectItem key={c} value={c} className="font-mono text-xs">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Target Field</Label>
              <Input
                value={targetField}
                onChange={(e) => setTargetField(e.target.value)}
                placeholder="_id"
                disabled={isEditMode}
                className="h-8 text-xs font-mono"
              />
              {!isEditMode && targetFieldPaths.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1 max-h-16 overflow-y-auto">
                  {targetFieldPaths.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => setTargetField(path)}
                      className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40 transition-colors"
                      title={`Select field ${path}`}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Cardinality</Label>
            <Select
              value={cardinality}
              onValueChange={(val) => setCardinality(val as MongoCardinality)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one-to-one">1:1 (One-to-One)</SelectItem>
                <SelectItem value="one-to-many">1:N (One-to-Many)</SelectItem>
                <SelectItem value="many-to-one">N:1 (Many-to-One)</SelectItem>
                <SelectItem value="many-to-many">N:M (Many-to-Many)</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description (Optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. References users collection for author metadata"
              className="h-8 text-xs font-sans"
            />
          </div>

          <div className="p-2.5 rounded-md bg-muted/40 text-[11px] text-muted-foreground border">
            Manual relationships are saved to RelWave metadata for ER diagrams and query builder
            assistance.
          </div>

          <DialogFooter className="flex items-center justify-between pt-2">
            {isEditMode && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving ? "Saving..." : isEditMode ? "Save Changes" : "Create Relationship"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
