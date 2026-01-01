import { Link } from "react-router-dom";
import { Database, Table2, HardDrive, Trash2, TestTube, MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEffect, useState, useMemo } from "react";
import { bridgeApi } from "@/services/bridgeApi";

interface DatabaseCardProps {
  id: string;
  name: string;
  type: string;
  status: Map<string, string> | [string, string][] | string;
  host: string;
  onDelete?: () => void;
  onTest?: () => void;
  onHover?: (dbId: string) => void;
}

interface DatabaseStats {
  stats: {
    total_tables: string;
    total_db_size: string;
    total_db_size_mb: string;
  },
  db: {
    id: string;
    name: string;
    port: number;
    host: string;
    type: string;
    ssl?: boolean;
    created_at: string;
    updated_at: string;
    user: string;
    sslmode?: string;
    database: string;
    tags?: string[];
    credentialId?: string;
  }
}

export const DatabaseCard = ({
  id,
  name,
  type,
  status,
  host,
  onDelete,
  onTest,
  onHover
}: DatabaseCardProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [result, setResult] = useState<DatabaseStats | null>(null);

  const currentStatus = useMemo(() => {
    if (typeof status === "string") return status;
    if (status instanceof Map) return status.get(id) || "disconnected";
    if (Array.isArray(status)) {
      const entry = status.find(([dbId]) => dbId === id);
      return entry ? entry[1] : "disconnected";
    }
    return "disconnected";
  }, [status, id]);

  const isConnected = currentStatus === "connected";

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleTest = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTest?.();
  };

  const confirmDelete = () => {
    setShowDeleteDialog(false);
    onDelete?.();
  };

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await bridgeApi.getDatabaseStats(id);
        if (res && typeof res === "object" && "stats" in res && "db" in res) {
          setResult(res as DatabaseStats);
        } else {
          setResult(null);
        }
      } catch (error) {
        console.error("Failed to load stats for", id, error);
      }
    }
    loadStats();
  }, [id]);

  return (
    <>
      <Link
        to={`/${id}`}
        className="block group"
        onMouseEnter={() => onHover?.(id)}
      >
        <div className="border border-border/20 rounded-lg bg-background hover:border-border/40 transition-colors p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Database className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium truncate text-foreground">
                  {name}
                </h3>
                <p className="text-xs font-mono text-muted-foreground/70 truncate">
                  {host.length > 25 ? `${host.slice(0, 12)}...${host.slice(-10)}` : host}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Badge
                variant={isConnected ? "default" : "secondary"}
                className={`text-[11px] px-2 py-0.5 ${isConnected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-muted/50 text-muted-foreground/70 border-border/30'}`}
              >
                <span className={`w-1 h-1 rounded-full mr-1.5 ${isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
                {isConnected ? 'Online' : 'Offline'}
              </Badge>

              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={handleTest} className="cursor-pointer text-sm">
                    <TestTube className="h-3.5 w-3.5 mr-2" />
                    Test
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDelete} className="cursor-pointer text-sm text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-2 pt-3 border-t border-border/20">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground/70">Engine</span>
              <span className="font-mono text-foreground">{type}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground/70 flex items-center gap-1.5">
                <Table2 className="h-3 w-3" />
                Tables
              </span>
              <span className="font-mono text-foreground">
                {result ? parseInt(result.stats.total_tables).toLocaleString() : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground/70 flex items-center gap-1.5">
                <HardDrive className="h-3 w-3" />
                Size
              </span>
              <span className="font-mono text-foreground">
                {result ? `${parseFloat(result.stats.total_db_size_mb).toFixed(1)} MB` : '—'}
              </span>
            </div>
          </div>
        </div>
      </Link>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-medium text-foreground">{name}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};