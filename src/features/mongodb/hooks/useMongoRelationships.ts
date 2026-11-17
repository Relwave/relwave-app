import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { databaseService } from "@/services/bridge/database";
import type {
  MongoListRelationshipsResult,
  MongoInferRelationshipsRequest,
  MongoInferRelationshipsResult,
  MongoSetRelationshipStatusResult,
  MongoSaveRelationshipResult,
  MongoDeleteRelationshipResult,
  MongoRelationship,
} from "@/features/mongodb/types/relationship";

/**
 * Fetch all persisted MongoDB relationships for a database and project.
 *
 * Cache Strategy:
 * - Query key: ["mongoRelationships", dbId, projectId]
 * - Cached with 15s staleTime.
 * - Both `MongoRelationshipsPanel` and `MongoCollectionRelationshipsTab` normalize
 *   `projectId` using `projectId ?? undefined` to share this identical query cache entry.
 */
export function useMongoRelationships(dbId?: string, projectId?: string) {
  return useQuery<MongoListRelationshipsResult>({
    queryKey: ["mongoRelationships", dbId, projectId] as const,
    queryFn: async () => {
      if (!dbId) throw new Error("Database ID is required");
      return databaseService.listMongoRelationships({ dbId, projectId });
    },
    enabled: Boolean(dbId),
    staleTime: 15 * 1000,
  });
}

/**
 * Trigger heuristic relationship inference across collections.
 *
 * Cache Strategy:
 * - On success, invalidates ["mongoRelationships", dbId, projectId], refetching the
 *   authoritative file state from the Node.js bridge store.
 */
export function useInferMongoRelationships(dbId?: string, projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MongoInferRelationshipsResult,
    Error,
    Omit<MongoInferRelationshipsRequest, "dbId" | "projectId"> | undefined
  >({
    mutationFn: async (options) => {
      if (!dbId) throw new Error("Database ID is required");
      return databaseService.inferMongoRelationships({
        dbId,
        projectId,
        ...options,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mongoRelationships", dbId, projectId] });
      if (data.timedOut) {
        toast.warning("Discovery timed out", {
          description: `Scanned ${data.collectionsScanned} collection(s) before timeout. Partial results returned; existing saved state was preserved.`,
        });
      } else {
        const actionableCount = data.relationships.length;
        const diagnosticCount = data.insufficientEvidence.length;
        toast.success("Relationship inference completed", {
          description: `Discovered ${actionableCount} candidate relationship${actionableCount === 1 ? "" : "s"} (${diagnosticCount} low-confidence candidate${diagnosticCount === 1 ? "" : "s"}).`,
        });
      }
    },
    onError: (error: any) => {
      toast.error("Relationship inference failed", {
        description: error.message || String(error),
      });
    },
  });
}

/**
 * Confirm or reject an inferred relationship candidate.
 *
 * Cache Strategy:
 * - Mutates status on the bridge and invalidates query cache upon success to ensure
 *   consistent state on disk and in memory without optimistic drift.
 */
export function useSetMongoRelationshipStatus(dbId?: string, projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MongoSetRelationshipStatusResult,
    Error,
    { relationshipId: string; status: "confirmed" | "rejected" }
  >({
    mutationFn: async ({ relationshipId, status }) => {
      if (!dbId) throw new Error("Database ID is required");
      return databaseService.setMongoRelationshipStatus({
        dbId,
        projectId,
        relationshipId,
        status,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mongoRelationships", dbId, projectId] });
      if (data.status === "confirmed") {
        toast.success("Relationship confirmed");
      } else {
        toast.info("Relationship rejected");
      }
    },
    onError: (error: any) => {
      toast.error("Failed to update relationship status", {
        description: error.message || String(error),
      });
    },
  });
}

/**
 * Create or update a manual relationship definition.
 *
 * Cache Strategy:
 * - Saves definition to projectStore on the bridge and invalidates query cache upon success.
 */
export function useSaveMongoRelationship(dbId?: string, projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation<MongoSaveRelationshipResult, Error, MongoRelationship>({
    mutationFn: async (relationship) => {
      if (!dbId) throw new Error("Database ID is required");
      return databaseService.saveMongoRelationship({
        dbId,
        projectId,
        relationship,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongoRelationships", dbId, projectId] });
      toast.success("Relationship saved successfully");
    },
    onError: (error: any) => {
      toast.error("Failed to save relationship", {
        description: error.message || String(error),
      });
    },
  });
}

/**
 * Delete a manual relationship definition.
 *
 * Cache Strategy:
 * - Removes definition from projectStore on the bridge and invalidates query cache upon success.
 */
export function useDeleteMongoRelationship(dbId?: string, projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation<MongoDeleteRelationshipResult, Error, string>({
    mutationFn: async (relationshipId) => {
      if (!dbId) throw new Error("Database ID is required");
      return databaseService.deleteMongoRelationship({
        dbId,
        projectId,
        relationshipId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongoRelationships", dbId, projectId] });
      toast.success("Relationship deleted successfully");
    },
    onError: (error: any) => {
      toast.error("Failed to delete relationship", {
        description: error.message || String(error),
      });
    },
  });
}
