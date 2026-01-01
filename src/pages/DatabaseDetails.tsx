import { useParams, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import { useDatabaseDetails } from "@/hooks/useDatabaseDetails";
import { useExport } from "@/hooks/useExport";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import { Spinner } from "@/components/ui/spinner";
import {
  DatabasePageHeader,
  TableSelector,
  QueryContentTabs,
} from "@/components/database";

const DatabaseDetail = () => {
  const { id: dbId } = useParams<{ id: string }>();
  const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();

  const {
    databaseName,
    tables,
    selectedTable,
    tableData,
    rowCount,
    totalRows,
    currentPage,
    pageSize,
    query,
    queryProgress,
    queryError,
    isExecuting,
    loading,
    loadingTables,
    error,
    setQuery,
    handleTableSelect,
    handleExecuteQuery,
    handleCancelQuery,
    fetchTables,
    handlePageChange,
    handlePageSizeChange,
  } = useDatabaseDetails({
    dbId,
    bridgeReady: bridgeReady ?? false,
  });

  // Export hook - exports all tables to CSV or JSON
  const { exportAllTables, isExporting } = useExport({
    dbId: dbId || "",
    databaseName: databaseName || "database",
  });

  if (bridgeLoading) {
    return <BridgeLoader />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Card className="max-w-md w-full mx-4 border-border/20">
          <CardHeader className="border-b border-border/20">
            <CardTitle className="text-base">Connection Error</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground/70 mb-3">
              Failed to connect to the database:
            </p>
            <pre className="bg-muted/30 text-destructive p-3 rounded-md text-xs font-mono overflow-auto border border-border/20">
              {error}
            </pre>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={fetchTables} disabled={loadingTables} className="text-xs">
                {loadingTables ? (
                  <>
                    <Spinner className="h-3.5 w-3.5 mr-1.5" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Retry
                  </>
                )}
              </Button>
              <Link to="/">
                <Button variant="outline" size="sm" className="text-xs">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                  Back
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DatabasePageHeader
        dbId={dbId || ""}
        databaseName={databaseName}
        onRefresh={fetchTables}
        onExport={exportAllTables}
        loading={loadingTables}
        exportLoading={isExporting}
      />

      <div className="container mx-auto px-4 py-6">
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <TableSelector
              tables={tables}
              selectedTable={selectedTable}
              loading={loading}
              onTableSelect={handleTableSelect}
            />
          </div>

          <QueryContentTabs
            dbId={dbId || ""}
            selectedTable={selectedTable}
            isExecuting={isExecuting}
            tableData={tableData}
            rowCount={rowCount}
            totalRows={totalRows}
            currentPage={currentPage}
            pageSize={pageSize}
            query={query}
            queryProgress={queryProgress}
            queryError={queryError}
            onQueryChange={setQuery}
            onExecuteQuery={handleExecuteQuery}
            onCancelQuery={handleCancelQuery}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      </div>
    </div>
  );
};

export default DatabaseDetail;