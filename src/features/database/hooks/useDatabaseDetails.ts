import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  useDatabase,
  useTables,
  useTableData,
  usePrefetch,
  useInvalidateCache,
  useSchemaNames,
  useFullSchema,
} from "@/features/project/hooks/useDbQueries";
import { QueryProgress, SelectedTable, TableInfo, TableRow, ColumnDetails } from "@/features/database/types";
import { sessionService } from "@/services/bridge/session";
import { queryService } from "@/services/bridge/query";
import { analyticsService } from "@/services/analytics";

interface UseDatabaseDetailsOptions {
  dbId: string | undefined;
  bridgeReady: boolean;
}

interface UseDatabaseDetailsReturn {
  databaseName: string;
  databaseType: string | undefined;
  tables: TableInfo[];
  selectedTable: SelectedTable | null;
  tableData: TableRow[];
  tableColumns: ColumnDetails[];
  rowCount: number;
  totalRows: number;
  query: string;
  queryResults: TableRow[];
  hasExecutedQuery: boolean;
  queryProgress: QueryProgress | null;
  queryError: string | null;
  executionTime: number | null;
  isExecuting: boolean;
  isLoadingData: boolean;
  loading: boolean;
  loadingTables: boolean;
  error: string | null;
  currentPage: number;
  pageSize: number;
  setQuery: (query: string) => void;
  handleTableSelect: (tableName: string, schemaName: string) => Promise<void>;
  handleExecuteQuery: (sqlOverride?: string) => Promise<void>;
  handleCancelQuery: () => Promise<void>;
  fetchTables: () => Promise<void>;
  handlePageChange: (page: number) => Promise<void>;
  handlePageSizeChange: (size: number) => Promise<void>;
  refetchTableData: () => void;
  schemas: string[];
  selectedSchema: string;
  setSelectedSchema: (schema: string) => void;
}

