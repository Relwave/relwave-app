import React from 'react'
import { Card, CardHeader, CardAction, CardContent, CardFooter, CardTitle, CardDescription } from '../ui/card'
import { RefreshCw } from 'lucide-react'
import { DataTable } from '../DataTable'
import { TableRow } from '@/services/bridgeApi';
import { SelectedTable } from '@/pages/DatabaseDetails';


interface DataProps {
    selectedTable: SelectedTable | null;
    isExecuting: boolean;
    tableData: TableRow[];
    rowCount: number;
}


const Data: React.FC<DataProps> = ({ selectedTable, isExecuting, tableData, rowCount }) => {
    const tableName = selectedTable ? `${selectedTable.schema}.${selectedTable.name}` : "No table selected";

    return (
        <Card className="bg-card border border-border rounded-xl shadow-elevated">
            <CardHeader className="border-b border-border pb-4">
                <CardTitle className="font-mono text-xl text-foreground">
                    {tableName} Data
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                    {isExecuting ? "Loading data..." : `Showing ${rowCount.toLocaleString()} rows`}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
                {isExecuting && rowCount === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                        Fetching initial data from **{selectedTable?.name || 'table'}**...
                    </div>
                ) : (
                    <DataTable data={tableData} />
                )}
            </CardContent>
        </Card>
    )
}

export default Data