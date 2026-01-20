import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Hash, Key, Link2, Search } from "lucide-react";
import { Column, TableSchema, getFkInfo } from "../types";

interface ColumnDetailsProps {
    column: Column;
    table: TableSchema;
}

export function ColumnDetails({ column, table }: ColumnDetailsProps) {
    const fkInfo = getFkInfo(column.name, table?.foreignKeys);
    const indexInfo = table?.indexes?.filter((idx) => idx.column_name === column.name);
    const uniqueInfo = table?.uniqueConstraints?.filter((uc) => uc.column_name === column.name);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div
                    className={`p-2 rounded-lg ${column.isPrimaryKey
                            ? "bg-amber-500/10"
                            : column.isForeignKey
                                ? "bg-cyan-500/10"
                                : "bg-muted"
                        }`}
                >
                    {column.isPrimaryKey && (
                        <Key className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    )}
                    {column.isForeignKey && !column.isPrimaryKey && (
                        <Link2 className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                    )}
                    {!column.isPrimaryKey && !column.isForeignKey && (
                        <Hash className="h-6 w-6 text-muted-foreground" />
                    )}
                </div>
                <div>
                    <h2 className="text-xl font-semibold">{column.name}</h2>
                    <p className="text-sm text-muted-foreground">Column in {table?.name}</p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {column.isPrimaryKey && <Badge className="bg-amber-600">Primary Key</Badge>}
                {column.isForeignKey && <Badge className="bg-cyan-600">Foreign Key</Badge>}
                {!column.nullable && <Badge variant="destructive">NOT NULL</Badge>}
                {uniqueInfo && uniqueInfo.length > 0 && (
                    <Badge className="bg-purple-600">Unique</Badge>
                )}
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Properties</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <label className="text-xs text-muted-foreground">Data Type</label>
                            <div className="font-mono font-medium">{column.type}</div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Nullable</label>
                            <div className="font-medium">{column.nullable ? "Yes" : "No"}</div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Default Value</label>
                            <div className="font-mono">{column.defaultValue || "—"}</div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Position</label>
                            <div className="font-medium">{column.ordinalPosition}</div>
                        </div>
                        {column.maxLength && (
                            <div>
                                <label className="text-xs text-muted-foreground">Max Length</label>
                                <div className="font-medium">{column.maxLength}</div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Foreign Key Reference */}
            {fkInfo && (
                <Card className="border-cyan-600/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-cyan-600">
                            <Link2 className="h-4 w-4" />
                            Foreign Key Reference
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">References:</span>
                                <Badge
                                    variant="outline"
                                    className="font-mono text-cyan-600 border-cyan-600/50"
                                >
                                    {fkInfo.target_table}.{fkInfo.target_column}
                                </Badge>
                            </div>
                            <div className="flex gap-4 text-xs">
                                <span>
                                    ON UPDATE: <span className="font-medium">{fkInfo.update_rule}</span>
                                </span>
                                <span>
                                    ON DELETE: <span className="font-medium">{fkInfo.delete_rule}</span>
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Constraint: {fkInfo.constraint_name}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Index Information */}
            {indexInfo && indexInfo.length > 0 && (
                <Card className="border-blue-600/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-blue-600">
                            <Search className="h-4 w-4" />
                            Indexes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {indexInfo.map((idx, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Badge variant="outline" className="font-mono text-xs">
                                        {idx.index_name}
                                    </Badge>
                                    {idx.is_primary && (
                                        <Badge className="text-[10px] bg-amber-600">PRIMARY</Badge>
                                    )}
                                    {idx.is_unique && (
                                        <Badge className="text-[10px] bg-purple-600">UNIQUE</Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
