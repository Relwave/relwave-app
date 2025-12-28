import { FC } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  GitBranch,
  Layers,
  RefreshCw,
  Download,
  Settings,
  Database,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface DatabasePageHeaderProps {
  dbId: string;
  databaseName: string;
  onRefresh: () => void;
  onBackup: () => void;
  loading?: boolean;
}

const NAV_ITEMS = [
  { path: "query-builder", icon: GitBranch, label: "Query" },
  { path: "schema-explorer", icon: Layers, label: "Schema" },
  { path: "er-diagram", icon: Settings, label: "ER Diagram" },
] as const;

const DatabasePageHeader: FC<DatabasePageHeaderProps> = ({
  dbId,
  databaseName,
  onRefresh,
  onBackup,
  loading = false,
}) => {
  return (
    <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between h-14">
        {/* Left Section */}
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Database className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-medium text-foreground">{databaseName}</h1>
                {loading && <Spinner className="h-3.5 w-3.5 text-primary" />}
              </div>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Connected
              </span>
            </div>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ path, icon: Icon, label }) => (
              <Link key={path} to={`/database/${dbId}/${path}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground hover:text-foreground"
                  disabled={loading}
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {label}
                </Button>
              </Link>
            ))}
          </nav>

          <div className="h-6 w-px bg-border hidden md:block" />

          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={onBackup} disabled={loading} className="h-8">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Backup
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              className="h-8 w-8"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default DatabasePageHeader;
