import { useParams, Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { bridgeApi, TableRow } from "@/services/bridgeApi";
import DatabasePageHeader from "@/components/databaseDetails/header";
import QueryContentTabs from "@/components/databaseDetails/QueryContentTabs";
import TableSelectorDropdown from "@/components/databaseDetails/TableSidebar"; // Assuming this is now TableSelectorDropdown

// ... (Interface definitions remain unchanged)
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
  // Set initial query to null/empty so the first table load updates it
  const [query, setQuery] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Query execution states
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [querySessionId, setQuerySessionId] = useState<string | null>(null);
  const [queryProgress, setQueryProgress] = useState<QueryProgress | null>(null);

  // --- API Handlers (functions remain unchanged) ---

  const handleTableSelect = useCallback(async (tableName: string, schemaName: string) => {
    if (!dbId) return;

    // Prevent re-fetching if the same table is selected
    if (selectedTable?.schema === schemaName && selectedTable?.name === tableName) return;

    setSelectedTable({ schema: schemaName, name: tableName });
    const newQuery = `SELECT * FROM ${schemaName}.${tableName} LIMIT 100;`;
    setQuery(newQuery); // Update query box

    setIsExecuting(true);
    setTableData([]);
    setRowCount(0);

    try {
      const data = await bridgeApi.fetchTableData(dbId, schemaName, tableName);
      setTableData(data);
      setRowCount(data.length);
      toast.success("Table data retrieved", {
        description: `${data.length} rows loaded for ${schemaName}.${tableName}.`,
        duration: 1500
      });
    } catch (error: any) {
      console.error("Error fetching table data:", error);
      setTableData([]);
      setRowCount(0);
      toast.error("Data fetch failed", { description: error.message });
    } finally {
      setIsExecuting(false);
    }
  }, [dbId, selectedTable]);

  const fetchTables = useCallback(async () => {
    if (!dbId) return;

    try {
      setLoading(true);
      setError(null);

      const tableListResult = await bridgeApi.listTables(dbId);
      const dbDetails = await bridgeApi.getDatabase(dbId);
      setDatabaseName(dbDetails?.name || 'Database');

      const parsedTables: TableInfo[] = tableListResult.map((item: any) => ({
        schema: item.schema || 'public',
        name: item.name || 'unknown',
        type: item.type || 'table'
      }));

      setTables(parsedTables);

      // Automatically select the first table if none is selected
      if (parsedTables.length > 0 && !selectedTable) {
        await handleTableSelect(parsedTables[0].name, parsedTables[0].schema);
      } else if (selectedTable) {
        // If a table was already selected, make sure to re-fetch its data 
        // after the list is refreshed (optional, but safer)
        await handleTableSelect(selectedTable.name, selectedTable.schema);
      }
    } catch (err: any) {
      console.error("Failed to fetch tables:", err);
      setError(err.message || "Connection failed.");
      toast.error("Failed to load tables", { description: err.message });
    } finally {
      setLoading(false);
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
      // Cleanup happens via the query.done notification
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

  // --- Effect Hooks (remain unchanged) ---

  useEffect(() => {
    // Clear initial query if tables haven't loaded yet
    if (!selectedTable) setQuery('');
    fetchTables();
  }, [fetchTables]);

  // Setup query result listeners (rest of the effect hook remains the same)
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
    // Error boundary rendering: Updated background classes for error card
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950 text-black dark:text-white">
        <Card className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-xl shadow-lg dark:shadow-2xl p-6">
          <CardHeader>
            <CardTitle className="text-2xl text-gray-900 dark:text-white mb-4">Error Loading Database</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-400">An error occurred while connecting to the database:</p>
            <pre className="bg-gray-100 dark:bg-gray-800/70 border border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 p-4 rounded-lg mt-4 whitespace-pre-wrap text-sm font-mono">
              {error}
            </pre>
            <div className="mt-6 flex gap-3">
              <Button
                className="mt-4 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                variant="outline"
                onClick={() => fetchTables()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Link to={'/'}>
                <Button
                  className="mt-4 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
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
    <div className="min-h-screen **bg-gray-100 dark:bg-gray-950** text-black dark:text-white">
      <DatabasePageHeader
        dbId={dbId || ''}
        databaseName={databaseName}
        onRefresh={fetchTables}
        onBackup={handleBackup}
      />

      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Table Selector Dropdown Section (Header Text is fine) */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
              Data View
            </h2>
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