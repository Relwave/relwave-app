import { Link } from "react-router-dom";
import { Database, Table2, HardDrive, Activity, Trash2, TestTube, MoreVertical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useEffect, useState } from "react";
import { bridgeApi } from "@/services/bridgeApi";

interface DatabaseCardProps {
  id: string;
  name: string;
  type: string;
  status: "connected" | "disconnected";
  host: string;
  onDelete?: () => void;
  onTest?: () => void;
}

// Type for database stats
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
  onTest
}: DatabaseCardProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // Initial state should reflect null or undefined to correctly check if data has loaded
  const [result, setResult] = useState<DatabaseStats | null>(null);

  // Dynamic colors based on status
  const isConnected = status === "connected";
  // Used standard utility classes for the badge colors
  const statusColorClass = isConnected
    ? "bg-emerald-600/20 text-emerald-600 border-emerald-500/50 dark:text-emerald-300"
    : "bg-red-600/20 text-red-600 border-red-500/50 dark:text-red-300";

  // Use the Cyan accent color for connected state, Red for disconnected
  const iconColor = isConnected ? "text-cyan-600 dark:text-cyan-400" : "text-red-600 dark:text-red-400";
  // Use the accent color for the prominent hover border effect
  const hoverGlow = isConnected ? "hover:border-cyan-500/80" : "hover:border-red-500/80";

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
        // Ensure the response matches the expected shape before setting state
        if (res && typeof res === "object" && "stats" in res && "db" in res) {
          setResult(res as DatabaseStats);
        } else {
          console.warn("Unexpected database stats response:", res);
          setResult(null);
        }
      } catch (error) {
        console.log("Failed to load stats:", error);
      }
    }
    loadStats();
  }, [id])

  return (
    <>
      {/* Card Styling:
        - shadow-elevated: Consistent shadow from QueryBuilder
        - bg-card/70: Slightly translucent background for depth
        - border-border: Standard border color, accented by ${hoverGlow}
        - group hover:bg-card/90: Subtle hover state 
      */}
      <Card className={`shadow-elevated bg-card/70 border border-border rounded-xl transition-all duration-300 cursor-pointer h-full group ${hoverGlow} hover:bg-card/90 relative`}>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-start justify-between">
            {/* Database Info - Clickable Link */}
            <Link to={`/${id}`} className="flex items-center gap-3 min-w-0 flex-1 pr-1">
              <div
                // Icon BG uses the accent color for connection status
                className={`p-3 rounded-xl transition-colors shrink-0 
                ${isConnected ? "bg-cyan-600/10 dark:bg-cyan-600/30" : "bg-red-600/10 dark:bg-red-600/30"}`}
              >
                <Database className={`h-6 w-6 ${iconColor}`} />
              </div>

              <div className="truncate min-w-0 flex-1">
                <CardTitle
                  // Title text: Standard foreground color, shifts to Cyan on hover (accent)
                  className="text-xl mb-1 text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors truncate"
                >
                  {name}
                </CardTitle>
                <CardDescription
                  // Description text: Muted foreground color
                  className="font-mono text-xs text-muted-foreground truncate"
                >
                  {
                    host.length > 30 && host != 'localhost' ? `${host.slice(0, 15)}...${host.slice(-15)}` : host
                  }
                </CardDescription>
              </div>
            </Link>

            {/* Actions Menu and Badge */}
            <div className="flex items-center gap-1 shrink-0 ml-1">
              <Badge
                variant="outline"
                className={`hidden sm:flex items-center gap-1 font-semibold uppercase px-3 py-1 ${statusColorClass}`}
              >
                <Activity className={`h-3 w-3 mr-1 ${isConnected ? "animate-pulse" : ""}`} />
                {status}
              </Badge>

              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    // Menu Button: Uses standard muted/accent color hover
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  // Dropdown Content: Uses standard popover styles
                  className="bg-popover border-border text-foreground shadow-lg"
                >
                  <DropdownMenuItem
                    onClick={handleTest}
                    className="cursor-pointer hover:bg-accent focus:bg-accent"
                  >
                    <TestTube className="h-4 w-4 mr-2 text-cyan-600 dark:text-cyan-400" />
                    Test Connection
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem
                    onClick={handleDelete}
                    // Delete Item: Uses destructive color
                    className="cursor-pointer text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Connection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <Link to={`/${id}`}>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="space-y-4 pt-2">

              {/* Database Type */}
              <div
                className="flex items-center justify-between text-sm border-b border-border pb-2"
              >
                <span className="text-muted-foreground">Database Engine</span>
                <span
                  // Badge: Standard subtle background
                  className="font-mono font-medium text-foreground px-2 py-0.5 rounded-md bg-accent truncate max-w-[50%]"
                >
                  {type}
                </span>
              </div>

              {/* Tables Count */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2 shrink-0">
                  <Table2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Total Tables
                </span>
                <span className="font-mono font-medium text-lg text-foreground">
                  <span className="text-right inline-block">
                    {id === result?.db?.id ? parseInt(result.stats.total_tables) : 0}
                  </span>
                </span>
              </div>

              {/* Size */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2 shrink-0">
                  <HardDrive className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Storage Used
                </span>
                <span className="font-mono font-medium text-lg text-foreground">
                  <span className="text-right inline-block">
                    {id === result?.db?.id ? `${parseFloat(result.stats.total_db_size_mb).toFixed(2)} MB` : "0.00 MB"}
                  </span>
                </span>
              </div>

            </div>
          </CardContent>
        </Link>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-background border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-foreground">
              Delete Database Connection?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete <span className="font-semibold text-foreground">{name}</span>?
              This action cannot be undone. The connection configuration will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-accent border-border text-foreground hover:bg-muted"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};