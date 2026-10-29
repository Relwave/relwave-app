import { useState, useEffect, useMemo, useCallback } from "react";
import { useMongoCollections, useMongoDocuments } from "@/features/project/hooks/useDbQueries";
import { EJSONDocument, MongoFindRequest } from "../types";

export function useMongoDatabaseDetails(dbId: string) {
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<1 | -1 | null>(null);
  const [filterInput, setFilterInput] = useState<string>("");
  const [appliedFilter, setAppliedFilter] = useState<EJSONDocument | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<"documents" | "schema">("documents");

  const {
    data: collectionsData,
    isLoading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections,
  } = useMongoCollections(dbId);

  const collections = useMemo(() => collectionsData?.collections || [], [collectionsData]);

  useEffect(() => {
    if (collections.length > 0 && !selectedCollection) {
      setSelectedCollection(collections[0].name);
    }
  }, [collections, selectedCollection]);

  const handleSelectCollection = useCallback((name: string) => {
    setSelectedCollection(name);
    setPage(1);
    setFilterInput("");
    setAppliedFilter(undefined);
    setSortField(null);
    setSortDirection(null);
  }, []);

  const handleSort = useCallback((field: string) => {
    setSortField((currentField) => {
      if (currentField === field) {
        setSortDirection((currentDir) => (currentDir === 1 ? -1 : currentDir === -1 ? null : 1));
        return field;
      }
      setSortDirection(1);
      return field;
    });
    setPage(1);
  }, []);

  const sortSpec = useMemo(() => {
    if (!sortField || !sortDirection) return undefined;
    return { [sortField]: sortDirection };
  }, [sortField, sortDirection]);

  const findRequest: MongoFindRequest | null = useMemo(() => {
    if (!dbId || !selectedCollection) return null;
    return {
      dbId,
      collection: selectedCollection,
      page,
      pageSize,
      filter: appliedFilter,
      sort: sortSpec,
    };
  }, [dbId, selectedCollection, page, pageSize, appliedFilter, sortSpec]);

  const {
    data: docResult,
    isLoading: isLoadingDocuments,
    isFetching: isFetchingDocuments,
    error: documentsError,
    refetch: refetchDocuments,
  } = useMongoDocuments(findRequest, !!selectedCollection);

  const applyFilter = useCallback((filterObj: EJSONDocument | undefined) => {
    setAppliedFilter(filterObj);
    setPage(1);
  }, []);

  const resetFilter = useCallback(() => {
    setFilterInput("");
    setAppliedFilter(undefined);
    setPage(1);
  }, []);

  return {
    collections,
    collectionsLoading,
    collectionsError,
    selectedCollection,
    setSelectedCollection: handleSelectCollection,
    documents: docResult?.documents || [],
    totalDocuments: docResult?.total || 0,
    totalPages: docResult?.totalPages || 1,
    hasMore: docResult?.hasMore || false,
    page,
    setPage,
    pageSize,
    setPageSize,
    sortField,
    sortDirection,
    handleSort,
    filterInput,
    setFilterInput,
    appliedFilter,
    applyFilter,
    resetFilter,
    activeTab,
    setActiveTab,
    isLoadingDocuments,
    isFetchingDocuments,
    documentsError,
    refetchDocuments,
    refetchCollections,
  };
}
