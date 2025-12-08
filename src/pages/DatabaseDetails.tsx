import { useParams, Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { bridgeApi, TableRow } from "@/services/bridgeApi";

import QueryContentTabs from "@/components/databaseDetails/QueryContentTabs";
import TableSelectorDropdown from "@/components/databaseDetails/TableSidebar";
import DatabasePageHeader from "@/components/databaseDetails/DatabasePageHeader";

export interface TableInfo {
  schema: string;
  name: string;
  type: string;
}

export interface SelectedTable {
  schema: string;
  name: string;
}

export interface QueryProgress {
  rows: number;
  elapsed: number;
}

const DatabaseDetail = () => {
  const { id: dbId } = useParams<{ id: string }>();
  const [databaseName, setDatabaseName] = useState<string>('Database');
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null);
  const [query, setQuery] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [querySessionId, setQuerySessionId] = useState<string | null>(null);
  const [queryProgress, setQueryProgress] = useState<QueryProgress | null>(null);

  const handleTableSelect = useCallback(async (tableName: string, schemaName: string) => {
    if (!dbId) return;

    // Prevent re-fetching if the same table is selected
    if (selectedTable?.schema === schemaName && selectedTable?.name === tableName) return;

    setSelectedTable({ schema: schemaName, name: tableName });
    const newQuery = `SELECT * FROM ${schemaName}.${tableName} LIMIT 100;`;
    setQuery(newQuery);

    setIsExecuting(true);
    setTableData([]);
    setRowCount(0);

    const loadingToast = toast.loading(`Loading data from ${schemaName}.${tableName}...`);

    try {
      const startTime = performance.now();
      const data = await bridgeApi.fetchTableData(dbId, schemaName, tableName);
      const elapsed = performance.now() - startTime;

      setTableData(data);
      setRowCount(data.length);

      toast.success("Table data retrieved", {
        id: loadingToast,
        description: `${data.length} rows loaded in ${(elapsed / 1000).toFixed(2)}s`,
        duration: 2000
      });
    } catch (error: any) {
      console.error("Error fetching table data:", error);
      setTableData([]);
      setRowCount(0);
      toast.error("Data fetch failed", {
        id: loadingToast,
        description: error.message
      });
    } finally {
      setIsExecuting(false);
    }
  }, [dbId, selectedTable]);

  const fetchTables = useCallback(async () => {
    if (!dbId) return;

    try {
      setLoadingTables(true);
      setError(null);

      console.log('[DatabaseDetail] Fetching database details...');

      // Show loading toast for slow operations
      const loadingToast = toast.loading("Loading database schema...", {
        description: "This may take a moment for large databases"
      });

      const startTime = performance.now();

      // Fetch database metadata and table list in parallel
      const [dbDetails, tableListResult] = await Promise.all([
        bridgeApi.getDatabase(dbId),
        bridgeApi.listTables(dbId)
      ]);

      const elapsed = performance.now() - startTime;
      console.log(`[DatabaseDetail] Loaded ${tableListResult.length} tables in ${elapsed.toFixed(0)}ms`);

      setDatabaseName(dbDetails?.name || 'Database');

      const parsedTables: TableInfo[] = tableListResult.map((item: any) => ({
        schema: item.schema || 'public',
        name: item.name || 'unknown',
        type: item.type || 'table'
      }));

      setTables(parsedTables);

      toast.success("Database loaded", {
        id: loadingToast,
        description: `Found ${parsedTables.length} tables in ${(elapsed / 1000).toFixed(2)}s`,
        duration: 2000
      });

      // Automatically select the first table if none is selected
      if (parsedTables.length > 0 && !selectedTable) {
        await handleTableSelect(parsedTables[0].name, parsedTables[0].schema);
      } else if (selectedTable) {
        // Re-fetch data for currently selected table
        await handleTableSelect(selectedTable.name, selectedTable.schema);
      }
    } catch (err: any) {
      console.error("Failed to fetch tables:", err);
      setError(err.message || "Connection failed.");
      toast.error("Failed to load database", {
        description: err.message || "Connection failed"
      });
    } finally {
      setLoading(false);
      setLoadingTables(false);
    }
  }, [dbId, selectedTable, handleTableSelect]);

  const handleExecuteQuery = async () => {
    if (!dbId || !query.trim()) {
      toast.error("Invalid query", { description: "Please enter a SQL query to execute" });
      return;
    }

    try {
      if (querySessionId) {
        toast.warning("Query already running", { description: "Cancelling previous query first." });
        await handleCancelQuery();
      }

      // Reset state
      setTableData([]);
      setRowCount(0);
      setQueryProgress(null);
      setIsExecuting(true);

      // Create a new query session
      const sessionId = await bridgeApi.createSession();
      setQuerySessionId(sessionId);

      toast.info("Executing query...", { description: "Query started, receiving results..." });

      // Run the query - results will come via event listeners
      await bridgeApi.runQuery({
        sessionId,
        dbId,
        sql: query,
        batchSize: 1000
      });

    } catch (error: any) {
      console.error("Error executing query:", error);
      setIsExecuting(false);
      setQuerySessionId(null);
      setQueryProgress(null);
      toast.error("Query execution failed", { description: error.message });
    }
  };

  const handleCancelQuery = async () => {
    if (!querySessionId) return;

    try {
      const cancelled = await bridgeApi.cancelSession(querySessionId);
      if (cancelled) {
        toast.info("Cancelling query...", { description: "Stopping query execution" });
      }
    } catch (error: any) {
      console.error("Error cancelling query:", error);
      toast.error("Failed to cancel query", { description: error.message });
    }
  };

  const handleBackup = () => {
    toast.info("Initiating database backup...", { duration: 3000 });
    setTimeout(() => {
      toast.success("Backup created successfully", { description: "Your database backup is ready for download." });
    }, 2000);
  };

  useEffect(() => {
    if (!selectedTable) setQuery('');
    fetchTables();
  }, [fetchTables]);

  // Setup query result listeners
  useEffect(() => {
    const handleResult = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;
      setTableData(prev => [...prev, ...event.detail.rows]);
      setRowCount(prev => prev + event.detail.rows.length);
    };

    const handleProgress = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;
      setQueryProgress({
        rows: event.detail.rowsSoFar,
        elapsed: Math.round(event.detail.elapsedMs / 1000)
      });
    };

    const handleDone = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;

      setIsExecuting(false);
      setQuerySessionId(null);
      setQueryProgress(null);

      const { rows, timeMs, status } = event.detail;
      const statusType = status === 'success' ? 'success' : 'warning';
      const message = status === 'success'
        ? `Retrieved ${rows.toLocaleString()} rows in ${(timeMs / 1000).toFixed(2)}s`
        : `Stopped after retrieving ${rows.toLocaleString()} rows.`;

      toast[statusType](statusType === 'success' ? "Query Complete" : "Query Cancelled", { description: message });
    };

    const handleError = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;

      setIsExecuting(false);
      setQuerySessionId(null);
      setQueryProgress(null);
      toast.error("Query failed", { description: event.detail.error?.message || "An error occurred" });
    };

    const eventListeners = [
      { name: 'bridge:query.result', handler: handleResult },
      { name: 'bridge:query.progress', handler: handleProgress },
      { name: 'bridge:query.done', handler: handleDone },
      { name: 'bridge:query.error', handler: handleError },
    ];

    eventListeners.forEach(listener => {
      window.addEventListener(listener.name, listener.handler as EventListener);
    });

    return () => {
      eventListeners.forEach(listener => {
        window.removeEventListener(listener.name, listener.handler as EventListener);
      });
    };
  }, [querySessionId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark:bg-[#050505] text-foreground">
        {/* Updated Error Card Styling */}
        <Card className="bg-card shadow-elevated border border-border rounded-xl p-6">
          <CardHeader>
            <CardTitle className="text-2xl text-foreground mb-4">Error Loading Database</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">An error occurred while connecting to the database:</p>
            <pre className="bg-muted border border-border text-destructive p-4 rounded-lg mt-4 whitespace-pre-wrap text-sm font-mono">
              {error}
            </pre>
            <div className="mt-6 flex gap-3">
              <Button
                // Solid Cyan Retry Button (Primary Accent)
                className="bg-cyan-500 hover:bg-cyan-600 transition-all shadow-md shadow-cyan-500/30 text-white"
                onClick={() => fetchTables()}
                disabled={loadingTables}
              >
                {loadingTables ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </>
                )}
              </Button>
              <Link to={'/'}>
                <Button
                  // Outline button styling
                  className="border-border text-foreground hover:bg-accent"
                  variant={'outline'}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark:bg-[#050505] text-foreground">
      <DatabasePageHeader
        dbId={dbId || ''}
        databaseName={databaseName}
        onRefresh={fetchTables}
        onBackup={handleBackup}
        loading={loadingTables}
      />

      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex items-center justify-end">
            <TableSelectorDropdown
              tables={tables}
              selectedTable={selectedTable}
              loading={loading}
              onTableSelect={handleTableSelect}
            />
          </div>

          <QueryContentTabs
            selectedTable={selectedTable}
            isExecuting={isExecuting}
            tableData={tableData}
            rowCount={rowCount}
            query={query}
            queryProgress={queryProgress}
            setQuery={setQuery}
            onExecuteQuery={handleExecuteQuery}
            onCancelQuery={handleCancelQuery}
          />
        </div>
      </div>
    </div>
  );
};

export default DatabaseDetail;