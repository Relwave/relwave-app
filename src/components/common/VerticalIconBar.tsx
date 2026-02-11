import { Home, Database, Search, GitBranch, GitCompareArrows, History, Settings, Layers, Terminal, FolderOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

export type PanelType = 'data' | 'sql-workspace' | 'query-builder' | 'schema-explorer' | 'er-diagram' | 'schema-diff' | 'migration-timeline';

interface VerticalIconBarProps {
    dbId?: string;
    activePanel?: PanelType;
    onPanelChange?: (panel: PanelType) => void;
}

const globalNavigationItems = [
    { icon: Home, label: 'Dashboard', path: '/' },
    { icon: FolderOpen, label: 'Projects', path: '/projects' },
    { icon: Settings, label: 'Settings', path: '/settings' },
];

export default function VerticalIconBar({ dbId, activePanel, onPanelChange }: VerticalIconBarProps) {
    const location = useLocation();

    const isGlobalActive = (path: string) => {
        if (path === '/') {
            return location.pathname === '/';
        }
        return location.pathname.includes(path);
    };

    // Database-specific panel items (only shown when dbId is provided)
    const databasePanelItems: Array<{ icon: typeof Terminal; label: string; panel: PanelType }> = dbId ? [
        { icon: Layers, label: 'Data View', panel: 'data' },
        { icon: Terminal, label: 'SQL Workspace', panel: 'sql-workspace' },
        { icon: Search, label: 'Query Builder', panel: 'query-builder' },
        { icon: GitBranch, label: 'Schema Explorer', panel: 'schema-explorer' },
        { icon: Database, label: 'ER Diagram', panel: 'er-diagram' },
        { icon: GitCompareArrows, label: 'Schema Diff', panel: 'schema-diff' },
        { icon: History, label: 'Migration Timeline', panel: 'migration-timeline' },
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
                    const active = isGlobalActive(item.path);

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

            {/* Database-Specific Panel Items (state-based, no navigation) */}
            {databasePanelItems.length > 0 && (
                <>
                    <div className="w-8 h-px bg-border/40 my-2" />
                    <div className="flex flex-col gap-2">
                        {databasePanelItems.map((item) => {
                            const Icon = item.icon;
                            const active = activePanel === item.panel;

                            return (
                                <Tooltip key={item.panel}>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onPanelChange?.(item.panel)}
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
