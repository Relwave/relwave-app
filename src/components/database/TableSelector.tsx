import { FC, useMemo } from "react";
import { Table2, Database } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SelectedTable, TableInfo } from "@/types/database";

interface TableSelectorProps {
  tables: TableInfo[];
  selectedTable: SelectedTable | null;
  loading: boolean;
  onTableSelect: (tableName: string, schemaName: string) => void;
}

const TableSelector: FC<TableSelectorProps> = ({
  tables,
  selectedTable,
  loading,
  onTableSelect,
}) => {
  const tablesBySchema = useMemo(() => {
    return tables.reduce<Record<string, TableInfo[]>>((acc, table) => {
      const schema = table.schema;
      if (!acc[schema]) {
        acc[schema] = [];
      }
      acc[schema].push(table);
      return acc;
    }, {});
  }, [tables]);

  const selectedValue = selectedTable
    ? `${selectedTable.schema}.${selectedTable.name}`
    : "";

  const handleValueChange = (value: string) => {
    if (!value) return;
    const [schemaName, tableName] = value.split(".");
    onTableSelect(tableName, schemaName);
  };

  if (loading) {
    return (
      <div className="w-full sm:w-64">
        <div className="flex items-center gap-2 p-3 rounded-md border border-border/20 bg-muted/20">
          <Spinner className="h-4 w-4 text-muted-foreground/60" />
          <span className="text-sm text-muted-foreground/70">Loading tables...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full sm:w-64">
      <Select
        value={selectedValue}
        onValueChange={handleValueChange}
        disabled={tables.length === 0}
      >
        <SelectTrigger className="w-full font-mono text-sm">
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-muted-foreground/60" />
            <SelectValue placeholder="Select a table">
              {selectedTable ? selectedTable.name : "Select a table"}
            </SelectValue>
          </div>
        </SelectTrigger>

        <SelectContent className="max-h-80">
          {tables.length === 0 ? (
            <SelectItem value="no-tables" disabled>
              <div className="flex items-center gap-2 text-muted-foreground py-2">
                <Database className="h-4 w-4" />
                <span className="text-sm">No tables found</span>
              </div>
            </SelectItem>
          ) : (
            Object.entries(tablesBySchema).map(([schema, schemaTables]) => (
              <SelectGroup key={schema}>
                <SelectLabel className="text-xs font-medium text-muted-foreground/70 px-2 py-1.5">
                  {schema}
                </SelectLabel>
                {schemaTables.map((table) => (
                  <SelectItem
                    key={`${table.schema}.${table.name}`}
                    value={`${table.schema}.${table.name}`}
                    className="font-mono text-sm cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{table.name}</span>
                      <span className="text-xs text-muted-foreground/60 ml-2">{table.type}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
};

export default TableSelector;