// features/home/hooks/useIndexPage.ts

import { useState, useCallback, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useDatabases, useAddDatabase, useDeleteDatabase, usePrefetch } from "@/features/project/hooks/useDbQueries";
import { projectKeys, useProjects } from "@/features/project/hooks/useProjectQueries";
import { ConnectionFormData, REQUIRED_FIELDS, SQLITE_REQUIRED_FIELDS } from "@/features/home/types";
import { useDatabaseStats } from "../../database/hooks/useDatabaseStats";
import { useSelectedDbStats } from "../../database/hooks/useSelectedDbStats";
import { databaseService } from "@/services/bridge/database";
import { projectService } from "@/services/bridge/project";
import { useDeleteConnection } from "./useDeleteConnection";
import { DatabaseConnection } from "@/features/database/types";
import { useWelcomeMessage } from "@/features/database/hooks/useWelcomeMessage";

export const useIndexPage = (bridgeReady: boolean) => {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();

    // ... existing logic ...

    useEffect(() => {
        if (location.state?.openAddConnection) {
            setIsDialogOpen(true);
            // Clear state so it doesn't reopen on every navigation
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, location.pathname]);

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
    const { prefetchTables, prefetchStats } = usePrefetch();

    // UI state
    const [searchQuery, setSearchQuery] = useState("");
    const [onlineFilter, setOnlineFilter] = useState(false);
    const [selectedDb, setSelectedDb] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [prefilledConnectionData, setPrefilledConnectionData] = useState<Partial<ConnectionFormData> | undefined>(undefined);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isDiscoveredMode, setIsDiscoveredMode] = useState(false);

    // Selected db derived state
    const selectedDatabase = useMemo(
        () => (selectedDb ? databases.find((db: DatabaseConnection) => db.id === selectedDb) ?? null : null),
        [databases, selectedDb]
    );
    const isSelectedConnected = selectedDb ? status.get(selectedDb) === "connected" : false;

    // Selected db stats
    const selectedDbStats = useSelectedDbStats(bridgeReady, selectedDb, isSelectedConnected);

    // Filtered + recent databases
    const filteredDatabases = useMemo(
        () =>
            databases.filter(
                (db: DatabaseConnection) => {
                    const matchesSearch = db.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          db.host.toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesOnline = onlineFilter ? status.get(db.id) === "connected" : true;
                    return matchesSearch && matchesOnline;
                }
            ),
        [databases, searchQuery, onlineFilter, status]
    );

    const recentDatabases = useMemo(
        () =>
            [...databases]
                .filter((db) => db.lastAccessedAt)
                .sort((a, b) => new Date(b.lastAccessedAt!).getTime() - new Date(a.lastAccessedAt!).getTime()),
        [databases]
    );

    // Projects list
    const { data: projects = [] } = useProjects();
    
    // Unlinked projects
    const unlinkedProjects = useMemo(
        () => projects.filter((p: any) => p.status === "unlinked" || !p.databaseId),
        [projects]
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

        // SSH Validation
        if (formData.useSsh) {
            const sshMissing = [];
            if (!formData.sshHost) sshMissing.push("SSH Host");
            if (!formData.sshPort) sshMissing.push("SSH Port");
            if (!formData.sshUser) sshMissing.push("SSH Username");
            if (formData.sshAuthMethod === "password" && !formData.sshPassword) sshMissing.push("SSH Password");
            if (formData.sshAuthMethod === "privateKey" && !formData.sshPrivateKeyPath) sshMissing.push("SSH Private Key Path");

            if (sshMissing.length) {
                toast.error("Missing SSH fields", { description: `Please fill in: ${sshMissing.join(", ")}` });
                return;
            }
        }

        try {
            // Strip flat SSH form fields — the bridge expects only the nested `ssh` object.
            // Sending them in the top-level payload would pollute the stored connection record.
            const {
                useSsh,
                sshHost, sshPort, sshUser, sshAuthMethod,
                sshPassword, sshPrivateKeyPath, sshPassphrase,
                ...rest
            } = formData;

            const payload: any = {
                ...rest,
                port: isSQLite ? 0 : parseInt(formData.port),
                sslmode: isSQLite ? "disable" : formData.ssl ? formData.sslmode || "require" : "disable",
            };

            if (useSsh) {
                // Only include the credential field that matches the selected auth method
                // to avoid storing unused secrets.
                const sshCredential = sshAuthMethod === "password"
                    ? { password: sshPassword }
                    : {
                        privateKey: sshPrivateKeyPath,
                        ...(sshPassphrase ? { passphrase: sshPassphrase } : {}),
                    };

                payload.ssh = {
                    host: sshHost,
                    port: parseInt(sshPort) || 22,
                    username: sshUser,
                    authMethod: sshAuthMethod,
                    ...sshCredential,
                };
            }

            const db = await addDatabaseMutation.mutateAsync(payload);

            // Auto-create a linked project so the user gets git, schema cache,
            // and saved queries for free — one click, two things.
            try {
                await projectService.createProject({
                    databaseId: db.id,
                    name: db.name,
                    defaultSchema: db.type === "postgresql" ? "public" : undefined,
                });
            } catch {
                // Non-fatal — project auto-creation shouldn't block the database add
                console.warn("Auto-project creation failed for", db.name);
            }

            toast.success("Database connection added");
            setIsDialogOpen(false);
            await Promise.all([refetchDatabases(), refetchStatus()]);
        } catch (err: any) {
            toast.error("Failed to add database", { description: err.message });
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
            setIsDiscoveredMode(true);
            setIsDialogOpen(true);
        },
        []
    );

    const handleDialogClose = (open: boolean) => {
        setIsDialogOpen(open);
        if (!open) {
            setPrefilledConnectionData(undefined);
            setIsDiscoveredMode(false);
        }
    };

    // ---- Delete Hook ----
    const { 
        initiateDelete, 
        dialogOpen: deleteDialogOpen, 
        setDialogOpen: setDeleteDialogOpen, 
        dialogProps: deleteConnectionDialogProps,
        isDeleting
    } = useDeleteConnection(() => {
        if (selectedDb) setSelectedDb(null);
        refetchDatabases();
    });

    const openDeleteDialog = (id: string, name: string) => {
        initiateDelete(id, name);
    };

    const handleImportComplete = async (_projectId: string, _projectName: string) => {
        setIsImportOpen(false);
        queryClient.invalidateQueries({ queryKey: projectKeys.all });
        await Promise.all([refetchDatabases(), refetchStatus()]);
    };

    return {
        // Data
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
        isAdding: addDatabaseMutation.isPending,

        // UI state
        searchQuery,
        setSearchQuery,
        onlineFilter,
        setOnlineFilter,
        selectedDb,
        setSelectedDb,
        isDialogOpen,
        setIsDialogOpen,
        deleteDialogOpen,
        setDeleteDialogOpen,
        deleteConnectionDialogProps,
        isDeleting,
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
    };
};