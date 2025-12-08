import { ColumnDetails } from '@/services/bridgeApi';
import { Database } from 'lucide-react';
import React from 'react'


interface Column extends ColumnDetails {
    fkRef?: string; // e.g., "roles.id"
}


interface TableNodeData {
    label: string;
    columns: Column[];
}
const TableNode: React.FC<{ data: TableNodeData }> = ({ data }) => {
    return (
        <div
            // Use bg-card and border-primary/20 for themed look
            className="min-w-[200px] shadow-lg border-2 border-primary/20 rounded-lg bg-card"
        >
            {/* Header uses solid primary color */}
            <div className="dark:bg-secondary dark:text-white px-4 py-2 font-mono font-bold flex items-center gap-2 rounded-t-[6px]">
                <Database className="h-4 w-4" />
                {data.label}
            </div>
            {/* Divider uses border color */}
            <div className="divide-y divide-border bg-primary/10 dark:bg-card rounded-b-lg">
                {data.columns.map((col, idx) => (
                    <div
                        key={`${data.label}-${col.name}`}
                        id={`${data.label}-${col.name}`}
                        className="px-4 py-2 text-sm font-mono flex justify-between gap-4"
                    >
                        <span
                            className={col.isPrimaryKey
                                ? "text-primary font-semibold"
                                : "text-foreground"
                            }
                        >
                            {col.name}
                            {col.isPrimaryKey && " 🔑"}
                        </span>
                        <span className="text-muted-foreground">
                            {col.type}
                            {col.isForeignKey && " 🔗"}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TableNode