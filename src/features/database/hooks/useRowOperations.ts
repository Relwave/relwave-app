// features/database/hooks/useRowOperations.ts

import { useState } from "react";
import { toast } from "sonner";
import { databaseService } from "@/services/bridge/database";

interface UseRowOperationsProps {
  dbId: string;
  selectedTable: { name: string; schema?: string } | null;
  pageSize: number;
  refetchTableData: () => void;
}

export const useRowOperations = ({
  dbId,
  selectedTable,
  pageSize,
  refetchTableData,
}: UseRowOperationsProps) => {
  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Record<string, any>[] | null>(null);
  const [searchResultCount, setSearchResultCount] = useState<number | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, any> | null>(null);
  const [primaryKeyColumn, setPrimaryKeyColumn] = useState("");

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRow, setDeletingRow] = useState<Record<string, any> | null>(null);
  const [deleteRowPK, setDeleteRowPK] = useState("");
  const [deleteHasPK, setDeleteHasPK] = useState(false);

  // ---- Helpers ----

  const getSchemaName = () => selectedTable?.schema || "public";
  const getTableName = () => selectedTable?.name || "";

  const fetchPrimaryKey = async () => {
    try {
      return await databaseService.getPrimaryKeys(dbId, getSchemaName(), getTableName());
    } catch {
      return "";
    }
  };

  // ---- Search ----

  const runSearch = async (term: string, page: number) => {
    if (!term || !selectedTable) return;
    setIsSearching(true);
    try {
      const result = await databaseService.searchTable({
        dbId,
        schemaName: getSchemaName(),
        tableName: getTableName(),
        searchTerm: term,
        page,
        pageSize,
      });
      setSearchResults(result.rows);
      setSearchResultCount(result.total);
    } catch (err: any) {
      toast.error(err.message || "Search failed");
      setSearchResults(null);
      setSearchResultCount(undefined);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async () => {
    setSearchPage(1);
    await runSearch(searchTerm, 1);
  };

  const handleSearchPageChange = async (page: number) => {
    setSearchPage(page);
    await runSearch(searchTerm, page);
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    if (!term) {
      setSearchResults(null);
      setSearchResultCount(undefined);
    }
  };

  const handleSearchRefresh = () => {
    if (searchResults !== null && searchTerm) {
      setSearchPage(1);
      runSearch(searchTerm, 1);
    }
  };

  // ---- Edit ----

  const handleEditRow = async (row: Record<string, any>) => {
    try {
      const pk = await fetchPrimaryKey();
      setPrimaryKeyColumn(pk || Object.keys(row)[0] || "");
      setEditingRow(row);
      setEditDialogOpen(true);
    } catch (err: any) {
      toast.error("Cannot edit: " + (err.message || "Unknown error"));
    }
  };

  const handleEditSuccess = () => {
    refetchTableData();
    setEditDialogOpen(false);
  };

  // ---- Delete ----

  const handleDeleteRow = async (row: Record<string, any>) => {
    try {
      const pk = await fetchPrimaryKey();
      setDeletingRow(row);
      setDeleteRowPK(pk);
      setDeleteHasPK(!!pk);
      setDeleteDialogOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to prepare delete");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRow || !selectedTable) return;
    try {
      await databaseService.deleteRow({
        dbId,
        schemaName: getSchemaName(),
        tableName: getTableName(),
        primaryKeyColumn: deleteRowPK,
        primaryKeyValue: deletingRow[deleteRowPK],
      });
      toast.success("Row deleted");
      refetchTableData();
      setDeleteDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
  };

  const isSearchActive = searchResults !== null;

  return {
    // Search
    searchTerm,
    searchResults,
    searchResultCount,
    isSearching,
    searchPage,
    isSearchActive,
    handleSearch,
    handleSearchChange,
    handleSearchPageChange,
    handleSearchRefresh,

    // Edit
    editDialogOpen,
    setEditDialogOpen,
    editingRow,
    primaryKeyColumn,
    handleEditRow,
    handleEditSuccess,

    // Delete
    deleteDialogOpen,
    setDeleteDialogOpen,
    deletingRow,
    deleteRowPK,
    deleteHasPK,
    handleDeleteRow,
    handleConfirmDelete,
  };
};
