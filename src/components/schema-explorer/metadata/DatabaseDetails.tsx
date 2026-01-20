import { Card, CardContent } from "@/components/ui/card";
import { Database } from "lucide-react";
import { DatabaseSchema } from "../types";

interface DatabaseDetailsProps {
    database: DatabaseSchema;
}

export function DatabaseDetails({ database }: DatabaseDetailsProps) {
    const totalTables = database.schemas.reduce((acc, s) => acc + s.tables.length, 0);
    const totalColumns = database.schemas.reduce(
        (acc, s) => acc + s.tables.reduce((a, t) => a + t.columns.length, 0),
        0
    );
    const totalFKs = database.schemas.reduce(
        (acc, s) => acc + s.tables.reduce((a, t) => a + (t.foreignKeys?.length || 0), 0),
        0
    );
    const totalIndexes = database.schemas.reduce(
        (acc, s) => acc + s.tables.reduce((a, t) => a + (t.indexes?.length || 0), 0),
        0
    );
    const totalEnums = database.schemas.reduce(
        (acc, s) => acc + (s.enumTypes ? new Set(s.enumTypes.map((e) => e.enum_name)).size : 0),
        0
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <Database className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold">{database.name}</h2>
                    <p className="text-sm text-muted-foreground">Database</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold font-mono tabular-nums">
                            {database.schemas.length}
                        </div>
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
                        <div className="text-2xl font-bold font-mono tabular-nums text-cyan-600">
                            {totalFKs}
                        </div>
                        <p className="text-xs text-muted-foreground">Foreign Keys</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold font-mono tabular-nums text-blue-600">
                            {totalIndexes}
                        </div>
                        <p className="text-xs text-muted-foreground">Indexes</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold font-mono tabular-nums text-purple-600">
                            {totalEnums}
                        </div>
                        <p className="text-xs text-muted-foreground">Enums</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
