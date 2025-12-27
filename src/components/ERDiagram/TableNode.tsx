import { ColumnDetails } from '@/types/database';
import { Table2 } from 'lucide-react';
import React from 'react'


interface Column extends ColumnDetails {
    fkRef?: string;
}


interface TableNodeData {
    label: string;
    columns: Column[];
}

const TableNode: React.FC<{ data: TableNodeData }> = ({ data }) => {
    return (
        <div className="min-w-[180px] shadow-sm border border-border rounded-md bg-card">
            <div className="bg-muted px-3 py-2 font-mono text-sm font-medium flex items-center gap-2 rounded-t-md border-b border-border">
                <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                {data.label}
            </div>
            <div className="divide-y divide-border">
                {data.columns.map((col) => (
                    <div
                        key={`${data.label}-${col.name}`}
                        id={`${data.label}-${col.name}`}
                        className="px-3 py-1.5 text-xs font-mono flex justify-between gap-3"
                    >
                        <span className={col.isPrimaryKey ? "text-primary font-medium" : "text-foreground"}>
                            {col.name}
                            {col.isPrimaryKey && " 🔑"}
                        </span>
                        <span className="text-muted-foreground">
                            {col.type}
                            {col.isForeignKey && " →"}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TableNode