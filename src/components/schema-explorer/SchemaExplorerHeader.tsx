import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Database } from 'lucide-react'
import CreateTableDialog from './CreateTableDialog'
import AddIndexesDialog from './AddIndexesDialog'

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

    // For now, we'll use the first schema or 'public' as default
    // In a future enhancement, we could let users select the schema
    const defaultSchema = 'public';

    return (
        <div>
            <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl px-6 py-4 shrink-0 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to={`/${dbId}`}>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-accent transition-colors">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">Schema Explorer</h1>
                            <p className="text-sm text-muted-foreground">
                                {database.name} | Browse structure and metadata
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        {/* Add Indexes Button - only show if table is selected */}
                        {selectedTable && (
                            <Button
                                onClick={() => setAddIndexesOpen(true)}
                                variant="outline"
                                className="gap-2"
                                size="sm"
                            >
                                <Database className="h-4 w-4" />
                                Add Indexes
                            </Button>
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
            </header>

            {/* Create Table Dialog */}
            <CreateTableDialog
                open={createTableOpen}
                onOpenChange={setCreateTableOpen}
                dbId={dbId}
                schemaName={defaultSchema}
                onSuccess={onTableCreated}
            />

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
        </div>
    )
}

export default SchemaExplorerHeader