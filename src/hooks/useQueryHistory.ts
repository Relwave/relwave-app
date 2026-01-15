import { useState, useEffect } from 'react';

interface QueryHistoryItem {
    sql: string;
    timestamp: number;
    tables: string[];
}

const MAX_HISTORY = 10;

export const useQueryHistory = (dbId: string) => {
    const storageKey = `query-builder-history-${dbId}`;

    const [history, setHistory] = useState<QueryHistoryItem[]>(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    // Save to localStorage whenever history changes
    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(history));
        } catch (error) {
            console.error('Failed to save query history:', error);
        }
    }, [history, storageKey]);

    const addQuery = (sql: string, tables: string[]) => {
        const newEntry: QueryHistoryItem = {
            sql,
            timestamp: Date.now(),
            tables
        };

        setHistory(prev => {
            // Remove duplicate if exists
            const filtered = prev.filter(item => item.sql !== sql);
            // Add to beginning and limit to MAX_HISTORY
            return [newEntry, ...filtered].slice(0, MAX_HISTORY);
        });
    };

    const removeQuery = (timestamp: number) => {
        setHistory(prev => prev.filter(item => item.timestamp !== timestamp));
    };

    const clearHistory = () => {
        setHistory([]);
    };

    return {
        history,
        addQuery,
        removeQuery,
        clearHistory
    };
};
