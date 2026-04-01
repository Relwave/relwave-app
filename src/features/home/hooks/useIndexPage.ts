// features/home/hooks/useIndexPage.ts

import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useDatabases, useAddDatabase, useDeleteDatabase, usePrefetch } from "@/features/project/hooks/useDbQueries";
import { ConnectionFormData, REQUIRED_FIELDS, SQLITE_REQUIRED_FIELDS } from "@/features/home/types";
import { useDatabaseStats } from "../../database/hooks/useDatabaseStats";
import { useSelectedDbStats } from "../../database/hooks/useSelectedDbStats";
import { databaseService } from "@/services/bridge/database";
import { DatabaseConnection } from "@/features/database/types";

export const useIndexPage = (bridgeReady: boolean) => {
    const navigate = useNavigate();

    // Database list
    const { data: databases = [], isLoading: loading, refetch: refetchDatabases } = useDatabases();

    // All stats + connection status
    const {
        status,
        totalSize,
        totalTables,
        connectedCount,
        showStatsLoading,
        refetchStatus,
    } = useDatabaseStats(bridgeReady, databases.length > 0);

    // Mutations
    const addDatabaseMutation = useAddDatabase();
    const deleteDatabaseMutation = useDeleteDatabase();
    const { prefetchTables, prefetchStats } = usePrefetch();

    // UI state
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDb, setSelectedDb] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [dbToDelete, setDbToDelete] = useState<{ id: string; name: string } | null>(null);
    const [prefilledConnectionData, setPrefilledConnectionData] = useState<Partial<ConnectionFormData> | undefined>(undefined);

    // Selected db derived state
    const selectedDatabase = useMemo(
        () => (selectedDb ? databases.find((db:DatabaseConnection) => db.id === selectedDb) ?? null : null),
        [databases, selectedDb]
    );
    const isSelectedConnected = selectedDb ? status.get(selectedDb) === "connected" : false;

    // Selected db stats
    const selectedDbStats = useSelectedDbStats(bridgeReady, selectedDb, isSelectedConnected);

    // Filtered + recent databases
    const filteredDatabases = useMemo(
        () =>
            databases.filter(
                (db:DatabaseConnection) =>
                    db.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    db.host.toLowerCase().includes(searchQuery.toLowerCase())
            ),
        [databases, searchQuery]
    );

    const recentDatabases = useMemo(
        () =>
            [...databases]
                .filter((db) => db.lastAccessedAt)
                .sort((a, b) => new Date(b.lastAccessedAt!).getTime() - new Date(a.lastAccessedAt!).getTime())
                .slice(0, 5),
        [databases]
    );

    // ---- Bridge Handlers ----

    const handleAddDatabase = async (formData: ConnectionFormData) => {
        const isSQLite = formData.type === "sqlite";
        const requiredFields = isSQLite ? SQLITE_REQUIRED_FIELDS : REQUIRED_FIELDS;
        const missing = requiredFields.filter((field) => !formData[field as keyof typeof formData]);

        if (missing.length) {
            toast.error("Missing required fields", { description: `Please fill in: ${missing.join(", ")}` });
            return;
        }

        try {
            const payload = {
                ...formData,
                port: isSQLite ? 0 : parseInt(formData.port),
                sslmode: isSQLite ? "disable" : formData.ssl ? formData.sslmode || "require" : "disable",
            };
            await addDatabaseMutation.mutateAsync(payload);
            toast.success("Database connection added");
            setIsDialogOpen(false);
            await Promise.all([refetchDatabases(), refetchStatus()]);
        } catch (err: any) {
            toast.error("Failed to add database", { description: err.message });
        }
    };

    const handleDeleteDatabase = async () => {
        if (!dbToDelete) return;
        try {
            await deleteDatabaseMutation.mutateAsync(dbToDelete.id);
            toast.success("Database removed");
            setDeleteDialogOpen(false);
            setDbToDelete(null);
            if (selectedDb === dbToDelete.id) setSelectedDb(null);
            refetchDatabases();
        } catch (err: any) {
            toast.error("Failed to delete", { description: err.message });
        }
    };

    const handleTestConnection = async (id: string, name: string) => {
        try {
            const result = await databaseService.testConnection(id);
            if (result.ok) {
                toast.success("Connected", { description: name });
                refetchStatus();
            } else {
                toast.error("Failed", { description: result.message || "Could not connect" });
            }
        } catch (err: any) {
            toast.error("Failed", { description: err.message });
        }
    };

    // ---- Navigation Handlers ----

    const handleDatabaseClick = (dbId: string) => {
        databaseService.touchDatabase(dbId);
        navigate(`/${dbId}`);
    };

    const handleDatabaseHover = (dbId: string) => {
        prefetchTables(dbId);
        prefetchStats(dbId);
    };

    // ---- Dialog Helpers ----

    const openDeleteDialog = (id: string, name: string) => {
        setDbToDelete({ id, name });
        setDeleteDialogOpen(true);
    };

    const handleDiscoveredDatabaseAdd = useCallback(
        (db: {
            type: string;
            host: string;
            port: number;
            suggestedName: string;
            defaultUser: string;
            defaultDatabase: string;
            defaultPassword?: string;
        }) => {
            setPrefilledConnectionData({
                name: db.suggestedName,
                type: db.type,
                host: db.host,
                port: String(db.port),
                user: db.defaultUser,
                database: db.defaultDatabase,
                password: db.defaultPassword || "",
                ssl: false,
                sslmode: "",
            });
            setIsDialogOpen(true);
        },
        []
    );

    const handleDialogClose = (open: boolean) => {
        setIsDialogOpen(open);
        if (!open) setPrefilledConnectionData(undefined);
    };

    return {
        // Data
        databases,
        filteredDatabases,
        recentDatabases,
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
        isAdding: addDatabaseMutation.isPending,

        // UI state
        searchQuery,
        setSearchQuery,
        selectedDb,
        setSelectedDb,
        isDialogOpen,
        setIsDialogOpen,
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
    };
};