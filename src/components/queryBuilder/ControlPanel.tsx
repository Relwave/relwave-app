import { Card, CardHeader, CardContent, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Plus, Trash2 } from 'lucide-react';


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
    mockTables: string[];
    addFilter: () => void;
    removeFilter: (index: number) => void;
    generateSQL: () => void;
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
        mockTables,
        generateSQL,
        addFilter,
        removeFilter
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
                            {mockTables.map((table) => (
                                <SelectItem key={table} value={table}>
                                    {table}
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
                        <CardTitle className="text-lg">Filters</CardTitle>
                        <Button size="sm" variant="outline" onClick={addFilter}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    {filters.map((filter, index) => (
                        <div key={index} className="flex gap-2 items-center">
                            <Input
                                placeholder="Column"
                                value={filter.column}
                                onChange={(e) => {
                                    const newFilters = [...filters];
                                    newFilters[index].column = e.target.value;
                                    setFilters(newFilters);
                                }}
                                className="text-sm"
                            />
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
                        <Input
                            placeholder="column_name"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Group By</label>
                        <Input
                            placeholder="column_name"
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <Button onClick={generateSQL} className="w-full gradient-primary">
                Generate SQL
            </Button>
        </div>)
}

export default ControlPanel