// pages/Index.tsx

import { useBridgeQuery } from "@/services/bridge/useBridgeQuery";
import {
    ConnectionList,
    DatabaseDetail,
    WelcomeView,
    AddConnectionDialog,
    DeleteDialog,
} from "@/features/home/components";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import BridgeFailed from "@/components/feedback/BridgeFailed";
import VerticalIconBar from "@/components/layout/VerticalIconBar";
import { useIndexPage } from "@/features/home/hooks/useIndexPage";

const Index = () => {
    const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();

    // Bridge guard — only logic allowed in page
    if (bridgeLoading || bridgeReady === undefined) return <BridgeLoader />;
    if (!bridgeReady) return <BridgeFailed />;

    return <IndexContent bridgeReady={bridgeReady} />;
};

// Separated so hooks only run after bridge is ready
const IndexContent = ({ bridgeReady }: { bridgeReady: boolean }) => {
    const {
        // Data
        databases,
        filteredDatabases,
        recentDatabases,
        selectedDatabase,
        selectedDbStats,
        loading,
        welcomeMessage,

        // Status + stats
        status,
        totalSize,
        totalTables,
        connectedCount,
        showStatsLoading,
        isSelectedConnected,

        // Mutation states
        isAdding,

        // UI state
        searchQuery,
        setSearchQuery,
        selectedDb,
        setSelectedDb,
        isDialogOpen,
        deleteDialogOpen,
        setDeleteDialogOpen,
        dbToDelete,
        prefilledConnectionData,

        // Handlers
        handleAddDatabase,
        handleDeleteDatabase,
        handleTestConnection,
        handleDatabaseClick,
        handleDatabaseHover,
        handleDiscoveredDatabaseAdd,
        handleDialogClose,
        openDeleteDialog,
    } = useIndexPage(bridgeReady);

    return (
        <div className="h-[calc(100vh-32px)] flex bg-background text-foreground overflow-hidden">
            <VerticalIconBar />

            <main className="flex-1 ml-15 flex">
                {/* Left Panel */}
                <ConnectionList
                    databases={databases}
                    filteredDatabases={filteredDatabases}
                    loading={loading}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedDb={selectedDb}
                    setSelectedDb={setSelectedDb}
                    status={status}
                    connectedCount={connectedCount}
                    totalTables={totalTables}
                    statsLoading={showStatsLoading}
                    onAddClick={() => handleDialogClose(true)}
                    onDatabaseHover={handleDatabaseHover}
                    onDelete={openDeleteDialog}
                    onTest={handleTestConnection}
                />

                {/* Right Panel */}
                <div className="flex-1 overflow-y-auto">
                    {selectedDatabase ? (
                        <DatabaseDetail
                            database={selectedDatabase}
                            isConnected={isSelectedConnected}
                            tables={selectedDbStats.tables}
                            size={selectedDbStats.size}
                            onTest={() => handleTestConnection(selectedDatabase.id, selectedDatabase.name)}
                            onOpen={() => handleDatabaseClick(selectedDatabase.id)}
                            onDelete={() => openDeleteDialog(selectedDatabase.id, selectedDatabase.name)}
                        />
                    ) : (
                        <WelcomeView
                            databases={databases}
                            recentDatabases={recentDatabases}
                            status={status}
                            connectedCount={connectedCount}
                            totalTables={totalTables}
                            totalSize={totalSize}
                            welcomeMessage={welcomeMessage}
                            statsLoading={showStatsLoading}
                            onAddClick={() => handleDialogClose(true)}
                            onSelectDb={setSelectedDb}
                            onDatabaseClick={handleDatabaseClick}
                            onDatabaseHover={handleDatabaseHover}
                            onDiscoveredDatabaseAdd={handleDiscoveredDatabaseAdd}
                        />
                    )}
                </div>
            </main>

            {/* Dialogs */}
            <AddConnectionDialog
                open={isDialogOpen}
                onOpenChange={handleDialogClose}
                onSubmit={handleAddDatabase}
                isLoading={isAdding}
                initialData={prefilledConnectionData}
            />

            <DeleteDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                databaseName={dbToDelete?.name}
                onConfirm={handleDeleteDatabase}
            />
        </div>
    );
};

export default Index;