export interface SchemaDetails {
  name: string;
  schemas: Schema[];
}

export interface Schema {
  name: string;
  tables: Table[];
}

export interface Table {
  name: string;
  type: string;
  columns: Column[];
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  defaultValue: string | null;
  isUnique: boolean;
}
