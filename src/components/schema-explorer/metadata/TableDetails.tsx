import { Badge } from "@/components/ui/badge";
import {
    Table as ShadcnTable,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, CheckSquare, Key, Link2, ListChecks, Table } from "lucide-react";
import { TableSchema, Schema, getFkInfo } from "../types";

interface TableDetailsProps {
    table: TableSchema;
    schema: Schema;
}

export function TableDetails({ table, schema }: TableDetailsProps) {
    const pkCount = table.primaryKeys?.length || 0;
    const fkCount = table.foreignKeys?.length || 0;
    const idxCount = table.indexes?.length || 0;
    const uqCount = table.uniqueConstraints?.length || 0;
    const chkCount = table.checkConstraints?.length || 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-500/10 rounded-lg">
                    <Table className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold">{table.name}</h2>
                    <p className="text-sm text-muted-foreground">
                        {table.type === "BASE TABLE" ? "Table" : "View"} in {schema?.name}
                    </p>
                </div>
                {table.type !== "BASE TABLE" && <Badge className="ml-auto">VIEW</Badge>}
            </div>

            <Tabs defaultValue="columns" className="w-full">
                <TabsList className="w-full grid grid-cols-5">
                    <TabsTrigger value="columns" className="text-xs">
                        Columns ({table.columns.length})
                    </TabsTrigger>
                    <TabsTrigger value="foreignKeys" className="text-xs">
                        FKs ({fkCount})
                    </TabsTrigger>
                    <TabsTrigger value="indexes" className="text-xs">
                        Indexes ({idxCount})
                    </TabsTrigger>
                    <TabsTrigger value="constraints" className="text-xs">
                        Constraints
                    </TabsTrigger>
                    <TabsTrigger value="overview" className="text-xs">
                        Overview
                    </TabsTrigger>
                </TabsList>

                {/* Columns Tab */}
                <TabsContent value="columns" className="mt-4">
                    <ShadcnTable className="border border-border rounded-md overflow-hidden">
                        <TableHeader>
                            <TableRow className="bg-accent/50">
                                <TableHead className="text-foreground w-[200px]">Column</TableHead>
                                <TableHead className="text-foreground">Type</TableHead>
                                <TableHead className="text-foreground text-center">Nullable</TableHead>
                                <TableHead className="text-foreground">Default</TableHead>
                                <TableHead className="text-foreground">Keys/Info</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {table.columns.map((col) => {
                                const fkInfo = getFkInfo(col.name, table.foreignKeys);
                                const isIndexed = table.indexes?.some(
                                    (idx) => idx.column_name === col.name && !idx.is_primary
                                );
                                const isUnique = table.uniqueConstraints?.some(
                                    (uc) => uc.column_name === col.name
                                );

                                return (
                                    <TableRow key={col.name} className="hover:bg-accent/30">
                                        <TableCell className="font-medium text-foreground">
                                            <div className="flex items-center gap-1.5">
                                                {col.isPrimaryKey && (
                                                    <Key className="h-3 w-3 text-amber-600" />
                                                )}
                                                {col.isForeignKey && (
                                                    <Link2 className="h-3 w-3 text-cyan-600" />
                                                )}
                                                <span
                                                    className={`font-mono ${col.isPrimaryKey
                                                            ? "text-amber-600 dark:text-amber-400"
                                                            : col.isForeignKey
                                                                ? "text-cyan-600 dark:text-cyan-400"
                                                                : ""
                                                        }`}
                                                >
                                                    {col.name}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground font-mono text-xs">
                                            {col.type}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {col.nullable ? (
                                                <span className="text-muted-foreground">Yes</span>
                                            ) : (
                                                <span className="text-red-500 font-medium">No</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {col.defaultValue || "—"}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap items-center gap-1">
                                                {col.isPrimaryKey && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] text-amber-600 border-amber-600/50"
                                                    >
                                                        PK
                                                    </Badge>
                                                )}
                                                {fkInfo && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] text-cyan-600 border-cyan-600/50"
                                                    >
                                                        FK → {fkInfo.target_table}
                                                    </Badge>
                                                )}
                                                {isUnique && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] text-purple-600 border-purple-600/50"
                                                    >
                                                        UQ
                                                    </Badge>
                                                )}
                                                {isIndexed && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] text-blue-600 border-blue-600/50"
                                                    >
                                                        IDX
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </ShadcnTable>
                </TabsContent>

                {/* Foreign Keys Tab */}
                <TabsContent value="foreignKeys" className="mt-4">
                    {table.foreignKeys && table.foreignKeys.length > 0 ? (
                        <div className="space-y-3">
                            {table.foreignKeys.map((fk, idx) => (
                                <Card key={idx}>
                                    <CardContent className="pt-4">
                                        <div className="flex items-center gap-3 mb-3">
                                            <Link2 className="h-4 w-4 text-cyan-600" />
                                            <span className="font-mono text-sm font-medium">
                                                {fk.constraint_name}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <Badge variant="outline" className="font-mono">
                                                {fk.source_column}
                                            </Badge>
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                            <Badge
                                                variant="outline"
                                                className="font-mono text-cyan-600 border-cyan-600/50"
                                            >
                                                {fk.target_table}.{fk.target_column}
                                            </Badge>
                                        </div>
                                        <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                                            <span>
                                                ON UPDATE:{" "}
                                                <span className="font-medium text-foreground">
                                                    {fk.update_rule}
                                                </span>
                                            </span>
                                            <span>
                                                ON DELETE:{" "}
                                                <span className="font-medium text-foreground">
                                                    {fk.delete_rule}
                                                </span>
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground text-center py-8">
                            No foreign keys defined
                        </div>
                    )}
                </TabsContent>

                {/* Indexes Tab */}
                <TabsContent value="indexes" className="mt-4">
                    {table.indexes && table.indexes.length > 0 ? (
                        <ShadcnTable className="border border-border rounded-md overflow-hidden">
                            <TableHeader>
                                <TableRow className="bg-accent/50">
                                    <TableHead className="text-foreground">Name</TableHead>
                                    <TableHead className="text-foreground">Column</TableHead>
                                    <TableHead className="text-foreground text-center">Type</TableHead>
                                    <TableHead className="text-foreground text-center">Unique</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {table.indexes.map((idx, i) => (
                                    <TableRow key={i} className="hover:bg-accent/30">
                                        <TableCell className="font-mono text-xs">
                                            {idx.index_name}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                            {idx.column_name}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {idx.is_primary ? (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] text-amber-600 border-amber-600/50"
                                                >
                                                    PRIMARY
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px]">
                                                    INDEX
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {idx.is_unique ? (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] text-purple-600 border-purple-600/50"
                                                >
                                                    UNIQUE
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </ShadcnTable>
                    ) : (
                        <div className="text-sm text-muted-foreground text-center py-8">
                            No indexes defined
                        </div>
                    )}
                </TabsContent>

                {/* Constraints Tab */}
                <TabsContent value="constraints" className="mt-4 space-y-4">
                    {/* Unique Constraints */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-purple-600" />
                                Unique Constraints ({uqCount})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {table.uniqueConstraints && table.uniqueConstraints.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {table.uniqueConstraints.map((uc, idx) => (
                                        <Badge key={idx} variant="outline" className="font-mono text-xs">
                                            {uc.constraint_name}: {uc.column_name}
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-sm text-muted-foreground">None</span>
                            )}
                        </CardContent>
                    </Card>

                    {/* Check Constraints */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <CheckSquare className="h-4 w-4 text-orange-600" />
                                Check Constraints ({chkCount})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {table.checkConstraints && table.checkConstraints.length > 0 ? (
                                <div className="space-y-2">
                                    {table.checkConstraints.map((chk, idx) => (
                                        <div key={idx} className="border border-border rounded-md p-2">
                                            <div className="font-mono text-xs font-medium mb-1">
                                                {chk.constraint_name}
                                            </div>
                                            <code className="text-xs text-muted-foreground bg-accent/50 px-2 py-1 rounded block">
                                                {chk.check_clause || chk.definition}
                                            </code>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-sm text-muted-foreground">None</span>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-4">
                    <div className="grid grid-cols-3 gap-3">
                        <Card>
                            <CardContent className="pt-4 text-center">
                                <div className="text-2xl font-bold font-mono tabular-nums">
                                    {table.columns.length}
                                </div>
                                <p className="text-xs text-muted-foreground">Columns</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 text-center">
                                <div className="text-2xl font-bold font-mono tabular-nums text-amber-600">
                                    {pkCount}
                                </div>
                                <p className="text-xs text-muted-foreground">Primary Keys</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 text-center">
                                <div className="text-2xl font-bold font-mono tabular-nums text-cyan-600">
                                    {fkCount}
                                </div>
                                <p className="text-xs text-muted-foreground">Foreign Keys</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 text-center">
                                <div className="text-2xl font-bold font-mono tabular-nums text-blue-600">
                                    {idxCount}
                                </div>
                                <p className="text-xs text-muted-foreground">Indexes</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 text-center">
                                <div className="text-2xl font-bold font-mono tabular-nums text-purple-600">
                                    {uqCount}
                                </div>
                                <p className="text-xs text-muted-foreground">Unique</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 text-center">
                                <div className="text-2xl font-bold font-mono tabular-nums text-orange-600">
                                    {chkCount}
                                </div>
                                <p className="text-xs text-muted-foreground">Check</p>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
