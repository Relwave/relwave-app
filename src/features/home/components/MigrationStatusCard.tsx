import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useImportAnalysis } from "@/features/project/hooks/useImportAnalysis";
import { AlertTriangle, Database, RefreshCw, CheckCircle2 } from "lucide-react";
import { SchemaDriftSheet } from "@/features/project/components/SchemaDriftSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MigrationStatusCardProps {
  projectId: string;
  databaseId: string;
  connectionName: string;
}

export function MigrationStatusCard({ projectId, databaseId, connectionName }: MigrationStatusCardProps) {
  const { analysis, loading, refetch } = useImportAnalysis(projectId, databaseId);
  const [driftSheetOpen, setDriftSheetOpen] = useState(false);

  if (loading && !analysis) {
    return <Skeleton className="h-[200px] w-full rounded-xl" />;
  }

  if (!analysis) return null;

  const isDrifted = analysis.driftStatus === "drifted";
  const isSynced = analysis.driftStatus === "synced";

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base font-semibold">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              Migration Status
            </div>
            {isSynced ? (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Synced
              </Badge>
            ) : isDrifted ? (
              <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Drift Detected
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                {Math.max(0, analysis.migrationCount)} Pending
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            State of the live database against the project schema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pending Migrations</span>
              <span className="font-medium">{Math.max(0, analysis.migrationCount)}</span>
            </div>

            {isDrifted && analysis.driftDetails && (
              <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                Schema drift detected. The live database has modifications not tracked in the schema snapshot.
              </div>
            )}

            {isDrifted && !analysis.driftDetails && (
              <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                Drift detected — pending migrations have not been applied to the live database.
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refetch}
                disabled={loading}
                className="flex-1"
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
              {isDrifted && (
                <Button size="sm" onClick={() => setDriftSheetOpen(true)} className="flex-1">
                  View Drift
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Always render the sheet — it manages its own empty-state guard */}
      <SchemaDriftSheet
        open={driftSheetOpen}
        onOpenChange={setDriftSheetOpen}
        projectId={projectId}
        connectionName={connectionName}
        driftDetails={analysis.driftDetails}
        onRefresh={refetch}
      />
    </>
  );
}
