import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { ArrowLeft, GitBranch, Layers, RefreshCw, Download, Settings, Server, Loader2 } from "lucide-react";
import { Spinner } from "../ui/spinner";

interface DatabasePageHeaderProps {
    dbId: string;
    databaseName: string;
    onRefresh: () => void;
    onBackup: () => void;
    loading?: boolean;
}

const DatabasePageHeader: React.FC<DatabasePageHeaderProps> = ({
    dbId,
    databaseName,
    onRefresh,
    onBackup,
    loading = false
}) => (
    <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between h-16">

            {/* Left Section: Back Button & Database Name/Status */}
            <div className="flex items-center gap-3">
                <Link to="/">
                    <Button
                        variant="ghost"
                        size="icon"
                        // Updated to use theme-consistent classes
                        className="text-muted-foreground hover:bg-accent transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>

                {/* Database Title Block */}
                <div className="flex items-center gap-2">
                    {/* Removed gradient, using solid cyan accent */}
                    <div className="p-2 bg-cyan-500 rounded-lg shadow-md">
                        <Server className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-semibold text-foreground">
                                {databaseName}
                            </h1>
                            {loading && (
                                <Spinner className="h-4 w-4 text-cyan-500 animate-spin" />
                            )}
                        </div>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full inline-flex items-center">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></span>
                            Connected
                        </span>
                    </div>
                </div>
            </div>

            {/* Right Section: Navigation Links & Actions */}
            <div className="flex items-center gap-4">

                {/* 1. Primary Navigation Links */}
                <nav className="hidden md:flex items-center space-x-2">
                    {[
                        { path: `/database/${dbId}/query-builder`, icon: GitBranch, label: "Data & Query" },
                        { path: `/database/${dbId}/schema-explorer`, icon: Layers, label: "Schema Explorer" },
                        { path: `/database/${dbId}/er-diagram`, icon: Settings, label: "ER Diagram" },
                    ].map(({ path, icon: Icon, label }) => (
                        <Link key={path} to={path}>
                            <Button
                                variant="ghost"
                                size="sm"
                                // Updated to use theme-consistent classes
                                className="text-muted-foreground hover:bg-accent transition-colors"
                                disabled={loading}
                            >
                                <Icon className="h-4 w-4 mr-2" />
                                {label}
                            </Button>
                        </Link>
                    ))}
                </nav>

                {/* Vertical Separator */}
                <div className="h-6 w-px bg-border hidden md:block" />

                {/* 2. Utility Actions */}
                <div className="flex items-center gap-2">
                    {/* Backup Button: Removed gradient, using solid cyan with accent shadow */}
                    <Button
                        size="sm"
                        onClick={onBackup}
                        disabled={loading}
                        className="bg-cyan-500 hover:bg-cyan-600 text-white transition-all shadow-md shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Backup
                    </Button>

                    {/* Refresh Button */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRefresh}
                        disabled={loading}
                        // Updated to use theme-consistent classes
                        className="border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>
        </div>
    </header>
);

export default DatabasePageHeader;