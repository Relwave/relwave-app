import StatsOverview from './StatsOverview';
import { Database, Plus, Search } from 'lucide-react';
import { Input } from './ui/input';
import Loader from './Loader';
import { DatabaseCard } from './DatabaseCard';
import { Button } from './ui/button';
import { DatabaseConnection } from '@/services/bridgeApi';


interface DashboardContentProps {
    databases: Array<DatabaseConnection>;
    connectedCount: number;
    totalTables: number | string;
    totalSize: string;
    loading: boolean;
    statsLoading: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    handleDeleteDatabase: (id: string, name: string) => void;
    handleTestConnection: (id: string, name: string) => void;
    filteredDatabases: Array<DatabaseConnection>;
    setIsDialogOpen: (isOpen: boolean) => void;
}


const DashboardContent = ({
    databases,
    connectedCount,
    totalTables,
    totalSize,
    loading,
    searchQuery,
    setSearchQuery,
    handleDeleteDatabase,
    handleTestConnection,
    filteredDatabases,
    setIsDialogOpen
}: DashboardContentProps) => {
    return (
        <main className="grow overflow-y-auto">
            <div className="container mx-auto px-4 py-8">
                <StatsOverview
                    databases={databases}
                    connectedCount={connectedCount}
                    totalTables={totalTables}
                    totalSize={totalSize}
                    statsLoading={loading}
                />

                <div className="mb-8">
                    <div className="relative max-w-full lg:max-w-xl">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by connection name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-11 bg-input/50 border-border text-foreground focus:border-primary transition-colors"
                        />
                    </div>
                </div>

                <h2 className="text-2xl font-bold mb-6 text-foreground">Active Connections</h2>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader />
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                            {filteredDatabases.map((db) => {
                                return (
                                    <DatabaseCard
                                        key={db.id}
                                        id={db.id}
                                        name={db.name}
                                        type={db.type}
                                        status="connected"
                                        host={`${db.host}:${db.port}`}
                                        onDelete={() => handleDeleteDatabase(db.id, db.name)}
                                        onTest={() => handleTestConnection(db.id, db.name)}
                                    />
                                );
                            })}
                        </div>

                        {filteredDatabases.length === 0 && (
                            <div className="text-center py-20 border border-dashed border-border rounded-xl mt-8">
                                <Database className="h-16 w-16 text-muted-foreground/50 mx-auto mb-6" />
                                <h3 className="text-xl font-semibold mb-3 text-foreground">
                                    {databases.length === 0 ? 'No connections yet' : 'No matching connections found'}
                                </h3>
                                <p className="text-muted-foreground mb-6">
                                    {databases.length === 0
                                        ? 'Get started by adding your first database connection.'
                                        : 'Try adjusting your search or create a new database connection.'}
                                </p>
                                <Button
                                    onClick={() => setIsDialogOpen(true)}
                                    className="bg-cyan-500 hover:bg-cyan-600 transition-all shadow-lg shadow-cyan-500/30"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    New Connection
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>)
}

export default DashboardContent