import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { bridgeApi } from "@/services/bridgeApi";
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
    isExecuting: boolean;
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
}

export function useDatabaseDetails({
    dbId,
    bridgeReady,
}: UseDatabaseDetailsOptions): UseDatabaseDetailsReturn {
    const [databaseName, setDatabaseName] = useState<string>("Database");
    const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null);
    const [query, setQuery] = useState("");
    const [isExecuting, setIsExecuting] = useState(false);
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingTables, setLoadingTables] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tableData, setTableData] = useState<TableRow[]>([]);
    const [rowCount, setRowCount] = useState<number>(0);
    const [totalRows, setTotalRows] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(50);
    const [querySessionId, setQuerySessionId] = useState<string | null>(null);
    const [queryProgress, setQueryProgress] = useState<QueryProgress | null>(null);


    const fetchTableDataWithPagination = useCallback(
        async (schemaName: string, tableName: string, page: number, limit: number) => {
            if (!dbId) return;

            setIsExecuting(true);
            const loadingToast = toast.loading(`Loading page ${page} from ${schemaName}.${tableName}...`);

            try {
                const startTime = performance.now();
                const result = await bridgeApi.fetchTableData(dbId, schemaName, tableName, limit, page);
                const elapsed = performance.now() - startTime;

                setTableData(result.rows);
                setRowCount(result.rows.length);
                setTotalRows(result.total);

                toast.success("Table data retrieved", {
                    id: loadingToast,
                    description: `${result.rows.length} of ${result.total} rows loaded in ${(elapsed / 1000).toFixed(2)}s`,
                    duration: 2000,
                });
            } catch (err: any) {
                console.error("Error fetching table data:", err);
                setTableData([]);
                setRowCount(0);
                toast.error("Data fetch failed", {
                    id: loadingToast,
                    description: err.message,
                });
            } finally {
                setIsExecuting(false);
            }
        },
        [dbId]
    );

    const handleTableSelect = useCallback(
        async (tableName: string, schemaName: string) => {
            if (!dbId) return;
            if (selectedTable?.schema === schemaName && selectedTable?.name === tableName) return;

            setSelectedTable({ schema: schemaName, name: tableName });
            const newQuery = `SELECT * FROM ${schemaName}.${tableName} LIMIT ${pageSize};`;
            setQuery(newQuery);
            setTableData([]);
            setRowCount(0);
            setTotalRows(0);
            setCurrentPage(1);

            await fetchTableDataWithPagination(schemaName, tableName, 1, pageSize);
        },
        [dbId, selectedTable, pageSize, fetchTableDataWithPagination]
    );

    const handlePageChange = useCallback(
        async (page: number) => {
            if (!selectedTable || !dbId) return;
            setCurrentPage(page);
            await fetchTableDataWithPagination(selectedTable.schema, selectedTable.name, page, pageSize);
        },
        [dbId, selectedTable, pageSize, fetchTableDataWithPagination]
    );

    const handlePageSizeChange = useCallback(
        async (size: number) => {
            if (!selectedTable || !dbId) return;
            setPageSize(size);
            setCurrentPage(1);
            await fetchTableDataWithPagination(selectedTable.schema, selectedTable.name, 1, size);
        },
        [dbId, selectedTable, fetchTableDataWithPagination]
    );

    const fetchTables = useCallback(async () => {
        if (!dbId) return;

        try {
            setLoadingTables(true);
            setError(null);

            const loadingToast = toast.loading("Loading database schema...", {
                description: "This may take a moment for large databases",
            });

            const startTime = performance.now();

            const [dbDetails, tableListResult] = await Promise.all([
                bridgeApi.getDatabase(dbId),
                bridgeApi.listTables(dbId),
            ]);

            const elapsed = performance.now() - startTime;

            setDatabaseName(dbDetails?.name || "Database");

            const parsedTables: TableInfo[] = tableListResult.map((item: any) => ({
                schema: item.schema || "public",
                name: item.name || "unknown",
                type: item.type || "table",
            }));

            setTables(parsedTables);

            toast.success("Database loaded", {
                id: loadingToast,
                description: `Found ${parsedTables.length} tables in ${(elapsed / 1000).toFixed(2)}s`,
                duration: 2000,
            });

            if (parsedTables.length > 0 && !selectedTable) {
                await handleTableSelect(parsedTables[0].name, parsedTables[0].schema);
            }
        } catch (err: any) {
            console.error("Failed to fetch tables:", err);
            setError(err.message || "Connection failed.");
            toast.error("Failed to load database", {
                description: err.message || "Connection failed",
            });
        } finally {
            setLoading(false);
            setLoadingTables(false);
        }
    }, [dbId, selectedTable, handleTableSelect]);

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

            setTableData([]);
            setRowCount(0);
            setQueryProgress(null);
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
            setTableData((prev) => [...prev, ...event.detail.rows]);
            setRowCount((prev) => prev + event.detail.rows.length);
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

    // Fetch tables when bridge is ready
    useEffect(() => {
        if (bridgeReady) {
            fetchTables();
        }
    }, [bridgeReady]);

    // Clear query when no table selected
    useEffect(() => {
        if (!selectedTable) {
            setQuery("");
        }
    }, [selectedTable]);

    return {
        databaseName,
        tables,
        selectedTable,
        tableData,
        rowCount,
        totalRows,
        query,
        queryProgress,
        isExecuting,
        loading,
        loadingTables,
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
    };
}
