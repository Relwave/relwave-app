import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Network,
  Sparkles,
  Plus,
  RefreshCw,
  Search,
  Check,
  X,
  Eye,
  Edit2,
  Trash2,
  LayoutGrid,
  List,
  AlertTriangle,
} from "lucide-react";
import {
  useMongoRelationships,
  useInferMongoRelationships,
  useSetMongoRelationshipStatus,
  useSaveMongoRelationship,
  useDeleteMongoRelationship,
} from "../../hooks/useMongoRelationships";
import { useMongoCollections } from "@/features/project/hooks/useDbQueries";
import { formatMongoCardinality } from "../../adapters/mongoErAdapter";
import { MongoRelationshipDetailDrawer } from "./MongoRelationshipDetailDrawer";
import { MongoManualRelationshipDialog } from "./MongoManualRelationshipDialog";
import { MongoInferDialog } from "./MongoInferDialog";
import { MongoERDiagramView } from "./MongoERDiagramView";
import type {
  MongoCardinality,
  MongoInferredRelationship,
  MongoRelationship,
} from "../../types/relationship";

export interface MongoRelationshipsPanelProps {
  dbId: string;
  projectId?: string | null;
  databaseName?: string;
  initialView?: "list" | "diagram";
}

export function MongoRelationshipsPanel({
  dbId,
  projectId,
  initialView = "list",
}: MongoRelationshipsPanelProps) {
  const resolvedProjectId = projectId ?? undefined;
  const [viewMode, setViewMode] = useState<"list" | "diagram">(initialView);
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cardinalityFilter, setCardinalityFilter] = useState("all");

  const [detailTarget, setDetailTarget] = useState<
    (MongoInferredRelationship | MongoRelationship) | null
  >(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [editingManualRel, setEditingManualRel] = useState<MongoRelationship | null>(null);
  const [inferDialogOpen, setInferDialogOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useMongoRelationships(
    dbId,
    resolvedProjectId,
  );
  const { data: collsData } = useMongoCollections(dbId);
  const collectionNames = useMemo(
    () => collsData?.collections?.map((c) => c.name) || [],
    [collsData],
  );

  const inferMutation = useInferMongoRelationships(dbId, resolvedProjectId);
  const setStatusMutation = useSetMongoRelationshipStatus(dbId, resolvedProjectId);
  const saveMutation = useSaveMongoRelationship(dbId, resolvedProjectId);
  const deleteMutation = useDeleteMongoRelationship(dbId, resolvedProjectId);

  const inferred = useMemo(() => data?.inferred || [], [data?.inferred]);
  const confirmed = useMemo(() => data?.confirmed || [], [data?.confirmed]);
  const manual = useMemo(() => data?.manual || [], [data?.manual]);
  const rejectedIds = useMemo(() => new Set(data?.rejectedIds || []), [data?.rejectedIds]);
  const insufficient = useMemo(
    () => data?.insufficientEvidence || [],
    [data?.insufficientEvidence],
  );

  const awaitingReviewCount = useMemo(
    () => inferred.filter((r) => r.status === "inferred").length,
    [inferred],
  );

  // Unified items for list rendering
  const allRows = useMemo(() => {
    const rows: Array<{
      id: string;
      source: string;
      target: string;
      cardinality: MongoCardinality;
      confidence: number;
      kind: "inferred" | "confirmed" | "manual" | "rejected" | "insufficient";
      status: string;
      item: MongoInferredRelationship | MongoRelationship;
    }> = [];

    // Confirmed
    confirmed.forEach((r) => {
      rows.push({
        id: r.id,
        source: `${r.sourceCollection}.${r.sourceField}`,
        target: `${r.targetCollection}.${r.targetField}`,
        cardinality: r.cardinality,
        confidence: 1.0,
        kind: "confirmed",
        status: "confirmed",
        item: r,
      });
    });

    // Manual
    manual.forEach((r) => {
      rows.push({
        id: r.id,
        source: `${r.sourceCollection}.${r.sourceField}`,
        target: `${r.targetCollection}.${r.targetField}`,
        cardinality: r.cardinality,
        confidence: 1.0,
        kind: "manual",
        status: "manual",
        item: r,
      });
    });

    // Inferred
    inferred.forEach((r) => {
      const isRejected = rejectedIds.has(r.id) || r.status === "rejected";
      rows.push({
        id: r.id,
        source: `${r.sourceCollection}.${r.sourceField}`,
        target: `${r.targetCollection}.${r.targetField}`,
        cardinality: r.cardinality,
        confidence: r.confidence,
        kind: isRejected ? "rejected" : "inferred",
        status: isRejected ? "rejected" : r.status,
        item: r,
      });
    });

    // Insufficient evidence
    insufficient.forEach((r) => {
      rows.push({
        id: r.id,
        source: `${r.sourceCollection}.${r.sourceField}`,
        target: `${r.targetCollection}.${r.targetField}`,
        cardinality: r.cardinality,
        confidence: r.confidence,
        kind: "insufficient",
        status: "low-confidence",
        item: r,
      });
    });

    return rows;
  }, [confirmed, manual, inferred, rejectedIds, insufficient]);

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!row.source.toLowerCase().includes(q) && !row.target.toLowerCase().includes(q)) {
          return false;
        }
      }

      if (collectionFilter !== "all") {
        if (
          !row.source.startsWith(`${collectionFilter}.`) &&
          !row.target.startsWith(`${collectionFilter}.`)
        ) {
          return false;
        }
      }

      if (statusFilter !== "all") {
        if (statusFilter === "inferred" && row.kind !== "inferred") return false;
        if (statusFilter === "confirmed" && row.kind !== "confirmed") return false;
        if (statusFilter === "manual" && row.kind !== "manual") return false;
        if (statusFilter === "rejected" && row.kind !== "rejected") return false;
        if (statusFilter === "insufficient" && row.kind !== "insufficient") return false;
      }

      if (cardinalityFilter !== "all") {
        if (row.cardinality !== cardinalityFilter) return false;
      }

      return true;
    });
  }, [allRows, searchQuery, collectionFilter, statusFilter, cardinalityFilter]);

  const getConfidenceBadge = (confidence: number) => {
    const pct = Math.round(confidence * 100);
    let colorClass = "text-muted-foreground";
    if (pct >= 85) colorClass = "text-emerald-500 font-bold";
    else if (pct >= 65) colorClass = "text-amber-500 font-bold";

    return (
      <div className="flex items-center gap-2 max-w-[120px]">
        <Progress value={pct} className="h-1.5 w-14" />
        <span className={`text-[11px] font-mono ${colorClass}`}>{pct}%</span>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            MongoDB Relationships
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Discover, review, and model collection references and ER diagrams.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="border rounded-md flex p-0.5 bg-muted/40">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="h-7 px-2.5 text-xs gap-1"
            >
              <List className="h-3.5 w-3.5" />
              List
            </Button>
            <Button
              variant={viewMode === "diagram" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("diagram")}
              className="h-7 px-2.5 text-xs gap-1"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Diagram
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingManualRel(null);
              setManualDialogOpen(true);
            }}
            className="h-8 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Manual
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => setInferDialogOpen(true)}
            className="h-8 gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Discover
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-3 p-4 border-b border-border bg-muted/20 shrink-0">
        <div className="p-3 bg-card border rounded-lg">
          <span className="text-[11px] text-muted-foreground block">Total Defined</span>
          <span className="text-xl font-bold font-mono">{allRows.length}</span>
        </div>
        <div className="p-3 bg-card border rounded-lg">
          <span className="text-[11px] text-muted-foreground block">Confirmed</span>
          <span className="text-xl font-bold font-mono text-emerald-500">{confirmed.length}</span>
        </div>
        <div className="p-3 bg-card border rounded-lg">
          <span className="text-[11px] text-muted-foreground block">Awaiting Review</span>
          <span className="text-xl font-bold font-mono text-cyan-500">{awaitingReviewCount}</span>
        </div>
        <div className="p-3 bg-card border rounded-lg">
          <span className="text-[11px] text-muted-foreground block">Manual</span>
          <span className="text-xl font-bold font-mono text-purple-500">{manual.length}</span>
        </div>
        <div className="p-3 bg-card border rounded-lg">
          <span className="text-[11px] text-muted-foreground block">Rejected</span>
          <span className="text-xl font-bold font-mono text-destructive">{rejectedIds.size}</span>
        </div>
        <div className="p-3 bg-card border rounded-lg">
          <span className="text-[11px] text-muted-foreground block">Low Confidence</span>
          <span className="text-xl font-bold font-mono text-amber-500">{insufficient.length}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="p-3 border-b border-border flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by collection or field..."
              className="h-8 pl-8 text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={collectionFilter} onValueChange={setCollectionFilter}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="All Collections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Collections</SelectItem>
              {collectionNames.map((c) => (
                <SelectItem key={c} value={c} className="font-mono text-xs">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="inferred">Inferred</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="insufficient">Low Confidence</SelectItem>
            </SelectContent>
          </Select>

          <Select value={cardinalityFilter} onValueChange={setCardinalityFilter}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="All Cardinalities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cardinalities</SelectItem>
              <SelectItem value="one-to-one">1:1 (One-to-One)</SelectItem>
              <SelectItem value="one-to-many">1:N (One-to-Many)</SelectItem>
              <SelectItem value="many-to-one">N:1 (Many-to-One)</SelectItem>
              <SelectItem value="many-to-many">N:M (Many-to-Many)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content View */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">
            Loading relationships...
          </div>
        ) : isError ? (
          <div className="p-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive font-semibold">Failed to load relationships</p>
            <p className="text-xs text-muted-foreground">{error?.message || "Unknown error"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : viewMode === "diagram" ? (
          <MongoERDiagramView
            projectId={projectId}
            collections={collectionNames}
            inferred={inferred}
            confirmed={confirmed}
            manual={manual}
            onSelectRelationship={(rel) => setDetailTarget(rel)}
          />
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-8 space-y-3">
            <Network className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-semibold">No relationships found</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Discover candidate references by running inference or add manual relationship
              metadata.
            </p>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setManualDialogOpen(true)}>
                Add Manual
              </Button>
              <Button size="sm" onClick={() => setInferDialogOpen(true)}>
                Run Discovery
              </Button>
            </div>
          </div>
        ) : (
          <Table className="text-xs font-mono">
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Cardinality</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Origin / Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-semibold text-foreground">{row.source}</TableCell>
                  <TableCell>{row.target}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {formatMongoCardinality(row.cardinality)}
                    </Badge>
                  </TableCell>
                  <TableCell>{getConfidenceBadge(row.confidence)}</TableCell>
                  <TableCell>
                    {row.kind === "manual" ? (
                      <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20 text-[10px]">
                        Manual
                      </Badge>
                    ) : row.kind === "confirmed" ? (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                        Confirmed
                      </Badge>
                    ) : row.kind === "insufficient" ? (
                      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">
                        Low-Conf
                      </Badge>
                    ) : (
                      <Badge className="bg-cyan-500/10 text-cyan-500 border-cyan-500/20 text-[10px]">
                        Inferred
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="capitalize text-[11px] text-muted-foreground">
                    {row.status}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {row.kind === "inferred" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10"
                            onClick={() =>
                              setStatusMutation.mutate({
                                relationshipId: row.id,
                                status: "confirmed",
                              })
                            }
                            disabled={setStatusMutation.isPending}
                            title="Confirm"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              setStatusMutation.mutate({
                                relationshipId: row.id,
                                status: "rejected",
                              })
                            }
                            disabled={setStatusMutation.isPending}
                            title="Reject"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}

                      {row.kind === "manual" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingManualRel(row.item as MongoRelationship);
                              setManualDialogOpen(true);
                            }}
                            title="Edit"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => deleteMutation.mutate(row.id)}
                            disabled={deleteMutation.isPending}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDetailTarget(row.item)}
                        title="View Details"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Drawers & Dialogs */}
      <MongoRelationshipDetailDrawer
        open={Boolean(detailTarget)}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        relationship={detailTarget}
        onConfirm={(id) => setStatusMutation.mutate({ relationshipId: id, status: "confirmed" })}
        onReject={(id) => setStatusMutation.mutate({ relationshipId: id, status: "rejected" })}
        isConfirmPending={setStatusMutation.isPending}
        isRejectPending={setStatusMutation.isPending}
      />

      <MongoManualRelationshipDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        collections={collectionNames}
        initialRelationship={editingManualRel}
        onSave={(rel) => saveMutation.mutateAsync(rel)}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        isSaving={saveMutation.isPending}
        isDeleting={deleteMutation.isPending}
        dbId={dbId}
      />

      <MongoInferDialog
        open={inferDialogOpen}
        onOpenChange={setInferDialogOpen}
        collections={collectionNames}
        onInfer={(opts) => inferMutation.mutateAsync(opts)}
        isLoading={inferMutation.isPending}
      />
    </div>
  );
}
