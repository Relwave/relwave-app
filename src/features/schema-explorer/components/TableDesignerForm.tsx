import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Link2, Info } from "lucide-react";
import { CreateTableColumn, ForeignKeyConstraint } from "@/features/database/types";
import {
  getDatabaseAcceptedDatatypes,
  getDatabaseForeignKeySupport,
  getAllAcceptedDatatypes,
} from "@/lib/databases";
import ForeignKeyRow from "./ForeignKeyRow";
import useTableDesignerForm from "../hooks/useTableDesignerForm";

interface TableDesignerFormProps {
  tableName: string;
  onTableNameChange: (name: string) => void;
  columns: CreateTableColumn[];
  onColumnsChange: (columns: CreateTableColumn[]) => void;
  foreignKeys: ForeignKeyConstraint[];
  onForeignKeysChange: (foreignKeys: ForeignKeyConstraint[]) => void;
  currentSchema: string;
  availableTables: Array<{ schema: string; name: string }>;
  databaseType?: string;
}

export default function TableDesignerForm({
  tableName,
  onTableNameChange,
  columns,
  onColumnsChange,
  foreignKeys,
  onForeignKeysChange,
  currentSchema,
  availableTables,
  databaseType,
}: TableDesignerFormProps) {
  const acceptedDatatypes = getDatabaseAcceptedDatatypes(databaseType);
  const foreignKeySupport = getDatabaseForeignKeySupport(databaseType);
  const allKnownTypes = getAllAcceptedDatatypes(databaseType);

  const {
    addColumn,
    addForeignKey,
    removeColumn,
    removeForeignKey,
    updateColumn,
    updateForeignKey,
  } = useTableDesignerForm({
    onForeignKeysChange,
    onTableNameChange,
    onColumnsChange,
    tableName,
    columns,
    foreignKeys,
    currentSchema,
    availableTables,
    databaseType,
  });
  return (
    <div className="space-y-6">
      {/* Table Name */}
      <div className="space-y-2">
        <Label htmlFor="tableName" className="text-sm font-medium">
          Table Name
        </Label>
        <Input
          id="tableName"
          placeholder="e.g., users, products, orders"
          value={tableName}
          onChange={(e) => onTableNameChange(e.target.value)}
          className="font-mono"
        />
      </div>

      {/* Columns Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Columns</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addColumn}
            className="h-8 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Column
          </Button>
        </div>

        {columns.length === 0 ? (
          <div className="border border-dashed border-border/50 rounded-lg p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No columns added yet. Click "Add Column" to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-100 overflow-y-auto pr-2">
            {columns.map((column, index) => (
              <div
                key={index}
                className="border border-border/50 rounded-lg p-4 space-y-3 bg-card/50"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Column {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeColumn(index)}
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Column Fields */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Column Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`col-name-${index}`} className="text-xs">
                      Name
                    </Label>
                    <Input
                      id={`col-name-${index}`}
                      placeholder="column_name"
                      value={column.name}
                      onChange={(e) => updateColumn(index, "name", e.target.value)}
                      className="h-9 font-mono text-sm"
                    />
                  </div>

                  {/* Column Type */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`col-type-${index}`} className="text-xs">
                      Type
                    </Label>
                    <Select
                      value={column.type}
                      onValueChange={(value) => updateColumn(index, "type", value)}
                    >
                      <SelectTrigger id={`col-type-${index}`} className="h-9 text-sm font-mono">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {column.type &&
                          !allKnownTypes.some(
                            (t) => t.toLowerCase() === column.type.toLowerCase(),
                          ) && (
                            <SelectItem value={column.type} className="font-mono text-xs">
                              {column.type} (custom)
                            </SelectItem>
                          )}
                        {acceptedDatatypes.map((group) => (
                          <SelectGroup key={group.category}>
                            <SelectLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/40">
                              {group.category}
                            </SelectLabel>
                            {group.types.map((type) => (
                              <SelectItem key={type} value={type} className="font-mono text-xs">
                                {type}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Default Value */}
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor={`col-default-${index}`} className="text-xs">
                      Default Value (optional)
                    </Label>
                    <Input
                      id={`col-default-${index}`}
                      placeholder="e.g., NULL, 'value', 0"
                      value={column.default_value || ""}
                      onChange={(e) => updateColumn(index, "default_value", e.target.value)}
                      className="h-9 font-mono text-sm"
                    />
                  </div>
                </div>

                {/* Column Constraints */}
                <div className="flex items-center gap-4 pt-2 border-t border-border/30">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`col-pk-${index}`}
                      checked={column.is_primary_key}
                      onCheckedChange={(checked) =>
                        updateColumn(index, "is_primary_key", checked === true)
                      }
                    />
                    <Label
                      htmlFor={`col-pk-${index}`}
                      className="text-xs font-normal cursor-pointer"
                    >
                      Primary Key
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`col-notnull-${index}`}
                      checked={column.not_nullable}
                      onCheckedChange={(checked) =>
                        updateColumn(index, "not_nullable", checked === true)
                      }
                    />
                    <Label
                      htmlFor={`col-notnull-${index}`}
                      className="text-xs font-normal cursor-pointer"
                    >
                      NOT NULL
                    </Label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Foreign Keys Section */}
      <div className="space-y-3 border-t border-border/50 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Foreign Keys</Label>
          </div>
          {foreignKeySupport.supported && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addForeignKey}
              className="h-8 gap-1.5"
              disabled={columns.length === 0}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Foreign Key
            </Button>
          )}
        </div>

        {!foreignKeySupport.supported ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs flex items-start gap-3">
            <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-foreground">
                Foreign Key Constraints Not Supported
              </span>
              <p className="text-muted-foreground">{foreignKeySupport.notes}</p>
            </div>
          </div>
        ) : (
          <>
            {foreignKeySupport.notes && (
              <p className="text-xs text-muted-foreground/80 italic">{foreignKeySupport.notes}</p>
            )}
            {foreignKeys.length === 0 ? (
              <div className="border border-dashed border-border/50 rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No foreign keys defined. Add columns first, then define relationships.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-75 overflow-y-auto pr-2">
                {foreignKeys.map((fk, index) => (
                  <ForeignKeyRow
                    key={index}
                    foreignKey={fk}
                    index={index}
                    onUpdate={updateForeignKey}
                    onRemove={removeForeignKey}
                    availableColumns={columns.map((col) => col.name).filter(Boolean)}
                    availableTables={availableTables}
                    currentSchema={currentSchema}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
