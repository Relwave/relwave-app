import { FC } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  GitBranch,
  Layers,
  RefreshCw,
  Download,
  Settings,
  Database,
  FileSpreadsheet,
  FileJson,
  ChevronDown,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ExportFormat } from "@/lib/dataExport";

interface DatabasePageHeaderProps {
  dbId: string;
  databaseName: string;
  onRefresh: () => void;
  onExport: (format: ExportFormat) => void;
  loading?: boolean;
  exportLoading?: boolean;
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
  onExport,
  loading = false,
  exportLoading = false,
}) => {
  return (
    <header className="border-b border-border/20 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between h-14">
        {/* Left Section */}
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </Link>

          <div className="flex items-center gap-2.5">
            <Database className="h-4 w-4 text-muted-foreground/60" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-medium text-foreground">{databaseName}</h1>
                {loading && <Spinner className="h-3 w-3 text-muted-foreground/60" />}
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                Connected
              </span>
            </div>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map(({ path, icon: Icon, label }) => (
              <Link key={path} to={`/database/${dbId}/${path}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground/70 hover:text-foreground"
                  disabled={loading}
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {label}
                </Button>
              </Link>
            ))}
          </nav>

          <div className="h-5 w-px bg-border/30 hidden md:block" />

          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={loading || exportLoading} className="h-8 text-xs">
                  {exportLoading ? (
                    <>
                      <Spinner className="h-3.5 w-3.5 mr-1.5" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Export
                      <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onExport("csv")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport("json")}>
                  <FileJson className="h-4 w-4 mr-2" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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
