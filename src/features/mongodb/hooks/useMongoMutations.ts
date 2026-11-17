import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryService } from "@/services/bridge/query";
import { databaseService } from "@/services/bridge/database";
import {
  EJSONDocument,
  MongoUpdateOptions,
  MongoReplaceOptions,
  MongoDeleteOptions,
  MongoCreateCollectionOptions,
} from "../types";

export function useInsertMongoDocument(dbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      collection,
      document,
    }: {
      collection: string;
      document: EJSONDocument;
    }) => {
      return queryService.insertMongoDocument({ dbId, collection, document });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongoDocuments", dbId] });
      queryClient.invalidateQueries({ queryKey: ["mongoCollections", dbId] });
    },
  });
}

export function useUpdateMongoDocument(dbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      collection,
      filter,
      update,
      options,
    }: {
      collection: string;
      filter: EJSONDocument;
      update: EJSONDocument;
      options?: MongoUpdateOptions;
    }) => {
      return queryService.updateMongoDocument({ dbId, collection, filter, update, options });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongoDocuments", dbId] });
      queryClient.invalidateQueries({ queryKey: ["mongoSchema", dbId] });
    },
  });
}

export function useReplaceMongoDocument(dbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      collection,
      filter,
      replacement,
      options,
    }: {
      collection: string;
      filter: EJSONDocument;
      replacement: EJSONDocument;
      options?: MongoReplaceOptions;
    }) => {
      return queryService.replaceMongoDocument({ dbId, collection, filter, replacement, options });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongoDocuments", dbId] });
      queryClient.invalidateQueries({ queryKey: ["mongoSchema", dbId] });
    },
  });
}

export function useDeleteMongoDocument(dbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      collection,
      filter,
      options,
    }: {
      collection: string;
      filter: EJSONDocument;
      options?: MongoDeleteOptions;
    }) => {
      return queryService.deleteMongoDocument({ dbId, collection, filter, options });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongoDocuments", dbId] });
      queryClient.invalidateQueries({ queryKey: ["mongoCollections", dbId] });
    },
  });
}

export function useCreateMongoCollection(dbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      collection,
      options,
    }: {
      collection: string;
      options?: MongoCreateCollectionOptions;
    }) => {
      return databaseService.createMongoCollection(dbId, collection, options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongoCollections", dbId] });
    },
  });
}

export function useDropMongoCollection(dbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ collection }: { collection: string }) => {
      return databaseService.dropMongoCollection(dbId, collection);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongoCollections", dbId] });
      queryClient.invalidateQueries({ queryKey: ["mongoDocuments", dbId] });
      queryClient.invalidateQueries({ queryKey: ["mongoSchema", dbId] });
    },
  });
}
