import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Database, Trash2, Settings } from 'lucide-react'
import CreateTableDialog from './CreateTableDialog'
import AddIndexesDialog from './AddIndexesDialog'
import DropTableDialog from './DropTableDialog'
import AlterTableDialog from './AlterTableDialog'

interface SchemaExplorerHeaderProps {
    dbId: string;
    database: {
        name: string;
    };
    onTableCreated?: () => void;
    selectedTable?: { schema: string; name: string; columns: string[] } | null;
}


const SchemaExplorerHeader = ({ dbId, database, onTableCreated, selectedTable }: SchemaExplorerHeaderProps) => {
    const [createTableOpen, setCreateTableOpen] = useState(false);
    const [addIndexesOpen, setAddIndexesOpen] = useState(false);
    const [dropTableOpen, setDropTableOpen] = useState(false);
    const [alterTableOpen, setAlterTableOpen] = useState(false);

    const defaultSchema = 'public';

    return (
        <div>
            <header className="h-12 border-b border-border/40 bg-background flex items-center justify-between px-4 shrink-0">
                <div className="container">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Database className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{database.name || 'Database'}</span>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="text-sm font-medium text-foreground">Schema Explorer</span>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                            {/* Table Actions - only show if table is selected */}
                            {selectedTable && (
                                <>
                                    <Button
                                        onClick={() => setAlterTableOpen(true)}
                                        variant="outline"
                                        className="gap-2"
                                        size="sm"
                                    >
                                        <Settings className="h-4 w-4" />
                                        Alter Table
                                    </Button>

                                    <Button
                                        onClick={() => setAddIndexesOpen(true)}
                                        variant="outline"
                                        className="gap-2"
                                        size="sm"
                                    >
                                        <Database className="h-4 w-4" />
                                        Add Indexes
                                    </Button>

                                    <Button
                                        onClick={() => setDropTableOpen(true)}
                                        variant="outline"
                                        className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        size="sm"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Drop Table
                                    </Button>
                                </>
                            )}

                            {/* Create Table Button */}
                            <Button
                                onClick={() => setCreateTableOpen(true)}
                                className="gap-2"
                                size="sm"
                            >
                                <Plus className="h-4 w-4" />
                                Create Table
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Create Table Dialog */}
            <CreateTableDialog
                open={createTableOpen}
                onOpenChange={setCreateTableOpen}
                dbId={dbId}
                schemaName={defaultSchema}
                onSuccess={onTableCreated}
            />

            {/* Alter Table Dialog */}
            {selectedTable && (
                <AlterTableDialog
                    open={alterTableOpen}
                    onOpenChange={setAlterTableOpen}
                    dbId={dbId}
                    schemaName={selectedTable.schema}
                    tableName={selectedTable.name}
                    availableColumns={selectedTable.columns}
                    onSuccess={onTableCreated}
                />
            )}

            {/* Add Indexes Dialog */}
            {selectedTable && (
                <AddIndexesDialog
                    open={addIndexesOpen}
                    onOpenChange={setAddIndexesOpen}
                    dbId={dbId}
                    schemaName={selectedTable.schema}
                    tableName={selectedTable.name}
                    availableColumns={selectedTable.columns}
                    onSuccess={onTableCreated}
                />
            )}

            {/* Drop Table Dialog */}
            {selectedTable && (
                <DropTableDialog
                    open={dropTableOpen}
                    onOpenChange={setDropTableOpen}
                    dbId={dbId}
                    schemaName={selectedTable.schema}
                    tableName={selectedTable.name}
                    onSuccess={onTableCreated}
                />
            )}
        </div>
    )
}

export default SchemaExplorerHeader