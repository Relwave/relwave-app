import { useState } from "react";
import { SelectedTable, TableInfo } from "../types";


interface TablesExplorerPanelProps {
    dbId: string;
    tables: TableInfo[];
    selectedTable: SelectedTable | null;
    selectedSchema: string;
    onSelectTable: (tableName: string, schemaName: string) => void;
    loading?: boolean;
}

export function useTableExplorerPanel({
    tables,
    selectedTable,
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

    return {
        searchQuery,
        setSearchQuery,
        createTableOpen,
        setCreateTableOpen,
        favorites,
        setFavorites,
        filter,
        setFilter,
        toggleFavorite,
        filteredTables,
        isSelected
    };
}