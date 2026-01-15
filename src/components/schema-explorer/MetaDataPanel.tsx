import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { ArrowRight, CheckSquare, Database, Hash, Key, Layers, Link2, List, ListChecks, Search, Table } from "lucide-react";
import {
    ColumnDetails,
    DatabaseSchemaDetails,
    SchemaGroup,
    TableSchemaDetails,
    ForeignKeyInfo,
} from "@/types/database";


interface Column extends ColumnDetails {
    foreignKeyRef?: string;
}

interface TableSchema extends TableSchemaDetails {
    columns: Column[];
}

interface Schema extends SchemaGroup {
    tables: TableSchema[];
}

interface DatabaseSchema extends DatabaseSchemaDetails {
    schemas: Schema[];
}

interface MetaDataPanelProps {
    selectedItem: string | null;
    database: DatabaseSchema | null;
}

// Helper to get FK info for a column
const getFkInfo = (columnName: string, foreignKeys?: ForeignKeyInfo[]): ForeignKeyInfo | undefined => {
    return foreignKeys?.find(fk => fk.source_column === columnName);
};

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
            const db = database;
            const totalTables = db.schemas.reduce((acc, s) => acc + s.tables.length, 0);
            const totalColumns = db.schemas.reduce((acc, s) => acc + s.tables.reduce((a, t) => a + t.columns.length, 0), 0);
            const totalFKs = db.schemas.reduce((acc, s) => acc + s.tables.reduce((a, t) => a + (t.foreignKeys?.length || 0), 0), 0);
            const totalIndexes = db.schemas.reduce((acc, s) => acc + s.tables.reduce((a, t) => a + (t.indexes?.length || 0), 0), 0);
            const totalEnums = db.schemas.reduce((acc, s) => acc + (s.enumTypes ? new Set(s.enumTypes.map(e => e.enum_name)).size : 0), 0);
            const totalSeqs = db.schemas.reduce((acc, s) => acc + (s.sequences?.length || 0), 0);

            return (
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Database className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">{db.name}</h2>
                            <p className="text-sm text-muted-foreground">Database</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <Card>
                            <CardContent className="pt-4">
                                <div className="text-2xl font-bold font-mono tabular-nums">{db.schemas.length}</div>
                                <p className="text-xs text-muted-foreground">Schemas</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4">
                                <div className="text-2xl font-bold font-mono tabular-nums">{totalTables}</div>
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
                                <div className="text-2xl font-bold font-mono tabular-nums text-cyan-600">{totalFKs}</div>
                                <p className="text-xs text-muted-foreground">Foreign Keys</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4">
                                <div className="text-2xl font-bold font-mono tabular-nums text-blue-600">{totalIndexes}</div>
                                <p className="text-xs text-muted-foreground">Indexes</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4">
                                <div className="text-2xl font-bold font-mono tabular-nums text-purple-600">{totalEnums}</div>
                                <p className="text-xs text-muted-foreground">Enums</p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            );
        }

        // === SCHEMA ===
        if (pathParts.length === 2) {
            const schema = database.schemas.find((s) => s.name === pathParts[1]);
            if (!schema) return null;
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
                                <div className="text-2xl font-bold font-mono tabular-nums">{schema.tables.length}</div>
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
                                <div className="text-2xl font-bold font-mono tabular-nums text-cyan-600">{totalFKs}</div>
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
                                    {Array.from(new Set(schema.enumTypes.map(e => e.enum_name))).map(enumName => {
                                        const enumValues = schema.enumTypes?.filter(e => e.enum_name === enumName).map(e => e.enum_value) || [];
                                        return (
                                            <div key={enumName} className="border border-border rounded-md p-3">
                                                <div className="font-medium text-sm text-purple-600 dark:text-purple-400 mb-2">{enumName}</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {enumValues.map(v => (
                                                        <Badge key={v} variant="outline" className="text-xs">{v}</Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
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
                                        {schema.sequences.map(seq => (
                                            <TableRow key={seq.sequence_name}>
                                                <TableCell className="font-mono text-sm">{seq.sequence_name}</TableCell>
                                                <TableCell className="text-muted-foreground text-sm">
                                                    {seq.table_name && seq.column_name
                                                        ? `${seq.table_name}.${seq.column_name}`
                                                        : '—'}
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

        // === ENUM TYPE ===
        if (pathParts.length === 4 && pathParts[2] === 'enum') {
            const schema = database.schemas.find((s) => s.name === pathParts[1]);
            const enumName = pathParts[3];
            const enumValues = schema?.enumTypes?.filter(e => e.enum_name === enumName).map(e => e.enum_value) || [];

            return (
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/10 rounded-lg">
                            <List className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">{enumName}</h2>
                            <p className="text-sm text-muted-foreground">Enum Type in {schema?.name}</p>
                        </div>
                    </div>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Values ({enumValues.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                {enumValues.map((v, i) => (
                                    <Badge key={v} variant="outline" className="text-sm">
                                        <span className="text-muted-foreground mr-1">{i + 1}.</span> {v}
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        // === SEQUENCE ===
        if (pathParts.length === 4 && pathParts[2] === 'seq') {
            const schema = database.schemas.find((s) => s.name === pathParts[1]);
            const seqName = pathParts[3];
            const sequence = schema?.sequences?.find(s => s.sequence_name === seqName);

            return (
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <Hash className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">{seqName}</h2>
                            <p className="text-sm text-muted-foreground">Sequence in {schema?.name}</p>
                        </div>
                    </div>

                    {sequence?.table_name && (
                        <Card>
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Used by:</span>
                                    <Badge variant="outline">
                                        <Table className="h-3 w-3 mr-1" />
                                        {sequence.table_name}.{sequence.column_name}
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            );
        }

        // === TABLE ===
        if (pathParts.length === 3) {
            const schema = database.schemas.find((s) => s.name === pathParts[1]);
            const table = schema?.tables.find((t) => t.name === pathParts[2]);
            if (!table) return null;

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
                                {table.type === 'BASE TABLE' ? 'Table' : 'View'} in {schema?.name}
                            </p>
                        </div>
                        {table.type !== 'BASE TABLE' && (
                            <Badge className="ml-auto">VIEW</Badge>
                        )}
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
                                        const isIndexed = table.indexes?.some(idx => idx.column_name === col.name && !idx.is_primary);
                                        const isUnique = table.uniqueConstraints?.some(uc => uc.column_name === col.name);

                                        return (
                                            <TableRow key={col.name} className="hover:bg-accent/30">
                                                <TableCell className="font-medium text-foreground">
                                                    <div className="flex items-center gap-1.5">
                                                        {col.isPrimaryKey && <Key className="h-3 w-3 text-amber-600" />}
                                                        {col.isForeignKey && <Link2 className="h-3 w-3 text-cyan-600" />}
                                                        <span className={`font-mono ${col.isPrimaryKey ? 'text-amber-600 dark:text-amber-400' : col.isForeignKey ? 'text-cyan-600 dark:text-cyan-400' : ''}`}>
                                                            {col.name}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground font-mono text-xs">{col.type}</TableCell>
                                                <TableCell className="text-center">
                                                    {col.nullable
                                                        ? <span className="text-muted-foreground">Yes</span>
                                                        : <span className="text-red-500 font-medium">No</span>}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground text-xs">
                                                    {col.defaultValue || "—"}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        {col.isPrimaryKey && (
                                                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600/50">PK</Badge>
                                                        )}
                                                        {fkInfo && (
                                                            <Badge variant="outline" className="text-[10px] text-cyan-600 border-cyan-600/50">
                                                                FK → {fkInfo.target_table}
                                                            </Badge>
                                                        )}
                                                        {isUnique && (
                                                            <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-600/50">UQ</Badge>
                                                        )}
                                                        {isIndexed && (
                                                            <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-600/50">IDX</Badge>
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
                                                    <span className="font-mono text-sm font-medium">{fk.constraint_name}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <Badge variant="outline" className="font-mono">
                                                        {fk.source_column}
                                                    </Badge>
                                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                                    <Badge variant="outline" className="font-mono text-cyan-600 border-cyan-600/50">
                                                        {fk.target_table}.{fk.target_column}
                                                    </Badge>
                                                </div>
                                                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                                                    <span>ON UPDATE: <span className="font-medium text-foreground">{fk.update_rule}</span></span>
                                                    <span>ON DELETE: <span className="font-medium text-foreground">{fk.delete_rule}</span></span>
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
                                                <TableCell className="font-mono text-xs">{idx.index_name}</TableCell>
                                                <TableCell className="font-mono text-xs">{idx.column_name}</TableCell>
                                                <TableCell className="text-center">
                                                    {idx.is_primary ? (
                                                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600/50">PRIMARY</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[10px]">INDEX</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {idx.is_unique ? (
                                                        <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-600/50">UNIQUE</Badge>
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
                                                    <div className="font-mono text-xs font-medium mb-1">{chk.constraint_name}</div>
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
                                        <div className="text-2xl font-bold font-mono tabular-nums">{table.columns.length}</div>
                                        <p className="text-xs text-muted-foreground">Columns</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 text-center">
                                        <div className="text-2xl font-bold font-mono tabular-nums text-amber-600">{pkCount}</div>
                                        <p className="text-xs text-muted-foreground">Primary Keys</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 text-center">
                                        <div className="text-2xl font-bold font-mono tabular-nums text-cyan-600">{fkCount}</div>
                                        <p className="text-xs text-muted-foreground">Foreign Keys</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 text-center">
                                        <div className="text-2xl font-bold font-mono tabular-nums text-blue-600">{idxCount}</div>
                                        <p className="text-xs text-muted-foreground">Indexes</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 text-center">
                                        <div className="text-2xl font-bold font-mono tabular-nums text-purple-600">{uqCount}</div>
                                        <p className="text-xs text-muted-foreground">Unique</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 text-center">
                                        <div className="text-2xl font-bold font-mono tabular-nums text-orange-600">{chkCount}</div>
                                        <p className="text-xs text-muted-foreground">Check</p>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            );
        }

        // === COLUMN ===
        if (pathParts.length === 4) {
            const schema = database.schemas.find((s) => s.name === pathParts[1]);
            const table = schema?.tables.find((t) => t.name === pathParts[2]);
            const column = table?.columns.find((c) => c.name === pathParts[3]);
            if (!column) return null;

            const fkInfo = getFkInfo(column.name, table?.foreignKeys);
            const indexInfo = table?.indexes?.filter(idx => idx.column_name === column.name);
            const uniqueInfo = table?.uniqueConstraints?.filter(uc => uc.column_name === column.name);

            return (
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${column.isPrimaryKey ? 'bg-amber-500/10' : column.isForeignKey ? 'bg-cyan-500/10' : 'bg-muted'}`}>
                            {column.isPrimaryKey && <Key className="h-6 w-6 text-amber-600 dark:text-amber-400" />}
                            {column.isForeignKey && !column.isPrimaryKey && <Link2 className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />}
                            {!column.isPrimaryKey && !column.isForeignKey && <Hash className="h-6 w-6 text-muted-foreground" />}
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">{column.name}</h2>
                            <p className="text-sm text-muted-foreground">Column in {table?.name}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {column.isPrimaryKey && (
                            <Badge className="bg-amber-600">Primary Key</Badge>
                        )}
                        {column.isForeignKey && (
                            <Badge className="bg-cyan-600">Foreign Key</Badge>
                        )}
                        {!column.nullable && (
                            <Badge variant="destructive">NOT NULL</Badge>
                        )}
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
                                        <Badge variant="outline" className="font-mono text-cyan-600 border-cyan-600/50">
                                            {fkInfo.target_table}.{fkInfo.target_column}
                                        </Badge>
                                    </div>
                                    <div className="flex gap-4 text-xs">
                                        <span>ON UPDATE: <span className="font-medium">{fkInfo.update_rule}</span></span>
                                        <span>ON DELETE: <span className="font-medium">{fkInfo.delete_rule}</span></span>
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
                                            {idx.is_primary && <Badge className="text-[10px] bg-amber-600">PRIMARY</Badge>}
                                            {idx.is_unique && <Badge className="text-[10px] bg-purple-600">UNIQUE</Badge>}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            );
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
