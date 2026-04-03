import { MigrationsData } from "@/features/database/types";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { migrationService } from "@/services/bridge/migration";
import { useState } from "react";

interface MigrationsPanelProps {
    migrations: MigrationsData;
    baselined: boolean;
    dbId: string;
}



export function useMigrationsPanel({ migrations, baselined, dbId }: MigrationsPanelProps) {
    const { local, applied } = migrations;
    const queryClient = useQueryClient();
    const [selectedMigration, setSelectedMigration] = useState<{ version: string; name: string } | null>(null);
    const [showSQLDialog, setShowSQLDialog] = useState(false);
    const [sqlContent, setSqlContent] = useState<{ up: string; down: string } | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["migrations", dbId] }),
                queryClient.invalidateQueries({ queryKey: ["tables", dbId] }),
                queryClient.invalidateQueries({ queryKey: ["schema", dbId] }),
                queryClient.invalidateQueries({ queryKey: ["schemaNames", dbId] }),
            ]);
            toast.success("Refreshed successfully");
        } finally {
            setIsRefreshing(false);
        }
    };

    // Merge and sort migrations
    const appliedVersions = new Set(applied.map((m) => m.version));

    const allMigrations = [
        ...applied.map((m) => ({
            version: m.version,
            name: m.name,
            status: "applied" as const,
            appliedAt: m.applied_at,
            checksum: m.checksum,
        })),
        ...local
            .filter((m) => !appliedVersions.has(m.version))
            .map((m) => ({
                version: m.version,
                name: m.name,
                status: "pending" as const,
            })),
    ].sort((a, b) => a.version.localeCompare(b.version));

    const handleApply = async (version: string, name: string) => {
        try {
            await migrationService.applyMigration(dbId, version);
            toast.success("Migration applied successfully", {
                description: `Applied migration: ${name}`,
            });
            // Invalidate migrations query to refresh
            queryClient.invalidateQueries({ queryKey: ["migrations", dbId] });
            queryClient.invalidateQueries({ queryKey: ["tables", dbId] });
            queryClient.invalidateQueries({ queryKey: ["schema", dbId] });
        } catch (error: any) {
            toast.error("Failed to apply migration", {
                description: error.message,
            });
        }
    };

    const handleRollback = async (version: string, name: string) => {
        try {
            await migrationService.rollbackMigration(dbId, version);
            toast.success("Migration rolled back successfully", {
                description: `Rolled back migration: ${name}`,
            });
            queryClient.invalidateQueries({ queryKey: ["migrations", dbId] });
            queryClient.invalidateQueries({ queryKey: ["tables", dbId] });
            queryClient.invalidateQueries({ queryKey: ["schema", dbId] });
        } catch (error: any) {
            toast.error("Failed to rollback migration", {
                description: error.message,
            });
        }
    };

    const handleDelete = async (version: string, name: string) => {
        try {
            await migrationService.deleteMigration(dbId, version);
            toast.success("Migration deleted successfully", {
                description: `Deleted migration: ${name}`,
            });
            queryClient.invalidateQueries({ queryKey: ["migrations", dbId] });
        } catch (error: any) {
            toast.error("Failed to delete migration", {
                description: error.message,
            });
        }
    };

    const handleViewSQL = async (version: string, name: string) => {
        try {
            const sql = await migrationService.getMigrationSQL(dbId, version);
            setSqlContent(sql);
            setSelectedMigration({ version, name });
            setShowSQLDialog(true);
        } catch (error: any) {
            toast.error("Failed to load migration SQL", {
                description: error.message,
            });
        }
    };

    return {
        allMigrations,
        baselined,
        selectedMigration,
        showSQLDialog,
        sqlContent,
        local,
        applied,
        isRefreshing,
        handleRefresh,
        handleApply,
        handleRollback,
        handleDelete,
        handleViewSQL,
        setShowSQLDialog,
    }
}