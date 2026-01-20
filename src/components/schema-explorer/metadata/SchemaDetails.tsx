import { Badge } from "@/components/ui/badge";
import {
    Table as ShadcnTable,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Hash, Layers, List } from "lucide-react";
import { Schema } from "../types";

interface SchemaDetailsProps {
    schema: Schema;
}

export function SchemaDetails({ schema }: SchemaDetailsProps) {
    const totalColumns = schema.tables.reduce((a, t) => a + t.columns.length, 0);
    const totalFKs = schema.tables.reduce((a, t) => a + (t.foreignKeys?.length || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                    <Layers className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold">{schema.name}</h2>
                    <p className="text-sm text-muted-foreground">Schema</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold font-mono tabular-nums">
                            {schema.tables.length}
                        </div>
                        <p className="text-xs text-muted-foreground">Tables</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold font-mono tabular-nums">{totalColumns}</div>
                        <p className="text-xs text-muted-foreground">Columns</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold font-mono tabular-nums text-cyan-600">
                            {totalFKs}
                        </div>
                        <p className="text-xs text-muted-foreground">Foreign Keys</p>
                    </CardContent>
                </Card>
            </div>

            {/* Enum Types */}
            {schema.enumTypes && schema.enumTypes.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <List className="h-4 w-4 text-purple-600" />
                            Enum Types
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {Array.from(new Set(schema.enumTypes.map((e) => e.enum_name))).map(
                                (enumName) => {
                                    const enumValues =
                                        schema.enumTypes
                                            ?.filter((e) => e.enum_name === enumName)
                                            .map((e) => e.enum_value) || [];
                                    return (
                                        <div key={enumName} className="border border-border rounded-md p-3">
                                            <div className="font-medium text-sm text-purple-600 dark:text-purple-400 mb-2">
                                                {enumName}
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {enumValues.map((v) => (
                                                    <Badge key={v} variant="outline" className="text-xs">
                                                        {v}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Sequences */}
            {schema.sequences && schema.sequences.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Hash className="h-4 w-4 text-emerald-600" />
                            Sequences
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ShadcnTable>
                            <TableHeader>
                                <TableRow className="bg-accent/50">
                                    <TableHead className="text-foreground">Name</TableHead>
                                    <TableHead className="text-foreground">Used By</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {schema.sequences.map((seq) => (
                                    <TableRow key={seq.sequence_name}>
                                        <TableCell className="font-mono text-sm">
                                            {seq.sequence_name}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {seq.table_name && seq.column_name
                                                ? `${seq.table_name}.${seq.column_name}`
                                                : "—"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </ShadcnTable>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
