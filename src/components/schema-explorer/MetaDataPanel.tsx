import { ScrollArea } from "@/components/ui/scroll-area";
import { DatabaseSchema } from "./types";
import {
    DatabaseDetails,
    SchemaDetails,
    TableDetails,
    ColumnDetails,
    EnumDetails,
    SequenceDetails,
} from "./metadata";

interface MetaDataPanelProps {
    selectedItem: string | null;
    database: DatabaseSchema | null;
}

const MetaDataPanel = ({ selectedItem, database }: MetaDataPanelProps) => {
    const renderSelectedDetails = () => {
        if (!selectedItem || !database) {
            return (
                <div className="text-center text-muted-foreground py-12">
                    Select an item from the tree to view details
                </div>
            );
        }

        const pathParts = selectedItem.split(".");

        // === DATABASE ===
        if (pathParts.length === 1) {
            return <DatabaseDetails database={database} />;
        }

        // === SCHEMA ===
        if (pathParts.length === 2) {
            const schema = database.schemas.find((s) => s.name === pathParts[1]);
            if (!schema) return null;
            return <SchemaDetails schema={schema} />;
        }

        // === ENUM TYPE ===
        if (pathParts.length === 4 && pathParts[2] === "enum") {
            const schema = database.schemas.find((s) => s.name === pathParts[1]);
            if (!schema) return null;
            return <EnumDetails enumName={pathParts[3]} schema={schema} />;
        }

        // === SEQUENCE ===
        if (pathParts.length === 4 && pathParts[2] === "seq") {
            const schema = database.schemas.find((s) => s.name === pathParts[1]);
            if (!schema) return null;
            return <SequenceDetails sequenceName={pathParts[3]} schema={schema} />;
        }

        // === TABLE ===
        if (pathParts.length === 3) {
            const schema = database.schemas.find((s) => s.name === pathParts[1]);
            const table = schema?.tables.find((t) => t.name === pathParts[2]);
            if (!table || !schema) return null;
            return <TableDetails table={table} schema={schema} />;
        }

        // === COLUMN ===
        if (pathParts.length === 4) {
            const schema = database.schemas.find((s) => s.name === pathParts[1]);
            const table = schema?.tables.find((t) => t.name === pathParts[2]);
            const column = table?.columns.find((c) => c.name === pathParts[3]);
            if (!column || !table) return null;
            return <ColumnDetails column={column} table={table} />;
        }

        return null;
    };

    return (
        <div className="flex-1 overflow-auto bg-background">
            <ScrollArea className="h-full">
                <div className="p-6">{renderSelectedDetails()}</div>
            </ScrollArea>
        </div>
    );
};

export default MetaDataPanel;
