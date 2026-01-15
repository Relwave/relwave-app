/**
 * useExport Hook
 * Handles database export by exporting all tables to CSV or JSON
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { bridgeApi } from "@/services/bridgeApi";
import {
  convertData,
  downloadFile,
  getMimeType,
  getFileExtension,
  ExportFormat,
} from "@/lib/dataExport";
import { TableInfo, TableRow } from "@/types/database";

interface ExportProgress {
  currentTable: string;
  currentIndex: number;
  totalTables: number;
  status: "idle" | "fetching" | "exporting" | "complete" | "error";
}

interface UseExportOptions {
  dbId: string;
  databaseName: string;
}

export function useExport({ dbId, databaseName }: UseExportOptions) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress>({
    currentTable: "",
    currentIndex: 0,
    totalTables: 0,
    status: "idle",
  });

  /**
   * Fetch all data from a table (handles pagination internally)
   */
  const fetchAllTableData = async (
    schemaName: string,
    tableName: string
  ): Promise<TableRow[]> => {
    const allRows: TableRow[] = [];
    const pageSize = 1000; // Fetch 1000 rows at a time
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await bridgeApi.fetchTableData(
        dbId,
        schemaName,
        tableName,
        pageSize,
        page
      );

      allRows.push(...result.rows);

      // Check if we've fetched all rows
      if (result.rows.length < pageSize || allRows.length >= result.total) {
        hasMore = false;
      } else {
        page++;
      }

      // Safety limit: max 100,000 rows per table
      if (allRows.length >= 100000) {
        console.warn(`Table ${tableName} truncated at 100,000 rows`);
        hasMore = false;
      }
    }

    return allRows;
  };

  /**
   * Export all tables in the specified format
   */
  const exportAllTables = useCallback(
    async (format: ExportFormat = "csv") => {
      if (isExporting) return;

      setIsExporting(true);
      const toastId = toast.loading("Starting export...", { duration: Infinity });

      try {
        // 1. Fetch all tables
        setProgress((p) => ({
          ...p,
          status: "fetching",
          currentTable: "Loading table list...",
        }));
        const tables: TableInfo[] = await bridgeApi.listTables(dbId);

        if (!tables || tables.length === 0) {
          toast.error("No tables found to export", { id: toastId });
          return;
        }

        setProgress({
          currentTable: "",
          currentIndex: 0,
          totalTables: tables.length,
          status: "exporting",
        });

        // 2. Build data for all tables
        const allTablesData: Array<{ schema: string; table: string; data: TableRow[] }> = [];
        const successfulTables: string[] = [];
        const failedTables: string[] = [];

        for (let i = 0; i < tables.length; i++) {
          const table = tables[i];
          const schemaName = table.schema || "public";
          const tableName = table.name;

          setProgress({
            currentTable: tableName,
            currentIndex: i + 1,
            totalTables: tables.length,
            status: "exporting",
          });

          toast.loading(`Exporting ${tableName} (${i + 1}/${tables.length})...`, {
            id: toastId,
          });

          try {
            // Fetch all data from the table
            const data = await fetchAllTableData(schemaName, tableName);

            if (data.length > 0) {
              allTablesData.push({ schema: schemaName, table: tableName, data });
              successfulTables.push(tableName);
            } else {
              successfulTables.push(`${tableName} (empty)`);
            }
          } catch (err) {
            console.error(`Failed to export table ${tableName}:`, err);
            failedTables.push(tableName);
          }
        }

        // 3. Create export content based on format
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        let content: string;
        let filename: string;

        if (format === "json") {
          // For JSON, create a structured object with all table data
          const exportData: Record<string, TableRow[]> = {};
          allTablesData.forEach(({ schema, table, data }) => {
            const key = `${schema}.${table}`;
            exportData[key] = data;
          });
          content = JSON.stringify(exportData, null, 2);
          filename = `${databaseName}_export_${timestamp}.json`;
        } else {
          // For CSV, combine all tables with separators
          const csvParts: string[] = [];
          allTablesData.forEach(({ schema, table, data }) => {
            const tableHeader = `\n${"=".repeat(50)}\nTABLE: ${schema}.${table} (${data.length} rows)\n${"=".repeat(50)}\n`;
            const csv = convertData(data, "csv");
            csvParts.push(tableHeader + csv);
          });
          content = csvParts.join("\n");
          filename = `${databaseName}_export_${timestamp}.csv`;
        }

        // 4. Download the file
        downloadFile(content, filename, getMimeType(format));

        setProgress((p) => ({ ...p, status: "complete" }));

        toast.success(`Export complete!`, {
          id: toastId,
          description: `Exported ${successfulTables.length} tables to ${filename}`,
        });
      } catch (error: unknown) {
        console.error("Export failed:", error);
        setProgress((p) => ({ ...p, status: "error" }));
        const errorMessage = error instanceof Error ? error.message : "An error occurred during export";
        toast.error("Export failed", {
          id: toastId,
          description: errorMessage,
        });
      } finally {
        setIsExporting(false);
        // Reset progress after a delay
        setTimeout(() => {
          setProgress({
            currentTable: "",
            currentIndex: 0,
            totalTables: 0,
            status: "idle",
          });
        }, 2000);
      }
    },
    [dbId, databaseName, isExporting]
  );

  /**
   * Export a single table in the specified format
   */
  const exportTable = useCallback(
    async (schemaName: string, tableName: string, format: ExportFormat = "csv") => {
      const toastId = toast.loading(`Exporting ${tableName}...`);

      try {
        const data = await fetchAllTableData(schemaName, tableName);

        if (data.length === 0) {
          toast.warning(`Table ${tableName} is empty`, { id: toastId });
          return;
        }

        const content = convertData(data, format);
        const timestamp = new Date().toISOString().split("T")[0];
        const extension = getFileExtension(format);
        const filename = `${tableName}_${timestamp}.${extension}`;

        downloadFile(content, filename, getMimeType(format));

        toast.success(`Exported ${data.length} rows`, {
          id: toastId,
          description: `Saved as ${filename}`,
        });
      } catch (error: unknown) {
        console.error(`Export failed for ${tableName}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        toast.error(`Export failed`, {
          id: toastId,
          description: errorMessage,
        });
      }
    },
    [dbId]
  );

  return {
    exportAllTables,
    exportTable,
    isExporting,
    progress,
  };
}
