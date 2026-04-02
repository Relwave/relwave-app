// features/schema-explorer/components/tree/SchemaExtras.tsx

import { Hash, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SequenceInfo } from "../database/types";

// ---- Enum Types ----

interface EnumSectionProps {
    dbName: string;
    schemaName: string;
    enumTypes: { enum_name: string; enum_value: string }[];
    selectedItem: string | null;
    onSelect: (key: string) => void;
}

export const EnumSection = ({ dbName, schemaName, enumTypes, selectedItem, onSelect }: EnumSectionProps) => {
    const groupedEnums = Array.from(new Set(enumTypes.map((e) => e.enum_name)));

    return (
        <div className="mt-3 pt-2 border-t border-border">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 px-2">
                Enum Types
            </div>
            {groupedEnums.map((enumName) => {
                const values = enumTypes.filter((e) => e.enum_name === enumName).map((e) => e.enum_value);
                const key = `${dbName}:::${schemaName}:::enum:::${enumName}`;
                return (
                    <Tooltip key={enumName}>
                        <TooltipTrigger asChild>
                            <div
                                className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer text-xs
                                    hover:bg-accent transition-colors
                                    ${selectedItem === key ? "bg-accent/60" : ""}`}
                                onClick={() => onSelect(key)}
                            >
                                <List className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                                <span className="text-foreground">{enumName}</span>
                                <Badge variant="outline" className="ml-auto text-[9px]">{values.length}</Badge>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            <div className="text-xs">
                                <div className="font-semibold mb-1">Values:</div>
                                {values.map((v) => <div key={v} className="text-muted-foreground">• {v}</div>)}
                            </div>
                        </TooltipContent>
                    </Tooltip>
                );
            })}
        </div>
    );
};

// ---- Sequences ----

interface SequenceSectionProps {
    dbName: string;
    schemaName: string;
    sequences: SequenceInfo[];
    selectedItem: string | null;
    onSelect: (key: string) => void;
}

export const SequenceSection = ({ dbName, schemaName, sequences, selectedItem, onSelect }: SequenceSectionProps) => (
    <div className="mt-3 pt-2 border-t border-border">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 px-2">
            Sequences
        </div>
        {sequences.map((seq) => {
            const key = `${dbName}:::${schemaName}:::seq:::${seq.sequence_name}`;
            return (
                <Tooltip key={seq.sequence_name}>
                    <TooltipTrigger asChild>
                        <div
                            className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer text-xs
                                hover:bg-accent transition-colors
                                ${selectedItem === key ? "bg-accent/60" : ""}`}
                            onClick={() => onSelect(key)}
                        >
                            <Hash className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-foreground truncate">{seq.sequence_name}</span>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                        <div className="text-xs">
                            {seq.table_name && seq.column_name
                                ? <span>Used by: {seq.table_name}.{seq.column_name}</span>
                                : <span>Standalone sequence</span>
                            }
                        </div>
                    </TooltipContent>
                </Tooltip>
            );
        })}
    </div>
);