export function useDatabaseDetails({
  dbId,
  bridgeReady,
}: UseDatabaseDetailsOptions): UseDatabaseDetailsReturn {
  const { data: dbDetails } = useDatabase(dbId);
  const databaseName = dbDetails?.name || "Database";
  const databaseType = dbDetails?.type;

  const { data: schemas = [] } = useSchemaNames(dbId);
  const [selectedSchema, setSelectedSchema] = useState<string>("public");

  // Auto-select first schema if current one is invalid
  useEffect(() => {
    if (schemas.length > 0 && !schemas.includes(selectedSchema)) {
      // Prefer public if available, otherwise first schema
      if (schemas.includes("public")) {
        setSelectedSchema("public");
      } else {
        setSelectedSchema(schemas[0]);
      }
    }
  }, [schemas, selectedSchema]);

  const {
    data: tablesData = [],
    isLoading: loadingTables,
    refetch: refetchTables,
    isRefetching: isRefetchingTables,
  } = useTables(dbId, selectedSchema);

  // Transform tables data
  const tables: TableInfo[] = tablesData.map((item: any) => ({
    schema: item.schema || selectedSchema || "public",
    name: item.name || "unknown",
    type: item.type || "table",
  }));

  // Local state for selected table and pagination
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const {
    data: tableDataResult,
    isLoading: isLoadingTableData,
    isFetching: isFetchingTableData,
  } = useTableData(dbId, selectedTable?.schema, selectedTable?.name, currentPage, pageSize);

  // Prefetch utilities
  const { prefetchNextPage } = usePrefetch();

  // Cache invalidation
  const { invalidateTable, invalidateDatabase } = useInvalidateCache();

  // Full schema for column metadata fallback
  const { data: fullSchema } = useFullSchema(dbId);
  const selectedTableColumns = useMemo(() => {
    if (!fullSchema?.schemas || !selectedTable) return [];
    const schema = fullSchema.schemas.find((s) => s.name === selectedTable.schema);
    const table = schema?.tables?.find((t) => t.name === selectedTable.name);
    return table?.columns || [];
  }, [fullSchema, selectedTable]);

  // Derived state from table data query
  const tableData = tableDataResult?.rows || [];
  const rowCount = tableData.length;
  const totalRows = tableDataResult?.total || 0;

  // Query execution state (still manual - streaming queries)
  const [query, setQuery] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [querySessionId, setQuerySessionId] = useState<string | null>(null);
  const [queryProgress, setQueryProgress] = useState<QueryProgress | null>(null);
  const [queryResults, setQueryResults] = useState<TableRow[]>([]);
  const [queryRowCount, setQueryRowCount] = useState<number>(0);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [hasExecutedQuery, setHasExecutedQuery] = useState(false);
  const [error, _setError] = useState<string | null>(null);

  const querySessionIdRef = useRef<string | null>(null);
  const lastExecutedSqlRef = useRef<string>("");

  // Combined loading state
  const loading = loadingTables || isLoadingTableData;

  const handleTableSelect = useCallback(
    async (tableName: string, schemaName: string) => {
      if (!dbId) return;
      if (selectedTable?.schema === schemaName && selectedTable?.name === tableName) return;

      setSelectedTable({ schema: schemaName, name: tableName });
      const newQuery = `SELECT * FROM ${schemaName}.${tableName} LIMIT ${pageSize};`;
      setQuery(newQuery);
      setCurrentPage(1);
      // Reset query execution state when switching tables
      setHasExecutedQuery(false);
      setQueryResults([]);
      setQueryRowCount(0);
      setQueryError(null);
      setExecutionTime(null);
      // React Query will automatically fetch the data
    },
    [dbId, selectedTable, pageSize],
  );

  const handlePageChange = useCallback(
    async (page: number) => {
      if (!selectedTable || !dbId) return;
      setCurrentPage(page);
      // Prefetch next page for smooth pagination
      if (dbId && selectedTable) {
        prefetchNextPage(dbId, selectedTable.schema, selectedTable.name, page, pageSize);
      }
    },
    [dbId, selectedTable, pageSize, prefetchNextPage],
  );

  const handlePageSizeChange = useCallback(
    async (size: number) => {
      if (!selectedTable || !dbId) return;
      setPageSize(size);
      setCurrentPage(1);
    },
    [dbId, selectedTable],
  );

  const fetchTables = useCallback(async () => {
    await refetchTables();
  }, [refetchTables]);

  const refetchTableData = useCallback(() => {
    if (!dbId || !selectedTable) return;
    invalidateTable(dbId, selectedTable.schema, selectedTable.name);
  }, [dbId, selectedTable, invalidateTable]);

  const handleCancelQuery = useCallback(async () => {
    const activeSession = querySessionIdRef.current || querySessionId;
    if (!activeSession) return;

    try {
      const cancelled = await sessionService.cancelSession(activeSession);
      if (cancelled) {
        toast.info("Cancelling query...", { description: "Stopping query execution" });
      }
    } catch (err: any) {
      console.error("Error cancelling query:", err);
      toast.error("Failed to cancel query", { description: err.message });
    }
  }, [querySessionId]);

  const handleExecuteQuery = useCallback(
    async (sqlOverride?: string) => {
      const sqlToRun = (sqlOverride !== undefined ? sqlOverride : query).trim();
      if (!dbId || !sqlToRun) {
        toast.error("Invalid query", { description: "Please enter a SQL query to execute" });
        return;
      }

      try {
        if (querySessionIdRef.current) {
          toast.warning("Query already running", {
            description: "Cancelling previous query first.",
          });
          await handleCancelQuery();
        }

        setQueryResults([]);
        setQueryRowCount(0);
        setQueryProgress(null);
        setQueryError(null);
        setExecutionTime(null);
        setHasExecutedQuery(true);
        setIsExecuting(true);
        analyticsService.trackQueryExecuted();

        const sessionId = await sessionService.createSession();
        querySessionIdRef.current = sessionId;
        lastExecutedSqlRef.current = sqlToRun;
        setQuerySessionId(sessionId);

        toast.info("Executing query...", { description: "Query started, receiving results..." });

        await queryService.runQuery({
          sessionId,
          dbId,
          sql: sqlToRun,
          batchSize: 1000,
        });
      } catch (err: any) {
        console.error("Error executing query:", err);
        querySessionIdRef.current = null;
        setIsExecuting(false);
        setQuerySessionId(null);
        setQueryProgress(null);
        setQueryError(err.message || String(err));
        toast.error("Query execution failed", { description: err.message });
      }
    },
    [dbId, query, handleCancelQuery],
  );

  // Setup query result listeners
  useEffect(() => {
    const handleResult = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionIdRef.current) return;
      setQueryResults((prev) => [...prev, ...event.detail.rows]);
      setQueryRowCount((prev) => prev + event.detail.rows.length);
    };

    const handleProgress = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionIdRef.current) return;
      setQueryProgress({
        rows: event.detail.rowsSoFar,
        elapsed: Math.round(event.detail.elapsedMs / 1000),
      });
    };

    const handleDone = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionIdRef.current) return;

      querySessionIdRef.current = null;
      setIsExecuting(false);
      setQuerySessionId(null);
      setQueryProgress(null);

      const isDDL = lastExecutedSqlRef.current
        .trim()
        .toUpperCase()
        .match(/^(CREATE|DROP|ALTER|TRUNCATE)/);
      if (isDDL && dbId && event.detail.status === "success") {
        invalidateDatabase(dbId);
      }

      const { rows, timeMs, status } = event.detail;
      const elapsedSec = timeMs !== undefined ? Number((timeMs / 1000).toFixed(2)) : null;
      setExecutionTime(elapsedSec);

      const statusType = status === "success" ? "success" : "warning";
      const message =
        status === "success"
          ? `Retrieved ${(rows || 0).toLocaleString()} rows in ${(timeMs / 1000).toFixed(2)}s`
          : `Stopped after retrieving ${(rows || 0).toLocaleString()} rows.`;

      toast[statusType](statusType === "success" ? "Query Complete" : "Query Cancelled", {
        description: message,
      });
    };

    const handleError = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionIdRef.current) return;

      querySessionIdRef.current = null;
      setIsExecuting(false);
      setQuerySessionId(null);
      setQueryProgress(null);
      setQueryError(event.detail.error?.message || "An error occurred");
      setQueryResults([]);
      setQueryRowCount(0);
      toast.error("Query failed", {
        description: event.detail.error?.message || "An error occurred",
      });
    };

    const eventListeners = [
      { name: "bridge:query.result", handler: handleResult },
      { name: "bridge:query.progress", handler: handleProgress },
      { name: "bridge:query.done", handler: handleDone },
      { name: "bridge:query.error", handler: handleError },
    ];

    eventListeners.forEach((listener) => {
      window.addEventListener(listener.name, listener.handler as EventListener);
    });

    return () => {
      eventListeners.forEach((listener) => {
        window.removeEventListener(listener.name, listener.handler as EventListener);
      });
    };
  }, [dbId, invalidateDatabase]);

  // Auto-select first table when tables are loaded
  useEffect(() => {
    if (tables.length > 0 && !selectedTable && bridgeReady) {
      handleTableSelect(tables[0].name, tables[0].schema);
    }
  }, [tables, selectedTable, bridgeReady, handleTableSelect]);

  // Clear query when no table selected
  useEffect(() => {
    if (!selectedTable) {
      setQuery("");
    }
  }, [selectedTable]);

  // Determine which data to show: query results (if query was executed) or table data
  const showQueryResults = hasExecutedQuery || isExecuting;

  return {
    databaseName,
    databaseType,
    tables,
    selectedTable,
    tableData: showQueryResults ? queryResults : tableData,
    tableColumns: selectedTableColumns,
    queryResults,
    hasExecutedQuery,
    rowCount: showQueryResults ? queryRowCount : rowCount,
    totalRows,
    query,
    queryProgress,
    queryError,
    executionTime,
    isExecuting,
    isLoadingData: isFetchingTableData,
    loading,
    loadingTables: loadingTables || isRefetchingTables,
    error,
    currentPage,
    pageSize,
    setQuery,
    handleTableSelect,
    handleExecuteQuery,
    handleCancelQuery,
    fetchTables,
    handlePageChange,
    handlePageSizeChange,
    refetchTableData,
    schemas,
    selectedSchema,
    setSelectedSchema,
  };
}
