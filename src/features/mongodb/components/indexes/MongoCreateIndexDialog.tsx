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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  MongoIndexDirection,
  MongoIndexOptions,
  MongoIndexCollation,
} from "@/services/bridge/databaseBridge";
import {
  generateIndexName,
  validateIndexSpec,
  IndexKeyField,
} from "../../utils/indexHelpers";
import { useMongoSchema } from "@/features/project/hooks/useDbQueries";
import { useMongoIndexes } from "../../hooks/useMongoIndexes";

interface MongoCreateIndexDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  collection: string;
  onSuccess?: (indexName: string) => void;
}

export function MongoCreateIndexDialog({
  open,
  onOpenChange,
  dbId,
  collection,
  onSuccess,
}: MongoCreateIndexDialogProps) {
  const [fields, setFields] = useState<IndexKeyField[]>([
    { field: "", direction: 1 },
  ]);
  const [customName, setCustomName] = useState<string>("");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);

  // Options
  const [isUnique, setIsUnique] = useState(false);
  const [isSparse, setIsSparse] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  // TTL
  const [isTtl, setIsTtl] = useState(false);
  const [expireAfterSeconds, setExpireAfterSeconds] = useState("3600");

  // Partial Filter Expression
  const [isPartialOpen, setIsPartialOpen] = useState(false);
  const [partialFilterText, setPartialFilterText] = useState("");
  const [partialJsonError, setPartialJsonError] = useState<string | null>(null);

  // Collation
  const [isCollationOpen, setIsCollationOpen] = useState(false);
  const [collationLocale, setCollationLocale] = useState("");
  const [collationStrength, setCollationStrength] = useState<number | undefined>(undefined);
  const [collationCaseLevel, setCollationCaseLevel] = useState(false);
  const [collationNumericOrdering, setCollationNumericOrdering] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);

  // Hook for mutations
  const { createIndex, isCreating } = useMongoIndexes(dbId, collection);

  // Schema inference for field autocomplete suggestions
  const { data: schema } = useMongoSchema(dbId, collection, 100, 3, open);

  const schemaFieldSuggestions = useMemo(() => {
    return schema?.fields.map((f) => f.path) || [];
  }, [schema]);

  // Derived properties from key spec
  const hasHashed = useMemo(() => fields.some((f) => f.direction === "hashed"), [fields]);
  const hasGeo = useMemo(() => fields.some((f) => f.direction === "2dsphere"), [fields]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFields([{ field: "", direction: 1 }]);
      setCustomName("");
      setNameManuallyEdited(false);
      setIsUnique(false);
      setIsSparse(false);
      setIsHidden(false);
      setIsTtl(false);
      setExpireAfterSeconds("3600");
      setIsPartialOpen(false);
      setPartialFilterText("");
      setPartialJsonError(null);
      setIsCollationOpen(false);
      setCollationLocale("");
      setCollationStrength(undefined);
      setCollationCaseLevel(false);
      setCollationNumericOrdering(false);
      setFormError(null);
    }
  }, [open]);

  // Enforce option constraints when hashed or geo is selected
  useEffect(() => {
    if (hasHashed) {
      setIsUnique(false);
      setIsSparse(false);
    }
    if (hasGeo) {
      setIsUnique(false);
    }
  }, [hasHashed, hasGeo]);

  // Auto-update index name unless manually edited
  useEffect(() => {
    if (!nameManuallyEdited) {
      const generated = generateIndexName(fields);
      setCustomName(generated);
    }
  }, [fields, nameManuallyEdited]);

  // Validate partial filter expression JSON on change
  const handlePartialFilterChange = (val: string) => {
    setPartialFilterText(val);
    if (!val.trim()) {
      setPartialJsonError(null);
      return;
    }
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        setPartialJsonError("Must be a JSON object (e.g. {\"status\": \"active\"})");
      } else {
        setPartialJsonError(null);
      }
    } catch (err: any) {
      setPartialJsonError(err.message || "Invalid JSON syntax");
    }
  };

  const handleAddField = () => {
    setFields((prev) => [...prev, { field: "", direction: 1 }]);
  };

  const handleRemoveField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, newField: string) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], field: newField };
      return next;
    });
    setFormError(null);
  };

  const handleDirectionChange = (index: number, newDirection: MongoIndexDirection) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], direction: newDirection };
      return next;
    });
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Parse options
    const options: MongoIndexOptions = {};

    if (customName.trim()) {
      options.name = customName.trim();
    }

    if (isUnique) options.unique = true;
    if (isSparse) options.sparse = true;
    if (isHidden) options.hidden = true;

    if (isTtl) {
      const ttlSec = parseInt(expireAfterSeconds, 10);
      if (isNaN(ttlSec) || ttlSec < 0) {
        setFormError("TTL expireAfterSeconds must be a non-negative integer");
        return;
      }
      options.expireAfterSeconds = ttlSec;
    }

    if (partialFilterText.trim()) {
      if (partialJsonError) {
        setFormError("Please fix the partial filter expression JSON error");
        return;
      }
      try {
        options.partialFilterExpression = JSON.parse(partialFilterText);
      } catch {
        setFormError("Invalid partial filter expression JSON");
        return;
      }
    }

    if (collationLocale.trim()) {
      const collation: MongoIndexCollation = {
        locale: collationLocale.trim(),
      };
      if (collationStrength !== undefined) collation.strength = collationStrength as 1 | 2 | 3 | 4 | 5;
      if (collationCaseLevel) collation.caseLevel = true;
      if (collationNumericOrdering) collation.numericOrdering = true;
      options.collation = collation;
    }

    // Validate specification
    const check = validateIndexSpec(fields, options);
    if (!check.valid) {
      setFormError(check.error || "Invalid index specification");
      return;
    }

    // Assemble key object
    const key: Record<string, MongoIndexDirection> = {};
    for (const f of fields) {
      key[f.field.trim()] = f.direction;
    }

    try {
      const result = await createIndex(key, options);
      onSuccess?.(result.indexName);
      onOpenChange(false);
    } catch (err: any) {
      setFormError(err.message || "Failed to create index");
    }
  };

  const datalistId = `mongo-fields-${collection.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-emerald-500" />
            Create Secondary Index
          </DialogTitle>
          <DialogDescription className="text-xs">
            Add a B-Tree, Text, Geospatial, or Hashed index to collection{" "}
            <span className="font-mono font-medium text-foreground">{collection}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Datalist for field suggestions */}
          <datalist id={datalistId}>
            {schemaFieldSuggestions.map((path) => (
              <option key={path} value={path} />
            ))}
          </datalist>

          {/* Key Fields Specification */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Key Fields & Direction</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px] gap-1"
                onClick={handleAddField}
              >
                <Plus className="h-3 w-3" />
                Add Field
              </Button>
            </div>

            <div className="space-y-2 border border-border/50 rounded-lg p-3 bg-muted/20">
              {fields.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      list={datalistId}
                      placeholder="e.g. user_id or status"
                      value={f.field}
                      onChange={(e) => handleFieldChange(idx, e.target.value)}
                      className="h-8 font-mono text-xs"
                      required
                    />
                  </div>

                  <div className="w-[150px]">
                    <Select
                      value={String(f.direction)}
                      onValueChange={(val) => {
                        const parsedDir: MongoIndexDirection =
                          val === "1"
                            ? 1
                            : val === "-1"
                            ? -1
                            : (val as "text" | "2dsphere" | "hashed");
                        handleDirectionChange(idx, parsedDir);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Ascending (1)</SelectItem>
                        <SelectItem value="-1">Descending (-1)</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="2dsphere">2dsphere (Geo)</SelectItem>
                        <SelectItem value="hashed">Hashed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    disabled={fields.length <= 1}
                    onClick={() => handleRemoveField(idx)}
                    title="Remove field"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              {schemaFieldSuggestions.length > 0 && (
                <div className="pt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1 font-medium">
                    <Sparkles className="h-3 w-3 text-amber-500" /> Suggestions:
                  </span>
                  {schemaFieldSuggestions.slice(0, 6).map((sf) => (
                    <button
                      key={sf}
                      type="button"
                      className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground text-[10px] font-mono border border-border/40"
                      onClick={() => {
                        const emptyIdx = fields.findIndex((f) => !f.field.trim());
                        if (emptyIdx !== -1) {
                          handleFieldChange(emptyIdx, sf);
                        } else {
                          setFields((prev) => [...prev, { field: sf, direction: 1 }]);
                        }
                      }}
                    >
                      +{sf}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Index Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="index-name" className="text-xs font-semibold">
                Index Name
              </Label>
              {nameManuallyEdited && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => {
                    setNameManuallyEdited(false);
                    setCustomName(generateIndexName(fields));
                  }}
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  Reset to auto-generated
                </button>
              )}
            </div>
            <Input
              id="index-name"
              placeholder={generateIndexName(fields) || "index_name"}
              value={customName}
              onChange={(e) => {
                setCustomName(e.target.value);
                setNameManuallyEdited(true);
              }}
              className="h-8 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Canonical default: <code>{generateIndexName(fields) || "field_1"}</code>
            </p>
          </div>

          {/* Standard Options (Unique, Sparse, Hidden) */}
          <div className="border border-border/40 rounded-lg p-3 space-y-3 bg-muted/10">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="opt-unique" className="text-xs font-semibold">
                  Unique Constraint
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Reject documents that duplicate index key values
                </p>
              </div>
              <Switch
                id="opt-unique"
                checked={isUnique}
                disabled={hasHashed || hasGeo}
                onCheckedChange={setIsUnique}
              />
            </div>

            <div className="flex items-center justify-between border-t border-border/30 pt-2.5">
              <div>
                <Label htmlFor="opt-sparse" className="text-xs font-semibold">
                  Sparse Index
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Only index documents that contain the indexed field
                </p>
              </div>
              <Switch
                id="opt-sparse"
                checked={isSparse}
                disabled={hasHashed}
                onCheckedChange={setIsSparse}
              />
            </div>

            <div className="flex items-center justify-between border-t border-border/30 pt-2.5">
              <div>
                <Label htmlFor="opt-hidden" className="text-xs font-semibold">
                  Hidden Index
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Hide from query planner while maintaining writes (MongoDB 4.4+)
                </p>
              </div>
              <Switch id="opt-hidden" checked={isHidden} onCheckedChange={setIsHidden} />
            </div>

            {/* TTL Section */}
            <div className="border-t border-border/30 pt-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="opt-ttl" className="text-xs font-semibold">
                    Time-To-Live (TTL)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Automatically expire documents after specified seconds (single Date field)
                  </p>
                </div>
                <Switch id="opt-ttl" checked={isTtl} onCheckedChange={setIsTtl} />
              </div>

              {isTtl && (
                <div className="pl-4 pt-1 flex items-center gap-2">
                  <Label htmlFor="ttl-seconds" className="text-xs shrink-0">
                    Expire After (seconds):
                  </Label>
                  <Input
                    id="ttl-seconds"
                    type="number"
                    min="0"
                    step="1"
                    value={expireAfterSeconds}
                    onChange={(e) => setExpireAfterSeconds(e.target.value)}
                    className="h-7 w-32 font-mono text-xs"
                    required={isTtl}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Collapsible: Partial Filter Expression */}
          <Collapsible
            open={isPartialOpen}
            onOpenChange={setIsPartialOpen}
            className="border border-border/40 rounded-lg p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold">Partial Filter Expression</span>
                <p className="text-[11px] text-muted-foreground">
                  Only index documents meeting a specific MQL filter condition
                </p>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  {isPartialOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="pt-2 space-y-2">
              <Textarea
                placeholder='{ "status": "active", "rating": { "$gte": 4 } }'
                value={partialFilterText}
                onChange={(e) => handlePartialFilterChange(e.target.value)}
                className="font-mono text-xs h-20"
              />
              {partialJsonError && (
                <div className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{partialJsonError}</span>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Collapsible: Collation */}
          <Collapsible
            open={isCollationOpen}
            onOpenChange={setIsCollationOpen}
            className="border border-border/40 rounded-lg p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold">Collation Settings</span>
                <p className="text-[11px] text-muted-foreground">
                  Language-specific string comparison and case insensitivity
                </p>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  {isCollationOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="pt-2 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="collation-locale" className="text-[11px]">
                    Locale (e.g. "en", "es", "fr")
                  </Label>
                  <Input
                    id="collation-locale"
                    placeholder="en"
                    value={collationLocale}
                    onChange={(e) => setCollationLocale(e.target.value)}
                    className="h-7 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Strength</Label>
                  <Select
                    value={collationStrength !== undefined ? String(collationStrength) : "default"}
                    onValueChange={(val) =>
                      setCollationStrength(val === "default" ? undefined : parseInt(val, 10))
                    }
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="1">1 (Primary: Base characters)</SelectItem>
                      <SelectItem value="2">2 (Secondary: Diacritics)</SelectItem>
                      <SelectItem value="3">3 (Tertiary: Case & variants)</SelectItem>
                      <SelectItem value="4">4 (Quaternary: Punctuation)</SelectItem>
                      <SelectItem value="5">5 (Identical)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border/30 pt-2">
                <span className="text-[11px]">Case Level</span>
                <Switch
                  checked={collationCaseLevel}
                  onCheckedChange={setCollationCaseLevel}
                />
              </div>

              <div className="flex items-center justify-between border-t border-border/30 pt-2">
                <span className="text-[11px]">Numeric Ordering (e.g. 2 before 10)</span>
                <Switch
                  checked={collationNumericOrdering}
                  onCheckedChange={setCollationNumericOrdering}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Form Error Banner */}
          {formError && (
            <div className="p-2.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Create Index
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
