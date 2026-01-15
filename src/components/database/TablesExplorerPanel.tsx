import { useState } from 'react';
import { Search, Star, Table } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { SelectedTable, TableInfo } from '@/types/database';
import CreateTableDialog from '../schema-explorer/CreateTableDialog';

interface TablesExplorerPanelProps {
    dbId: string;
    tables: TableInfo[];
    selectedTable: SelectedTable | null;
    onSelectTable: (tableName: string, schemaName: string) => void;
    loading?: boolean;
}

export default function TablesExplorerPanel({
    dbId,
    tables,
    selectedTable,
    onSelectTable,
    loading = false,
}: TablesExplorerPanelProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [createTableOpen, setCreateTableOpen] = useState(false);

    const [favorites, setFavorites] = useState<Set<string>>(
        new Set(JSON.parse(localStorage.getItem('favoriteTables') || '[]'))
    );
    const [filter, setFilter] = useState<'all' | 'system' | 'favorites'>('all');

    const toggleFavorite = (tableName: string) => {
        const newFavorites = new Set(favorites);
        if (newFavorites.has(tableName)) {
            newFavorites.delete(tableName);
        } else {
            newFavorites.add(tableName);
        }
        setFavorites(newFavorites);
        localStorage.setItem('favoriteTables', JSON.stringify(Array.from(newFavorites)));
    };

    const filteredTables = tables.filter((table) => {
        const matchesSearch = table.name.toLowerCase().includes(searchQuery.toLowerCase());
        const isSystemTable = table.name.startsWith('pg_') || table.name.startsWith('information_');

        if (filter === 'system') return matchesSearch && isSystemTable;
        if (filter === 'favorites') return matchesSearch && favorites.has(table.name);
        return matchesSearch && !isSystemTable; // 'all' shows non-system tables
    });

    const isSelected = (table: TableInfo) => {
        return selectedTable?.name === table.name && selectedTable?.schema === table.schema;
    };

    return (
        <div className="h-full w-64 flex flex-col bg-background overflow-hidden">
            {/* Header */}
            <div className="p-3 border-b border-border/20 shrink-0">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Table className="h-4 w-4" />
                    Tables
                </h2>

                {/* Search */}
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search tables..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-sm"
                    />
                </div>

                {/* Filters */}
                <div className="flex gap-2">
                    <Button
                        variant={filter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter('all')}
                        className="flex-1 h-8 text-xs"
                    >
                        All
                    </Button>
                    <Button
                        variant={filter === 'system' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter('system')}
                        className="flex-1 h-8 text-xs"
                    >
                        System
                    </Button>
                    <Button
                        variant={filter === 'favorites' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter('favorites')}
                        className="h-8 text-xs px-3"
                    >
                        <Star className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Tables List */}
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {loading ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                            Loading tables...
                        </div>
                    ) : filteredTables.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                            No tables found
                        </div>
                    ) : (
                        filteredTables.map((table) => (
                            <button
                                key={`${table.schema}.${table.name}`}
                                onClick={() => onSelectTable(table.name, table.schema)}
                                className={`
                  w-full flex items-center justify-between px-3 py-2 rounded-lg
                  transition-colors text-left group
                  ${isSelected(table)
                                        ? 'bg-primary/10 text-primary'
                                        : 'hover:bg-muted/50 text-foreground'
                                    }
                `}
                            >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleFavorite(table.name);
                                        }}
                                        className="shrink-0"
                                    >
                                        <Star
                                            className={`h-3.5 w-3.5 ${favorites.has(table.name)
                                                ? 'fill-yellow-500 text-yellow-500'
                                                : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                                                }`}
                                        />
                                    </button>
                                    <span className="text-sm font-medium truncate font-mono">{table.name}</span>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-border/20">
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setCreateTableOpen(true)}>
                    + Create Table
                </Button>
                <CreateTableDialog
                    dbId={dbId}
                    open={createTableOpen}
                    onOpenChange={setCreateTableOpen}
                    schemaName={selectedTable?.schema || ''}
                />
            </div>
        </div>
    );
}
