import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Eye,
  ExternalLink,
  Plus,
  Network,
} from "lucide-react";
import {
  useMongoRelationships,
  useSetMongoRelationshipStatus,
  useSaveMongoRelationship,
  useDeleteMongoRelationship,
} from "../../hooks/useMongoRelationships";
import { formatMongoCardinality } from "../../adapters/mongoErAdapter";
import { MongoRelationshipDetailDrawer } from "./MongoRelationshipDetailDrawer";
import { MongoManualRelationshipDialog } from "./MongoManualRelationshipDialog";
import { useMongoCollections } from "@/features/project/hooks/useDbQueries";
import type {
  MongoInferredRelationship,
  MongoRelationship,
} from "../../types/relationship";

export interface MongoCollectionRelationshipsTabProps {
  dbId: string;
  projectId?: string;
  collection: string;
  onSelectCollection: (col: string) => void;
}

export function MongoCollectionRelationshipsTab({
  dbId,
  projectId,
  collection,
  onSelectCollection,
}: MongoCollectionRelationshipsTabProps) {
  const { data, isLoading } = useMongoRelationships(dbId, projectId);
  const { data: collsData } = useMongoCollections(dbId);
  const collectionNames = useMemo(
    () => collsData?.collections?.map((c) => c.name) || [],
    [collsData],
  );

  const setStatusMutation = useSetMongoRelationshipStatus(dbId, projectId);
  const saveMutation = useSaveMongoRelationship(dbId, projectId);
  const deleteMutation = useDeleteMongoRelationship(dbId, projectId);

  const [detailTarget, setDetailTarget] = useState<
    (MongoInferredRelationship | MongoRelationship) | null
  >(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);

  // Group into outgoing (sourceCollection === collection) and incoming (targetCollection === collection)
  const { outgoing, incoming } = useMemo(() => {
    const rejectedSet = new Set(data?.rejectedIds || []);
    const allRels: Array<MongoRelationship | MongoInferredRelationship> = [
      ...(data?.confirmed || []),
      ...(data?.manual || []),
      ...(data?.inferred || []),
    ];

    // Deduplicate by ID and exclude rejected relationships
    const seen = new Set<string>();
    const outList: typeof allRels = [];
    const inList: typeof allRels = [];

    for (const r of allRels) {
      if (rejectedSet.has(r.id)) continue;
      if ("status" in r && (r as any).status === "rejected") continue;
      if (seen.has(r.id)) continue;
      seen.add(r.id);

      if (r.sourceCollection === collection) {
        outList.push(r);
      }
      if (r.targetCollection === collection) {
        inList.push(r);
      }
    }

    return { outgoing: outList, incoming: inList };
  }, [data, collection]);

  const renderRow = (
    rel: MongoRelationship | MongoInferredRelationship,
    direction: "outgoing" | "incoming",
  ) => {
    const isInferred = "confidence" in rel && "evidence" in rel;
    const inferredRel = isInferred ? (rel as MongoInferredRelationship) : null;
    const isManual = Boolean((rel as MongoRelationship).isManual);

    const targetCol = direction === "outgoing" ? rel.targetCollection : rel.sourceCollection;
    const targetFld = direction === "outgoing" ? rel.targetField : rel.sourceField;
    const thisFld = direction === "outgoing" ? rel.sourceField : rel.targetField;

    return (
      <TableRow key={rel.id}>
        <TableCell className="font-mono font-semibold">{thisFld}</TableCell>
        <TableCell className="font-mono">
          <div className="flex items-center gap-1.5">
            {direction === "outgoing" ? (
              <ArrowRight className="h-3.5 w-3.5 text-cyan-500" />
            ) : (
              <ArrowLeft className="h-3.5 w-3.5 text-emerald-500" />
            )}
            <span>
              {targetCol}.{targetFld}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 ml-1 text-muted-foreground hover:text-foreground"
              onClick={() => onSelectCollection(targetCol)}
              title={`Jump to collection ${targetCol}`}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="font-mono text-[10px]">
            {formatMongoCardinality(rel.cardinality)}
          </Badge>
        </TableCell>
        <TableCell>
          {isManual ? (
            <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20 text-[10px]">
              Manual
            </Badge>
          ) : isInferred ? (
            <Badge className="bg-cyan-500/10 text-cyan-500 border-cyan-500/20 text-[10px]">
              Inferred ({Math.round((inferredRel?.confidence || 0) * 100)}%)
            </Badge>
          ) : (
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
              Confirmed
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {inferredRel && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-emerald-500 hover:bg-emerald-500/10"
                  onClick={() =>
                    setStatusMutation.mutate({
                      relationshipId: rel.id,
                      status: "confirmed",
                    })
                  }
                  disabled={setStatusMutation.isPending}
                  title="Confirm"
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    setStatusMutation.mutate({
                      relationshipId: rel.id,
                      status: "rejected",
                    })
                  }
                  disabled={setStatusMutation.isPending}
                  title="Reject"
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setDetailTarget(rel)}
              title="Details"
            >
              <Eye className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">
        Loading collection relationships...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            Relationships for &ldquo;{collection}&rdquo;
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Outgoing foreign references and incoming dependencies for this collection.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setManualDialogOpen(true)}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Add Relationship
        </Button>
      </div>

      {/* Outgoing References */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <ArrowRight className="h-3.5 w-3.5 text-cyan-500" />
          Outgoing References ({outgoing.length})
        </div>
        {outgoing.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 border rounded-md text-center bg-muted/10">
            No outgoing references found for {collection}.
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table className="text-xs font-mono">
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>References Target</TableHead>
                  <TableHead>Cardinality</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{outgoing.map((r) => renderRow(r, "outgoing"))}</TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Incoming References */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <ArrowLeft className="h-3.5 w-3.5 text-emerald-500" />
          Incoming References ({incoming.length})
        </div>
        {incoming.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 border rounded-md text-center bg-muted/10">
            No collections reference {collection}.
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table className="text-xs font-mono">
              <TableHeader>
                <TableRow>
                  <TableHead>Target Field</TableHead>
                  <TableHead>Referenced By</TableHead>
                  <TableHead>Cardinality</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{incoming.map((r) => renderRow(r, "incoming"))}</TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Drawer & Modal */}
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
        dbId={dbId}
        initialRelationship={{
          id: "",
          sourceCollection: collection,
          sourceField: "",
          targetCollection: collectionNames.find((c) => c !== collection) || collection,
          targetField: "_id",
          cardinality: "many-to-one",
          createdAt: "",
          updatedAt: "",
        }}
        onSave={(rel) => saveMutation.mutateAsync(rel)}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        isSaving={saveMutation.isPending}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}