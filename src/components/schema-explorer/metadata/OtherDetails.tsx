import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Hash, List, Table } from "lucide-react";
import { Schema } from "../types";

interface EnumDetailsProps {
    enumName: string;
    schema: Schema;
}

export function EnumDetails({ enumName, schema }: EnumDetailsProps) {
    const enumValues =
        schema?.enumTypes?.filter((e) => e.enum_name === enumName).map((e) => e.enum_value) || [];

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

interface SequenceDetailsProps {
    sequenceName: string;
    schema: Schema;
}

export function SequenceDetails({ sequenceName, schema }: SequenceDetailsProps) {
    const sequence = schema?.sequences?.find((s) => s.sequence_name === sequenceName);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Hash className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold">{sequenceName}</h2>
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
