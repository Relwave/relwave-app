import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { ArrowLeft, BarChart3, Database, Download, GitBranch, Layers, RefreshCw } from "lucide-react";

interface DatabasePageHeaderProps {
    dbId: string;
    databaseName: string;
    onRefresh: () => void;
    onBackup: () => void;
}

const DatabasePageHeader: React.FC<DatabasePageHeaderProps> = ({ dbId, databaseName, onRefresh, onBackup }) => (
    <header className="border-b border-gray-200 dark:border-primary/10 bg-white/80 dark:bg-black/30 backdrop-blur-xl sticky top-0 z-50 shadow-md dark:shadow-lg">
        <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link to="/">
                        <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-linear-to-br from-cyan-500 to-violet-600 rounded-xl shadow-lg">
                            <Database className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-linear-to-r from-cyan-400 to-fuchsia-600">
                                Database: {databaseName}
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">PostgreSQL | Connected</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {[
                        { path: `/${dbId}/query-builder`, icon: GitBranch, label: "Builder" },
                        { path: `/${dbId}/er-diagram`, icon: BarChart3, label: "ER Diagram" },
                        { path: `/${dbId}/schema-explorer`, icon: Layers, label: "Schema Explorer" },
                    ].map(({ path, icon: Icon, label }) => (
                        <Link key={path} to={path}>
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
                            >
                                <Icon className="h-4 w-4 mr-2" />
                                {label}
                            </Button>
                        </Link>
                    ))}

                    <Button variant="outline" size="sm" onClick={onBackup} className="border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-white transition-colors">
                        <Download className="h-4 w-4 mr-2" />
                        Backup
                    </Button>
                    <Button variant="outline" size="sm" onClick={onRefresh} className="border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-white transition-colors">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>
        </div>
    </header>
);

export default DatabasePageHeader;