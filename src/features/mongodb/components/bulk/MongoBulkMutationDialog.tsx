/**
 * MongoDB Milestone 7 Phase 4 Stage 6 — Bulk Mutation Dialog
 *
 * Guarded multi-tab modal for Bulk Update, Delete, and Insert operations:
 * - Update: top-level operator validation and unrestricted confirmation gate
 * - Delete: empty-filter double verification gate (collection name typing + checkbox)
 * - Insert: JSON documents editor with document count & byte size boundaries
 * - Immediate state reset on collection or filter text change
 * - Non-cancellation background continuation communication
 * - Read-only database protection
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  AlertCircle,
  Loader2,
  Trash2,
  FileEdit,
  PlusCircle,
  Database,
} from "lucide-react";
import { parseAndValidateFilter, parseAndValidateUpdate } from "../../utils/mongoSemanticEmpty";
import {
  useMongoBulkMutations,
  type BulkMutationsServiceContract,
} from "../../hooks/useMongoBulkMutations";

export interface MongoBulkMutationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  databaseName: string;
  defaultCollection?: string;
  initialMode?: "update" | "delete" | "insert";
  collections?: string[];
  isReadOnly?: boolean;
  service?: BulkMutationsServiceContract;
}

export function MongoBulkMutationDialog({
  open,
  onOpenChange,
  dbId,
  databaseName,
  defaultCollection = "",
  initialMode = "update",
  collections,
  isReadOnly = false,
  service,
}: MongoBulkMutationDialogProps) {
  const [activeTab, setActiveTab] = useState<"update" | "delete" | "insert">(initialMode);
  const [collection, setCollection] = useState<string>(defaultCollection);

  // Update Tab States
  const [updateFilterText, setUpdateFilterText] = useState("{}");
  const [updateDocText, setUpdateDocText] = useState('{\n  "$set": {\n    \n  }\n}');
  const [updateUnrestrictedConfirmed, setUpdateUnrestrictedConfirmed] = useState(false);
  const [updateUpsert, setUpdateUpsert] = useState(false);

  // Delete Tab States
  const [deleteFilterText, setDeleteFilterText] = useState("{}");
  const [deleteUnrestrictedConfirmed, setDeleteUnrestrictedConfirmed] = useState(false);
  const [deleteVerificationInput, setDeleteVerificationInput] = useState("");

  // Insert Tab States
  const [insertDocsText, setInsertDocsText] = useState("[\n  {\n    \n  }\n]");
  const [insertOrdered, setInsertOrdered] = useState(false);

  // Status & Feedback
  const [advisoryWarning, setAdvisoryWarning] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const { isSubmitting, executeBulkUpdate, executeBulkDelete, executeBulkInsert } =
    useMongoBulkMutations(dbId, service);

  // Available collections (filtered for system collections)
  const nonSystemCollections = useMemo(() => {
    if (!collections) return [];
    return collections.filter((c) => !c.startsWith("system."));
  }, [collections]);

  // Sync default collection
  useEffect(() => {
    if (defaultCollection && !defaultCollection.startsWith("system.")) {
      setCollection(defaultCollection);
    } else if (nonSystemCollections.length > 0 && !collection) {
      setCollection(nonSystemCollections[0]);
    }
  }, [defaultCollection, nonSystemCollections, collection]);

  // Reset confirmation gates when collection changes
  const handleCollectionChange = useCallback((newCol: string) => {
    setCollection(newCol);
    setUpdateUnrestrictedConfirmed(false);
    setDeleteUnrestrictedConfirmed(false);
    setDeleteVerificationInput("");
    setAdvisoryWarning(null);
    setExecutionError(null);
  }, []);

  // Reset confirmation gates when update filter text changes
  const handleUpdateFilterChange = useCallback((text: string) => {
    setUpdateFilterText(text);
    setUpdateUnrestrictedConfirmed(false);
    setAdvisoryWarning(null);
    setExecutionError(null);
  }, []);

  // Reset confirmation gates when delete filter text changes
  const handleDeleteFilterChange = useCallback((text: string) => {
    setDeleteFilterText(text);
    setDeleteUnrestrictedConfirmed(false);
    setDeleteVerificationInput("");
    setAdvisoryWarning(null);
    setExecutionError(null);
  }, []);

  // Validations
  const updateFilterValidation = useMemo(
    () => parseAndValidateFilter(updateFilterText),
    [updateFilterText],
  );
  const updateDocValidation = useMemo(() => parseAndValidateUpdate(updateDocText), [updateDocText]);

  const deleteFilterValidation = useMemo(
    () => parseAndValidateFilter(deleteFilterText),
    [deleteFilterText],
  );

  const insertParsed = useMemo(() => {
    try {
      const parsed = JSON.parse(insertDocsText);
      if (!Array.isArray(parsed)) {
        return {
          valid: false,
          error: "Documents must be a JSON array (e.g. [{ ... }])",
          count: 0,
          bytes: 0,
        };
      }
      const bytes = new TextEncoder().encode(insertDocsText).length;
      if (parsed.length === 0) {
        return { valid: false, error: "Documents array cannot be empty", count: 0, bytes };
      }
      if (parsed.length > 5000) {
        return {
          valid: false,
          error: `Exceeds 5,000 documents limit (${parsed.length} documents)`,
          count: parsed.length,
          bytes,
        };
      }
      if (bytes > 16 * 1024 * 1024) {
        return {
          valid: false,
          error: `Payload size exceeds 16 MB limit (${(bytes / (1024 * 1024)).toFixed(2)} MB)`,
          count: parsed.length,
          bytes,
        };
      }
      return { valid: true, documents: parsed, count: parsed.length, bytes };
    } catch (err: any) {
      return { valid: false, error: `Invalid JSON syntax: ${err.message}`, count: 0, bytes: 0 };
    }
  }, [insertDocsText]);

  // Submission Handlers
  const handleUpdateSubmit = async () => {
    if (
      !collection ||
      !updateFilterValidation.valid ||
      !updateDocValidation.valid ||
      isReadOnly ||
      isSubmitting
    ) {
      return;
    }
    if (updateFilterValidation.isUnrestricted && !updateUnrestrictedConfirmed) {
      return;
    }

    setExecutionError(null);
    setAdvisoryWarning(null);

    const res = await executeBulkUpdate({
      collection,
      filter: updateFilterValidation.filter!,
      update: updateDocValidation.update!,
      options: {
        multi: true,
        upsert: updateUpsert,
        allowUnrestricted: updateFilterValidation.isUnrestricted,
      },
    });

    if (res?.status === "completed") {
      if (res.result.advisoryWarning) {
        setAdvisoryWarning(res.result.advisoryWarning);
      } else {
        onOpenChange(false);
      }
    } else if (res?.status === "failed") {
      setExecutionError(res.error || "Update operation failed");
    }
  };

  const handleDeleteSubmit = async () => {
    if (!collection || !deleteFilterValidation.valid || isReadOnly || isSubmitting) {
      return;
    }
    if (deleteFilterValidation.isUnrestricted) {
      if (!deleteUnrestrictedConfirmed || deleteVerificationInput.trim() !== collection) {
        return;
      }
    }

    setExecutionError(null);
    setAdvisoryWarning(null);

    const res = await executeBulkDelete({
      collection,
      filter: deleteFilterValidation.filter!,
      options: {
        allowUnrestricted: deleteFilterValidation.isUnrestricted,
      },
    });

    if (res?.status === "completed") {
      if (res.result.advisoryWarning) {
        setAdvisoryWarning(res.result.advisoryWarning);
      } else {
        onOpenChange(false);
      }
    } else if (res?.status === "failed") {
      setExecutionError(res.error || "Delete operation failed");
    }
  };

  const handleInsertSubmit = async () => {
    if (!collection || !insertParsed.valid || isReadOnly || isSubmitting) {
      return;
    }

    setExecutionError(null);
    setAdvisoryWarning(null);

    try {
      const res = await executeBulkInsert({
        collection,
        documents: insertParsed.documents!,
        options: {
          ordered: insertOrdered,
        },
      });

      if (res?.status === "completed") {
        onOpenChange(false);
      } else if (res?.status === "partial_success") {
        setAdvisoryWarning(
          `Partial success: ${res.result.insertedCount} inserted, ${res.result.failedCount} failed`,
        );
      } else if (res?.status === "failed") {
        setExecutionError("Insert operation failed");
      }
    } catch (err: any) {
      setExecutionError(err?.message || "Insert operation failed");
    }
  };

  // Button disabled states
  const isUpdateDisabled =
    isReadOnly ||
    isSubmitting ||
    !collection ||
    !updateFilterValidation.valid ||
    !updateDocValidation.valid ||
    (Boolean(updateFilterValidation.isUnrestricted) && !updateUnrestrictedConfirmed);

  const isDeleteDisabled =
    isReadOnly ||
    isSubmitting ||
    !collection ||
    !deleteFilterValidation.valid ||
    (Boolean(deleteFilterValidation.isUnrestricted) &&
      (!deleteUnrestrictedConfirmed || deleteVerificationInput.trim() !== collection));

  const isInsertDisabled = isReadOnly || isSubmitting || !collection || !insertParsed.valid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl bg-popover/95 border-border shadow-2xl backdrop-blur-xl"
        data-testid="mutation-dialog"
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <FileEdit className="h-5 w-5 text-primary" />
              Bulk Mutation
            </DialogTitle>
            <Badge variant="outline" className="flex items-center gap-1 font-mono text-xs">
              <Database className="h-3 w-3 text-primary" />
              {databaseName}
            </Badge>
          </div>
          <DialogDescription>
            Execute bulk update, delete, or insert operations with safety guards and pre-flight
            validation.
          </DialogDescription>
        </DialogHeader>

        {/* Read-Only Banner */}
        {isReadOnly && (
          <div
            className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-500"
            data-testid="read-only-banner"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-semibold">
              Database connection is read-only. Mutation operations are disabled.
            </span>
          </div>
        )}

        {/* In-Flight Background Continuation Notice */}
        {isSubmitting && (
          <div
            className="flex items-start gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-xs text-blue-500"
            data-testid="in-flight-notice"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin mt-0.5" />
            <div>
              <div className="font-semibold">Operation in progress</div>
              <p className="mt-0.5 text-blue-500/90">
                You may close this dialog; execution will continue in the background and record the
                final outcome in the Bulk Operations History table.
              </p>
            </div>
          </div>
        )}

        {/* Advisory Warning */}
        {advisoryWarning && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-500">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>{advisoryWarning}</div>
          </div>
        )}

        {/* Execution Error */}
        {executionError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>{executionError}</div>
          </div>
        )}

        {/* Target Collection Selector */}
        <div className="space-y-1.5">
          <Label htmlFor="mutation-collection" className="text-xs font-medium">
            Target Collection
          </Label>
          {nonSystemCollections.length > 0 ? (
            <select
              id="mutation-collection"
              data-testid="mutation-collection-select"
              value={collection}
              onChange={(e) => handleCollectionChange(e.target.value)}
              disabled={isSubmitting}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden"
            >
              {nonSystemCollections.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="mutation-collection"
              data-testid="mutation-collection-select"
              value={collection}
              onChange={(e) => handleCollectionChange(e.target.value)}
              placeholder="e.g. users, products"
              disabled={isSubmitting}
              className="h-9"
            />
          )}
        </div>

        {/* Multi-Tab Mutation Workspace */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as any)}
          className="w-full"
        >
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="update" data-testid="mutation-tab-update">
              Update
            </TabsTrigger>
            <TabsTrigger value="delete" data-testid="mutation-tab-delete">
              Delete
            </TabsTrigger>
            <TabsTrigger value="insert" data-testid="mutation-tab-insert">
              Insert
            </TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------------------- */}
          {/* TAB 1: UPDATE */}
          {/* ------------------------------------------------------------- */}
          <TabsContent value="update" className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="update-filter" className="text-xs font-medium">
                  Filter Query (JSON)
                </Label>
                {updateFilterValidation.isUnrestricted && (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-amber-500 border-amber-500/40"
                  >
                    Unrestricted Filter
                  </Badge>
                )}
              </div>
              <Textarea
                id="update-filter"
                data-testid="mutation-filter-input"
                value={updateFilterText}
                onChange={(e) => handleUpdateFilterChange(e.target.value)}
                placeholder='e.g. {"status": "archived"}'
                className="font-mono text-xs min-h-[70px]"
                disabled={isSubmitting}
              />
              {!updateFilterValidation.valid && (
                <p className="text-[11px] text-destructive">{updateFilterValidation.error}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="update-doc" className="text-xs font-medium">
                Update Operators Document (JSON)
              </Label>
              <Textarea
                id="update-doc"
                data-testid="mutation-update-input"
                value={updateDocText}
                onChange={(e) => setUpdateDocText(e.target.value)}
                placeholder='e.g. {"$set": {"active": false}}'
                className="font-mono text-xs min-h-[90px]"
                disabled={isSubmitting}
              />
              {!updateDocValidation.valid && (
                <p className="text-[11px] text-destructive">{updateDocValidation.error}</p>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="update-upsert"
                checked={updateUpsert}
                onCheckedChange={(checked) => setUpdateUpsert(Boolean(checked))}
                disabled={isSubmitting}
              />
              <Label htmlFor="update-upsert" className="text-xs font-normal cursor-pointer">
                Upsert if no matching document found
              </Label>
            </div>

            {/* Unrestricted Amber Alert & Checkbox */}
            {updateFilterValidation.isUnrestricted && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-start gap-2 text-xs text-amber-500">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Unrestricted Bulk Update:</span> No filter
                    specified. This update will apply to every document in collection{" "}
                    <span className="font-mono font-bold text-foreground">'{collection}'</span>.
                  </div>
                </div>
                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="update-unrestricted-checkbox"
                    data-testid="mutation-unrestricted-checkbox"
                    checked={updateUnrestrictedConfirmed}
                    onCheckedChange={(checked) => setUpdateUnrestrictedConfirmed(Boolean(checked))}
                    disabled={isSubmitting}
                  />
                  <Label
                    htmlFor="update-unrestricted-checkbox"
                    className="text-xs font-medium text-amber-500 cursor-pointer"
                  >
                    I understand this will update all documents in collection '{collection}'
                  </Label>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ------------------------------------------------------------- */}
          {/* TAB 2: DELETE */}
          {/* ------------------------------------------------------------- */}
          <TabsContent value="delete" className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="delete-filter" className="text-xs font-medium">
                  Filter Query (JSON)
                </Label>
                {deleteFilterValidation.isUnrestricted && (
                  <Badge variant="destructive" className="text-[10px]">
                    Whole-Collection Delete
                  </Badge>
                )}
              </div>
              <Textarea
                id="delete-filter"
                data-testid="mutation-filter-input"
                value={deleteFilterText}
                onChange={(e) => handleDeleteFilterChange(e.target.value)}
                placeholder='e.g. {"status": "inactive"}'
                className="font-mono text-xs min-h-[90px]"
                disabled={isSubmitting}
              />
              {!deleteFilterValidation.valid && (
                <p className="text-[11px] text-destructive">{deleteFilterValidation.error}</p>
              )}
            </div>

            {/* Unrestricted Destructive Double-Gate Alert */}
            {deleteFilterValidation.isUnrestricted && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-3">
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">CRITICAL:</span> Empty filter will permanently{" "}
                    <span className="font-bold uppercase underline">delete all documents</span> in
                    collection{" "}
                    <span className="font-mono font-bold text-foreground">'{collection}'</span>!
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="delete-verify" className="text-xs text-muted-foreground">
                    To proceed, type the exact collection name{" "}
                    <span className="font-mono font-semibold text-foreground">'{collection}'</span>{" "}
                    to confirm:
                  </Label>
                  <Input
                    id="delete-verify"
                    data-testid="mutation-collection-verify-input"
                    value={deleteVerificationInput}
                    onChange={(e) => setDeleteVerificationInput(e.target.value)}
                    placeholder={collection}
                    disabled={isSubmitting}
                    className="h-8 font-mono text-xs border-destructive/40 focus-visible:ring-destructive"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="delete-unrestricted-checkbox"
                    data-testid="mutation-unrestricted-checkbox"
                    checked={deleteUnrestrictedConfirmed}
                    onCheckedChange={(checked) => setDeleteUnrestrictedConfirmed(Boolean(checked))}
                    disabled={isSubmitting}
                  />
                  <Label
                    htmlFor="delete-unrestricted-checkbox"
                    className="text-xs font-medium text-destructive cursor-pointer"
                  >
                    I confirm I want to permanently delete all records in collection '{collection}'
                  </Label>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ------------------------------------------------------------- */}
          {/* TAB 3: INSERT */}
          {/* ------------------------------------------------------------- */}
          <TabsContent value="insert" className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="insert-docs" className="text-xs font-medium">
                  Documents Array (JSON)
                </Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {insertParsed.count.toLocaleString()} docs
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {(insertParsed.bytes / 1024).toFixed(1)} KB
                  </Badge>
                </div>
              </div>
              <Textarea
                id="insert-docs"
                data-testid="mutation-insert-input"
                value={insertDocsText}
                onChange={(e) => setInsertDocsText(e.target.value)}
                placeholder='[{"name": "Alice"}, {"name": "Bob"}]'
                className="font-mono text-xs min-h-[140px]"
                disabled={isSubmitting}
              />
              {!insertParsed.valid && (
                <p className="text-[11px] text-destructive">{insertParsed.error}</p>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="insert-ordered"
                checked={insertOrdered}
                onCheckedChange={(checked) => setInsertOrdered(Boolean(checked))}
                disabled={isSubmitting}
              />
              <Label htmlFor="insert-ordered" className="text-xs font-normal cursor-pointer">
                Ordered insertion (stop on first failure)
              </Label>
            </div>
          </TabsContent>
        </Tabs>

        {/* Dialog Footer Actions */}
        <DialogFooter className="flex flex-row items-center justify-between sm:justify-between w-full pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            {isSubmitting ? "Close to Background" : "Cancel"}
          </Button>

          {activeTab === "update" && (
            <Button
              type="button"
              onClick={handleUpdateSubmit}
              disabled={isUpdateDisabled}
              className="text-xs gap-1.5"
              data-testid="mutation-submit-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <FileEdit className="h-3.5 w-3.5" />
                  Execute Update
                </>
              )}
            </Button>
          )}

          {activeTab === "delete" && (
            <Button
              type="button"
              variant={deleteFilterValidation.isUnrestricted ? "destructive" : "default"}
              onClick={handleDeleteSubmit}
              disabled={isDeleteDisabled}
              className="text-xs gap-1.5"
              data-testid="mutation-submit-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteFilterValidation.isUnrestricted
                    ? "Delete All Documents"
                    : "Delete Documents"}
                </>
              )}
            </Button>
          )}

          {activeTab === "insert" && (
            <Button
              type="button"
              onClick={handleInsertSubmit}
              disabled={isInsertDisabled}
              className="text-xs gap-1.5"
              data-testid="mutation-submit-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Inserting...
                </>
              ) : (
                <>
                  <PlusCircle className="h-3.5 w-3.5" />
                  Insert Documents
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
