import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, X } from 'lucide-react';
import { SchemaDetails } from '@/types/schema';



interface ControlPanelProps {
    selectedTable: string;
    setSelectedTable: (table: string) => void;
    addTable: () => void;
    filters: Array<{ column: string; operator: string; value: string }>;
    setFilters: React.Dispatch<React.SetStateAction<Array<{ column: string; operator: string; value: string }>>>;
    sortBy: string;
    setSortBy: React.Dispatch<React.SetStateAction<string>>;
    groupBy: string;
    setGroupBy: React.Dispatch<React.SetStateAction<string>>;
    limit: number;
    setLimit: React.Dispatch<React.SetStateAction<number>>;
    selectedColumns: string[];
    setSelectedColumns: React.Dispatch<React.SetStateAction<string[]>>;
    queryHistory: Array<{ sql: string; timestamp: number; tables: string[] }>;
    onLoadQuery: (sql: string) => void;
    onClearHistory: () => void;
    Tables: SchemaDetails;
    addFilter: () => void;
    removeFilter: (index: number) => void;
    generateSQL: () => void;
    availableColumns: Array<{ value: string; label: string; table: string }>;
}


const ControlPanel = (props: ControlPanelProps) => {
    const {
        selectedTable,
        setSelectedTable,
        addTable,
        filters,
        setFilters,
        sortBy,
        setSortBy,
        groupBy,
        setGroupBy,
        limit,
        setLimit,
        selectedColumns,
        setSelectedColumns,
        queryHistory,
        onLoadQuery,
        onClearHistory,
        Tables,
        generateSQL,
        addFilter,
        removeFilter,
        availableColumns
    } = props;
    return (
        <div className="space-y-4">
            <Card className="shadow-elevated">
                <CardHeader>
                    <CardTitle className="text-lg">Add Tables</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Select value={selectedTable} onValueChange={setSelectedTable}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select table" />
                        </SelectTrigger>
                        <SelectContent>
                            {Tables.schemas.flatMap(schema => schema.tables).map((table) => (
                                <SelectItem key={table.name} value={table.name}>
                                    {table.name}
                                </SelectItem>
                            ))}

                        </SelectContent>
                    </Select>
                    <Button onClick={addTable} className="w-full gradient-primary">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Table
                    </Button>
                </CardContent>
            </Card>

            <Card className="shadow-elevated">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Select Columns</CardTitle>
                        <div className="flex gap-1">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedColumns(availableColumns.map(c => c.value))}
                                disabled={availableColumns.length === 0}
                                className="text-xs h-7"
                            >
                                All
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedColumns([])}
                                disabled={selectedColumns.length === 0}
                                className="text-xs h-7"
                            >
                                Clear
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Select
                        value=""
                        onValueChange={(val) => {
                            if (!selectedColumns.includes(val)) {
                                setSelectedColumns([...selectedColumns, val]);
                            }
                        }}
                    >
                        <SelectTrigger className="text-sm">
                            <SelectValue placeholder="Add column..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availableColumns.length > 0 ? (
                                availableColumns.map((col) => (
                                    <SelectItem key={col.value} value={col.value} className="text-sm">
                                        {col.label}
                                    </SelectItem>
                                ))
                            ) : (
                                <SelectItem value="no-columns" disabled className="text-sm text-muted-foreground">
                                    Add tables first
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>

                    {selectedColumns.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {selectedColumns.map((col) => (
                                <div
                                    key={col}
                                    className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded text-xs"
                                >
                                    <span>{col}</span>
                                    <button
                                        onClick={() => setSelectedColumns(selectedColumns.filter(c => c !== col))}
                                        className="hover:bg-primary/20 rounded-full p-0.5"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">
                            No columns selected • Will use SELECT *
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-elevated">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Filters</CardTitle>
                        <Button size="sm" variant="outline" onClick={addFilter}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    {filters.map((filter, index) => (
                        <div key={index} className="flex gap-2 items-center">
                            <Select
                                value={filter.column}
                                onValueChange={(val) => {
                                    const newFilters = [...filters];
                                    newFilters[index].column = val;
                                    setFilters(newFilters);
                                }}
                            >
                                <SelectTrigger className="text-sm">
                                    <SelectValue placeholder="Column" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableColumns.length > 0 ? (
                                        availableColumns.map((col) => (
                                            <SelectItem key={col.value} value={col.value} className="text-sm">
                                                {col.label}
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <SelectItem value="no-columns" disabled className="text-sm text-muted-foreground">
                                            Add tables first
                                        </SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                            <Select
                                value={filter.operator}
                                onValueChange={(val) => {
                                    const newFilters = [...filters];
                                    newFilters[index].operator = val;
                                    setFilters(newFilters);
                                }}
                            >
                                <SelectTrigger className="w-20">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="=">=</SelectItem>
                                    <SelectItem value="!=">!=</SelectItem>
                                    <SelectItem value=">">{">"}</SelectItem>
                                    <SelectItem value="<">{"<"}</SelectItem>
                                    <SelectItem value="LIKE">LIKE</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                placeholder="Value"
                                value={filter.value}
                                onChange={(e) => {
                                    const newFilters = [...filters];
                                    newFilters[index].value = e.target.value;
                                    setFilters(newFilters);
                                }}
                                className="text-sm"
                            />
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => removeFilter(index)}
                            >
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                    ))}
                    {filters.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">No filters added</p>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-elevated">
                <CardHeader>
                    <CardTitle className="text-lg">Sort & Group</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Sort By</label>
                        <div className="flex gap-2">
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger className="text-sm">
                                    <SelectValue placeholder="Select column" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableColumns.length > 0 ? (
                                        availableColumns.map((col) => (
                                            <SelectItem key={col.value} value={col.value} className="text-sm">
                                                {col.label}
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <SelectItem value="no-columns" disabled className="text-sm text-muted-foreground">
                                            Add tables first
                                        </SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                            {sortBy && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setSortBy("")}
                                    className="h-9 w-9 shrink-0"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Group By</label>
                        <div className="flex gap-2">
                            <Select value={groupBy} onValueChange={setGroupBy}>
                                <SelectTrigger className="text-sm">
                                    <SelectValue placeholder="Select column" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableColumns.length > 0 ? (
                                        availableColumns.map((col) => (
                                            <SelectItem key={col.value} value={col.value} className="text-sm">
                                                {col.label}
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <SelectItem value="no-columns" disabled className="text-sm text-muted-foreground">
                                            Add tables first
                                        </SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                            {groupBy && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setGroupBy("")}
                                    className="h-9 w-9 shrink-0"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Limit Results</label>
                        <div className="flex gap-2">
                            <Input
                                type="number"
                                value={limit}
                                onChange={(e) => setLimit(parseInt(e.target.value) || 0)}
                                placeholder="Row limit"
                                className="text-sm"
                                min="0"
                            />
                            {limit > 0 && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setLimit(0)}
                                    className="h-9 w-9 shrink-0"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-1 mt-2">
                            {[10, 50, 100, 500, 1000].map((val) => (
                                <Button
                                    key={val}
                                    size="sm"
                                    variant={limit === val ? "default" : "outline"}
                                    onClick={() => setLimit(val)}
                                    className="text-xs h-7 px-2"
                                >
                                    {val}
                                </Button>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-elevated">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Query History</CardTitle>
                        {queryHistory.length > 0 && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={onClearHistory}
                                className="text-xs h-7"
                            >
                                Clear All
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {queryHistory.length > 0 ? (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {queryHistory.map((item) => (
                                <div
                                    key={item.timestamp}
                                    className="border border-border/20 rounded p-2 hover:bg-muted/30 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-muted-foreground truncate">
                                                {item.tables.join(', ')}
                                            </p>
                                            <p className="text-xs text-muted-foreground/60">
                                                {new Date(item.timestamp).toLocaleString()}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => onLoadQuery(item.sql)}
                                            className="text-xs h-6 px-2 shrink-0"
                                        >
                                            Load
                                        </Button>
                                    </div>
                                    <pre className="text-xs font-mono text-muted-foreground bg-muted/30 p-2 rounded overflow-x-auto max-w-full">
                                        {item.sql.length > 100 ? item.sql.substring(0, 100) + '...' : item.sql}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">
                            No query history yet
                        </p>
                    )}
                </CardContent>
            </Card>

            <Button onClick={generateSQL} className="w-full gradient-primary">
                Generate SQL
            </Button>
        </div>)
}

export default ControlPanel