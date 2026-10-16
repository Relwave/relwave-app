import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Table } from "lucide-react";
import TableDesignerForm from "./TableDesignerForm";
import AddIndexesDialog from "./AddIndexesDialog";
import { useCreateTableDialog } from "../hooks/useCreateTableDialog";
import { useDatabase } from "@/features/project/hooks/useDbQueries";
import { DatabaseLogo, getDatabaseMeta } from "@/lib/databases";

interface CreateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  schemaName: string;
  databaseType?: string;
  onSuccess?: () => void;
}

export default function CreateTableDialog({
  open,
  onOpenChange,
  dbId,
  schemaName,
  databaseType,
  onSuccess,
}: CreateTableDialogProps) {
  const { data: database } = useDatabase(dbId);
  const resolvedDbType = databaseType || database?.type;
  const dbMeta = getDatabaseMeta(resolvedDbType);

  const {
    handleClose,
    handleIndexesSuccess,
    handleSubmit,
    tableName,
    setColumns,
    setTableName,
    columns,
    foreignKeys,
    setForeignKeys,
    availableTables,
    isSubmitting,
    showIndexesDialog,
    setShowIndexesDialog,
    createdTableName,
  } = useCreateTableDialog({
    onOpenChange,
    dbId,
    schemaName,
    databaseType: resolvedDbType,
    onSuccess,
    open,
  });

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table className="h-5 w-5" />
              <span>Create New Table</span>
              {dbMeta && (
                <span className="flex items-center gap-1.5 ml-1.5 px-2 py-0.5 rounded-md bg-muted/60 border border-border/40 text-xs font-normal text-muted-foreground">
                  <DatabaseLogo type={resolvedDbType} className="w-3.5 h-3.5" />
                  <span>{dbMeta.name}</span>
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Create a new table in schema{" "}
              <span className="font-mono font-medium">{schemaName}</span>
            </DialogDescription>
          </DialogHeader>

          <TableDesignerForm
            tableName={tableName}
            onTableNameChange={setTableName}
            columns={columns}
            onColumnsChange={setColumns}
            foreignKeys={foreignKeys}
            onForeignKeysChange={setForeignKeys}
            currentSchema={schemaName}
            availableTables={availableTables}
            databaseType={resolvedDbType}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Table"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Indexes Dialog - shown after table creation */}
      <AddIndexesDialog
        open={showIndexesDialog}
        onOpenChange={setShowIndexesDialog}
        dbId={dbId}
        schemaName={schemaName}
        tableName={createdTableName}
        availableColumns={columns.map((col) => col.name).filter(Boolean)}
        onSuccess={handleIndexesSuccess}
      />
    </>
  );
}
