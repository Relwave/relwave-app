import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { databaseService } from "@/services/bridge/database";
import {
  MongoIndexDirection,
  MongoIndexOptions,
  MongoIndexCreateResult,
  MongoIndexDropResult,
  MongoIndexHideResult,
  MongoIndexStatsResult,
} from "@/services/bridge/databaseBridge";
import { MongoIndexWithStats } from "../utils/indexHelpers";

export interface MongoIndexesResult {
  collection: string;
  indexes: MongoIndexWithStats[];
  totalSizeBytes: number;
}

export function useMongoIndexes(dbId: string, collection: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["mongoIndexes", dbId, collection] as const;

  const query = useQuery<MongoIndexesResult>({
    queryKey,
    queryFn: async () => {
      if (!collection) {
        return { collection: "", indexes: [], totalSizeBytes: 0 };
      }

      const [listResult, statsResult] = await Promise.all([
        databaseService.listMongoIndexes(dbId, collection),
        databaseService.getMongoIndexStats(dbId, collection).catch((err): MongoIndexStatsResult => {
          console.warn("Failed to fetch index stats:", err);
          return { collection, stats: {} };
        }),
      ]);

      const statsMap = statsResult?.stats || {};
      const indexes: MongoIndexWithStats[] = (listResult?.indexes || []).map((idx) => ({
        ...idx,
        stats: statsMap[idx.name],
      }));

      return {
        collection: listResult?.collection || collection,
        indexes,
        totalSizeBytes: listResult?.totalSizeBytes ?? 0,
      };
    },
    enabled: !!dbId && !!collection,
    staleTime: 30 * 1000,
  });

  const createIndexMutation = useMutation({
    mutationFn: async ({
      key,
      options,
    }: {
      key: Record<string, MongoIndexDirection>;
      options?: MongoIndexOptions;
    }): Promise<MongoIndexCreateResult> => {
      if (!collection) {
        throw new Error("No collection selected for index creation");
      }
      return databaseService.createMongoIndex(dbId, collection, key, options);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(`Index "${result.indexName}" created successfully`);
    },
    onError: (err: any) => {
      toast.error("Failed to create index", {
        description: err.message || "Unknown error creating index",
      });
    },
  });

  const dropIndexMutation = useMutation({
    mutationFn: async (indexName: string): Promise<MongoIndexDropResult> => {
      if (indexName === "_id_") {
        toast.error("The default _id_ index is required by MongoDB and cannot be dropped.");
        throw new Error("Cannot drop default _id_ index");
      }
      if (!collection) {
        throw new Error("No collection selected for index drop");
      }
      return databaseService.dropMongoIndex(dbId, collection, indexName);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(`Index "${result.droppedIndexName}" dropped successfully`);
    },
    onError: (err: any) => {
      toast.error("Failed to drop index", {
        description: err.message || "Unknown error dropping index",
      });
    },
  });

  const hideIndexMutation = useMutation({
    mutationFn: async ({
      indexName,
      hidden,
    }: {
      indexName: string;
      hidden: boolean;
    }): Promise<MongoIndexHideResult> => {
      if (indexName === "_id_") {
        toast.error("The default _id_ index cannot be hidden.");
        throw new Error("Cannot hide default _id_ index");
      }
      if (!collection) {
        throw new Error("No collection selected for index hide toggle");
      }
      return databaseService.hideMongoIndex(dbId, collection, indexName, hidden);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(`Index "${result.indexName}" is now ${result.hidden ? "hidden" : "visible"}`);
    },
    onError: (err: any) => {
      toast.error("Failed to change index visibility", {
        description:
          err.message?.includes("collMod") || err.message?.includes("hidden")
            ? `${err.message} (Note: Index hiding requires MongoDB 4.4+)`
            : err.message || "Unknown error changing index visibility",
      });
    },
  });

  return {
    ...query,
    indexes: query.data?.indexes || [],
    totalSizeBytes: query.data?.totalSizeBytes ?? 0,
    createIndex: (key: Record<string, MongoIndexDirection>, options?: MongoIndexOptions) =>
      createIndexMutation.mutateAsync({ key, options }),
    isCreating: createIndexMutation.isPending,
    createIndexMutation,
    dropIndex: (indexName: string) => dropIndexMutation.mutateAsync(indexName),
    isDropping: dropIndexMutation.isPending,
    dropIndexMutation,
    hideIndex: (indexName: string, hidden: boolean) =>
      hideIndexMutation.mutateAsync({ indexName, hidden }),
    isHiding: hideIndexMutation.isPending,
    hideIndexMutation,
  };
}
