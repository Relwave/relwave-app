import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { ArrowLeft, GitBranch, Layers, RefreshCw, Download, Settings, Server } from "lucide-react";

interface DatabasePageHeaderProps {
    dbId: string;
    databaseName: string;
    onRefresh: () => void;
    onBackup: () => void;
}

const DatabasePageHeader: React.FC<DatabasePageHeaderProps> = ({ dbId, databaseName, onRefresh, onBackup }) => (
    <header className="border-b border-gray-200 dark:border-primary/10 bg-white/80 dark:bg-black/40 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between h-16">

            {/* Left Section: Back Button & Database Name/Status */}
            <div className="flex items-center gap-3">
                <Link to="/">
                    {/* Highlighting the Back button slightly less */}
                    <Button variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>

                {/* Database Title Block */}
                <div className="flex items-center gap-2">
                    <Server className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                    <div>
                        {/* Title is simpler, relying on surrounding design for impact */}
                        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            {databaseName}
                        </h1>
                        {/* Sub-title/Status uses a subtle pill for better look */}
                        <span className="text-xs font-medium text-green-700 dark:text-green-400 bg-green-100/50 dark:bg-green-900/40 px-2 py-0.5 rounded-full inline-flex items-center">
                            PostgreSQL | Connected
                        </span>

                    </div>
                </div>
            </div>

            {/* Right Section: Navigation Links & Actions */}
            <div className="flex items-center gap-4">

                {/* 1. Primary Navigation Links (Look like header tabs) */}
                <nav className="hidden md:flex items-center space-x-2">
                    {[
                        // Assuming you want the main page to be /data or the default route
                        { path: `/${dbId}/query-builder`, icon: GitBranch, label: "Data & Query" }, // This should link to the main DatabaseDetail page
                        { path: `/${dbId}/schema-explorer`, icon: Layers, label: "Schema Explorer" },
                        { path: `/${dbId}/er-diagram`, icon: Settings, label: "ER Diagram" }, // Changed 'Builder' to 'Monitoring' for utility look
                    ].map(({ path, icon: Icon, label }) => (
                        <Link key={path} to={path}>
                            <Button
                                variant="ghost" // Use ghost for clean navigation
                                size="sm"
                                className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <Icon className="h-4 w-4 mr-2" />
                                {label}
                            </Button>
                        </Link>
                    ))}
                </nav>

                {/* Vertical Separator */}
                <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 hidden md:block" />

                {/* 2. Utility Actions (Grouped and clean) */}
                <div className="flex items-center gap-2">
                    {/* Backup: Primary action, slightly more emphasis */}
                    <Button
                        size="sm"
                        onClick={onBackup}
                        className="bg-cyan-500 hover:bg-cyan-600 dark:bg-cyan-600 dark:hover:bg-cyan-700 text-white transition-colors"
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Backup
                    </Button>

                    {/* Refresh: Secondary utility action */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRefresh}
                        className="border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    </header>
);

export default DatabasePageHeader;



//  { path: `/${dbId}/query-builder`, icon: GitBranch, label: "Builder" },
//                         { path: `/${dbId}/er-diagram`, icon: BarChart3, label: "ER Diagram" },
//                         { path: `/${dbId}/schema-explorer`, icon: Layers, label: "Schema Explorer" },