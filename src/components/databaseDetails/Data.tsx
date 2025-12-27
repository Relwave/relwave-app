import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '../ui/card'
import { RefreshCw } from 'lucide-react'
import { DataTable } from '../DataTable'
import { SelectedTable, TableRow } from '@/types/database';


interface DataProps {
    selectedTable: SelectedTable | null;
    isExecuting: boolean;
    tableData: TableRow[];
    rowCount: number;
}


const Data: React.FC<DataProps> = ({ selectedTable, isExecuting, tableData, rowCount }) => {
    const tableName = selectedTable ? `${selectedTable.schema}.${selectedTable.name}` : "No table selected";

    return (
        <Card className="border rounded-lg">
            <CardHeader className="border-b pb-4">
                <CardTitle className="font-mono text-lg">
                    {tableName} Data
                </CardTitle>
                <CardDescription>
                    {isExecuting ? "Loading data..." : `Showing ${rowCount.toLocaleString()} rows`}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
                {isExecuting && rowCount === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
                        <p className="text-sm">Fetching initial data from {selectedTable?.name || 'table'}...</p>
                    </div>
                ) : (
                    <DataTable data={tableData} />
                )}
            </CardContent>
        </Card>
    )
}

export default Data