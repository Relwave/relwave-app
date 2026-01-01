import { StatsOverview } from './StatsOverview';
import { Database, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DatabaseCard } from './DatabaseCard';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { DatabaseConnection } from '@/types/database';

interface DashboardContentProps {
    databases: Array<DatabaseConnection>;
    connectedCount: number;
    totalTables: number | string;
    totalSize: string;
    totalRows: number;
    loading: boolean;
    statsLoading: boolean;
    searchQuery: string;
    status: Map<string, string>;
    setSearchQuery: (query: string) => void;
    handleDeleteDatabase: (id: string, name: string) => void;
    handleTestConnection: (id: string, name: string) => void;
    filteredDatabases: Array<DatabaseConnection>;
    setIsDialogOpen: (isOpen: boolean) => void;
    onDatabaseHover?: (dbId: string) => void;
}

const DashboardContent = ({
    databases,
    connectedCount,
    totalTables,
    totalSize,
    totalRows,
    loading,
    searchQuery,
    setSearchQuery,
    handleDeleteDatabase,
    handleTestConnection,
    filteredDatabases,
    setIsDialogOpen,
    status,
    onDatabaseHover,
}: DashboardContentProps) => {
    return (
        <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-4 py-6">
                <StatsOverview
                    databases={databases}
                    connectedCount={connectedCount}
                    totalTables={totalTables}
                    totalSize={totalSize}
                    totalRows={totalRows}
                    statsLoading={loading}
                />

                {/* Search Bar */}
                <div className="mb-6">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                        <Input
                            placeholder="Search connections..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 text-sm"
                        />
                    </div>
                </div>

                {/* Section Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground/60" />
                        <h2 className="text-sm font-medium text-foreground">
                            Connections
                        </h2>
                        {!loading && databases.length > 0 && (
                            <span className="text-xs text-muted-foreground/70">
                                ({filteredDatabases.length})
                            </span>
                        )}
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <Spinner className="h-7 w-7 text-primary/50 mb-3" />
                        <p className="text-sm text-muted-foreground/70">Loading connections...</p>
                    </div>
                ) : (
                    <>
                        {/* Database Cards Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredDatabases.map((db) => (
                                <DatabaseCard
                                    key={db.id}
                                    id={db.id}
                                    name={db.name}
                                    type={db.type}
                                    status={status}
                                    host={`${db.host}:${db.port}`}
                                    onDelete={() => handleDeleteDatabase(db.id, db.name)}
                                    onTest={() => handleTestConnection(db.id, db.name)}
                                    onHover={onDatabaseHover}
                                />
                            ))}
                        </div>

                        {/* Empty State */}
                        {filteredDatabases.length === 0 && (
                            <div className="text-center py-16 border border-dashed border-border/30 rounded-lg bg-muted/10">
                                <Database className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                                <h3 className="text-sm font-medium text-foreground mb-1">
                                    {databases.length === 0 ? 'No connections yet' : 'No matches found'}
                                </h3>
                                <p className="text-xs text-muted-foreground/70 mb-4">
                                    {databases.length === 0
                                        ? 'Add your first database connection to get started'
                                        : 'Try a different search term'}
                                </p>
                                {databases.length === 0 && (
                                    <Button onClick={() => setIsDialogOpen(true)} size="sm" className="h-8 text-xs">
                                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                                        Add Connection
                                    </Button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    );
};

export default DashboardContent;