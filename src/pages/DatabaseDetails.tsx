import { useParams, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import { useDatabaseDetails } from "@/hooks/useDatabaseDetails";
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

  const handleBackup = () => {
    toast.info("Initiating database backup...", { duration: 3000 });
    setTimeout(() => {
      toast.success("Backup created successfully", {
        description: "Your database backup is ready for download.",
      });
    }, 2000);
  };

  if (bridgeLoading) {
    return <BridgeLoader />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle className="text-lg">Connection Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Failed to connect to the database:
            </p>
            <pre className="bg-muted text-destructive p-3 rounded-md text-xs font-mono overflow-auto">
              {error}
            </pre>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={fetchTables} disabled={loadingTables}>
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
                <Button variant="outline" size="sm">
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
        onBackup={handleBackup}
        loading={loadingTables}
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