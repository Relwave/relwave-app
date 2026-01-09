import { Home, Database, Search, GitBranch, Settings, Layers, Terminal } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface VerticalIconBarProps {
    dbId?: string;
}

const globalNavigationItems = [
    { icon: Home, label: 'Dashboard', path: '/' },
    { icon: Settings, label: 'Settings', path: '/settings' },
];

export default function VerticalIconBar({ dbId }: VerticalIconBarProps) {
    const location = useLocation();

    const isActive = (path: string) => {
        if (path === '/') {
            return location.pathname === '/';
        }
        return location.pathname.includes(path);
    };




    // Database-specific navigation items (only shown when dbId is provided)
    const databaseNavigationItems = dbId ? [
        { icon: Terminal, label: 'SQL Workspace', path: `/database/${dbId}/sql-workspace` },
        { icon: Search, label: 'Query Builder', path: `/database/${dbId}/query-builder` },
        { icon: GitBranch, label: 'Schema Explorer', path: `/database/${dbId}/schema-explorer` },
        { icon: Database, label: 'ER Diagram', path: `/database/${dbId}/er-diagram` },
    ] : [];

    return (
        <nav className="fixed left-0 top-8 h-[calc(100vh-32px)] w-[60px] bg-background border-r border-border/20 z-40 flex flex-col items-center py-4 gap-2">
            {/* Logo/Brand */}
            <div className="mt-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Database className="h-5 w-5 text-primary" />
                </div>
            </div>

            {/* Global Navigation Icons */}
            <div className="flex flex-col gap-2">
                {globalNavigationItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);

                    return (
                        <Tooltip key={item.path}>
                            <TooltipTrigger asChild>
                                <Link to={item.path}>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`
                      w-10 h-10 rounded-lg transition-all
                      ${active
                                                ? 'bg-primary text-primary-foreground shadow-md'
                                                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                            }
                    `}
                                    >
                                        <Icon className="h-5 w-5" />
                                    </Button>
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p>{item.label}</p>
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>

            {/* Database-Specific Navigation (only shown when dbId is provided) */}
            {databaseNavigationItems.length > 0 && (
                <>
                    <div className="w-8 h-px bg-border/40 my-2" />
                    <div className="flex flex-col gap-2">
                        {databaseNavigationItems.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.path);

                            return (
                                <Tooltip key={item.path}>
                                    <TooltipTrigger asChild>
                                        <Link to={item.path}>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={`
                          w-10 h-10 rounded-lg transition-all
                          ${active
                                                        ? 'bg-primary text-primary-foreground shadow-md'
                                                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                                    }
                        `}
                                            >
                                                <Icon className="h-5 w-5" />
                                            </Button>
                                        </Link>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        <p>{item.label}</p>
                                    </TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </div>
                </>
            )}
        </nav>
    );
}
