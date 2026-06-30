// pages/Index.tsx

import { useBridgeQuery } from "@/services/bridge/useBridgeQuery";
import {
    ConnectionList,
    DatabasePreview,
    WelcomeView,
    AddConnectionDialog,
    DeleteConnectionDialog,
} from "@/features/home/components";
import { ImportProjectDialog } from "@/features/project/components";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import BridgeFailed from "@/components/feedback/BridgeFailed";
import { useIndexPage } from "@/features/home/hooks/useIndexPage";
import { ShortcutsHelp } from "@/components/shared/ShortcutsHelp";
import { ShortcutsTrigger } from "@/components/shared/ShortcutsTrigger";
import { useState } from "react";

const Index = () => {
    const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    // Bridge guard — only logic allowed in page
    if (bridgeLoading || bridgeReady === undefined) return <BridgeLoader />;
    if (!bridgeReady) return <BridgeFailed />;

    return (
        <>
            <IndexContent bridgeReady={bridgeReady} onShortcutsClick={() => setShortcutsOpen(true)} />
            <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        </>
    );
};

// Separated so hooks only run after bridge is ready
const IndexContent = ({ bridgeReady, onShortcutsClick }: { bridgeReady: boolean, onShortcutsClick: () => void }) => {
    const {
        databases,
        filteredDatabases,
        recentDatabases,
        unlinkedProjects,
        selectedDatabase,
        selectedDbStats,
        loading,

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
        onlineFilter,
        setOnlineFilter,
        selectedDb,
        setSelectedDb,
        isDialogOpen,
        deleteDialogOpen,
        setDeleteDialogOpen,
        deleteConnectionDialogProps,
        prefilledConnectionData,
        isDiscoveredMode,

        // Handlers
        handleAddDatabase,
        handleTestConnection,
        handleDatabaseClick,
        handleDatabaseHover,
        handleDiscoveredDatabaseAdd,
        handleDialogClose,
        openDeleteDialog,

        // Import
        isImportOpen,
        setIsImportOpen,
        handleImportComplete,
    } = useIndexPage(bridgeReady);

    return (
        <div className="h-[calc(100vh-32px)] flex flex-col app-surface text-foreground overflow-hidden">
            <div className="flex-1 flex overflow-hidden">
                <main className="flex-1 flex overflow-hidden">
                    {/* Left Panel */}
                    <ConnectionList
                        databases={databases}
                        filteredDatabases={filteredDatabases}
                        unlinkedProjects={unlinkedProjects}
                        loading={loading}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        onlineFilter={onlineFilter}
                        setOnlineFilter={setOnlineFilter}
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
                        onImportClick={() => setIsImportOpen(true)}
                    />

                    {/* Right Panel */}
                    <div className="flex-1 overflow-y-auto">
                        {selectedDatabase ? (
                            <DatabasePreview
                                database={selectedDatabase}
                                isConnected={isSelectedConnected}
                                tables={selectedDbStats.tables}
                                size={selectedDbStats.size}
                                onTest={() => handleTestConnection(selectedDatabase.id, selectedDatabase.name)}
                                onOpen={() => handleDatabaseClick(selectedDatabase.id)}
                                onDelete={() => openDeleteDialog(selectedDatabase.id, selectedDatabase.name)}
                                onBack={() => setSelectedDb(null)}
                            />
                        ) : (
                            <WelcomeView
                                databases={databases}
                                recentDatabases={recentDatabases}
                                status={status}
                                connectedCount={connectedCount}
                                totalTables={totalTables}
                                totalSize={totalSize}
                                statsLoading={showStatsLoading}
                                onAddClick={() => handleDialogClose(true)}
                                onSelectDb={setSelectedDb}
                                onDatabaseHover={handleDatabaseHover}
                                onDiscoveredDatabaseAdd={handleDiscoveredDatabaseAdd}
                                onOnlineFilterClick={() => setOnlineFilter(true)}
                            />
                        )}
                    </div>
                </main>
            </div>

            {/* Status bar */}
            <div className="shrink-0 h-7 border-t border-border/30 bg-background/80 backdrop-blur-xl flex items-center px-2 pl-15 gap-4 min-w-0">
                <div className="flex-1" />
                <ShortcutsTrigger onClick={onShortcutsClick} />
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                    Dashboard
                </span>
            </div>

            {/* Dialogs */}
            <AddConnectionDialog
                open={isDialogOpen}
                onOpenChange={handleDialogClose}
                onSubmit={handleAddDatabase}
                isLoading={isAdding}
                initialData={prefilledConnectionData}
                isDiscoveredMode={isDiscoveredMode}
            />

            {deleteConnectionDialogProps && (
                <DeleteConnectionDialog
                    open={deleteDialogOpen}
                    onOpenChange={setDeleteDialogOpen}
                    {...deleteConnectionDialogProps}
                />
            )}

            <ImportProjectDialog
                open={isImportOpen}
                onOpenChange={setIsImportOpen}
                onComplete={handleImportComplete}
            />
        </div>
    );
};

export default Index;
