import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { bridgeApi } from "@/services/bridgeApi";
import { useDatabase, useTables, useTableData, usePrefetch, useInvalidateCache } from "@/hooks/useDbQueries";
import { QueryProgress, SelectedTable, TableInfo, TableRow } from "@/types/database";

interface UseDatabaseDetailsOptions {
    dbId: string | undefined;
    bridgeReady: boolean;
}

interface UseDatabaseDetailsReturn {
    databaseName: string;
    tables: TableInfo[];
    selectedTable: SelectedTable | null;
    tableData: TableRow[];
    rowCount: number;
    totalRows: number;
    query: string;
    queryProgress: QueryProgress | null;
    queryError: string | null;
    isExecuting: boolean;
    isLoadingData: boolean;
    loading: boolean;
    loadingTables: boolean;
    error: string | null;
    currentPage: number;
    pageSize: number;
    setQuery: (query: string) => void;
    handleTableSelect: (tableName: string, schemaName: string) => Promise<void>;
    handleExecuteQuery: () => Promise<void>;
    handleCancelQuery: () => Promise<void>;
    fetchTables: () => Promise<void>;
    handlePageChange: (page: number) => Promise<void>;
    handlePageSizeChange: (size: number) => Promise<void>;
    refetchTableData: () => void;
}

export function useDatabaseDetails({
    dbId,
    bridgeReady,
}: UseDatabaseDetailsOptions): UseDatabaseDetailsReturn {
    const { data: dbDetails } = useDatabase(dbId);
    const databaseName = dbDetails?.name || "Database";

    const {
        data: tablesData = [],
        isLoading: loadingTables,
        refetch: refetchTables,
        isRefetching: isRefetchingTables
    } = useTables(dbId);

    // Transform tables data
    const tables: TableInfo[] = tablesData.map((item: any) => ({
        schema: item.schema || "public",
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
        isFetching: isFetchingTableData
    } = useTableData(
        dbId,
        selectedTable?.schema,
        selectedTable?.name,
        currentPage,
        pageSize
    );

    // Prefetch utilities
    const { prefetchNextPage } = usePrefetch();

    // Cache invalidation
    const { invalidateTable } = useInvalidateCache();

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
    const [hasExecutedQuery, setHasExecutedQuery] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Combined loading state
    const loading = loadingTables || isLoadingTableData;
    const isTableDataLoading = isFetchingTableData;

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
            // React Query will automatically fetch the data
        },
        [dbId, selectedTable, pageSize]
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
        [dbId, selectedTable, pageSize, prefetchNextPage]
    );

    const handlePageSizeChange = useCallback(
        async (size: number) => {
            if (!selectedTable || !dbId) return;
            setPageSize(size);
            setCurrentPage(1);
        },
        [dbId, selectedTable]
    );

    const fetchTables = useCallback(async () => {
        await refetchTables();
    }, [refetchTables]);

    const refetchTableData = useCallback(() => {
        if (!dbId || !selectedTable) return;
        invalidateTable(dbId, selectedTable.schema, selectedTable.name);
    }, [dbId, selectedTable, invalidateTable]);

    const handleCancelQuery = useCallback(async () => {
        if (!querySessionId) return;

        try {
            const cancelled = await bridgeApi.cancelSession(querySessionId);
            if (cancelled) {
                toast.info("Cancelling query...", { description: "Stopping query execution" });
            }
        } catch (err: any) {
            console.error("Error cancelling query:", err);
            toast.error("Failed to cancel query", { description: err.message });
        }
    }, [querySessionId]);

    const handleExecuteQuery = useCallback(async () => {
        if (!dbId || !query.trim()) {
            toast.error("Invalid query", { description: "Please enter a SQL query to execute" });
            return;
        }

        try {
            if (querySessionId) {
                toast.warning("Query already running", { description: "Cancelling previous query first." });
                await handleCancelQuery();
            }

            setQueryResults([]);
            setQueryRowCount(0);
            setQueryProgress(null);
            setQueryError(null);
            setHasExecutedQuery(true);
            setIsExecuting(true);

            const sessionId = await bridgeApi.createSession();
            setQuerySessionId(sessionId);

            toast.info("Executing query...", { description: "Query started, receiving results..." });

            await bridgeApi.runQuery({
                sessionId,
                dbId,
                sql: query,
                batchSize: 1000,
            });
        } catch (err: any) {
            console.error("Error executing query:", err);
            setIsExecuting(false);
            setQuerySessionId(null);
            setQueryProgress(null);
            toast.error("Query execution failed", { description: err.message });
        }
    }, [dbId, query, querySessionId, handleCancelQuery]);

    // Setup query result listeners
    useEffect(() => {
        const handleResult = (event: CustomEvent) => {
            if (event.detail.sessionId !== querySessionId) return;
            setQueryResults((prev) => [...prev, ...event.detail.rows]);
            setQueryRowCount((prev) => prev + event.detail.rows.length);
        };

        const handleProgress = (event: CustomEvent) => {
            if (event.detail.sessionId !== querySessionId) return;
            setQueryProgress({
                rows: event.detail.rowsSoFar,
                elapsed: Math.round(event.detail.elapsedMs / 1000),
            });
        };

        const handleDone = (event: CustomEvent) => {
            if (event.detail.sessionId !== querySessionId) return;

            setIsExecuting(false);
            setQuerySessionId(null);
            setQueryProgress(null);

            const { rows, timeMs, status } = event.detail;
            const statusType = status === "success" ? "success" : "warning";
            const message =
                status === "success"
                    ? `Retrieved ${rows.toLocaleString()} rows in ${(timeMs / 1000).toFixed(2)}s`
                    : `Stopped after retrieving ${rows.toLocaleString()} rows.`;

            toast[statusType](statusType === "success" ? "Query Complete" : "Query Cancelled", {
                description: message,
            });
        };

        const handleError = (event: CustomEvent) => {
            if (event.detail.sessionId !== querySessionId) return;

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
    }, [querySessionId]);

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
        tables,
        selectedTable,
        tableData: showQueryResults ? queryResults : tableData,
        rowCount: showQueryResults ? queryRowCount : rowCount,
        totalRows,
        query,
        queryProgress,
        queryError,
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
    };
}
