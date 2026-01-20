// Main components
export { default as SchemaExplorerPanel } from './SchemaExplorerPanel';
export { default as SchemaExplorerHeader } from './SchemaExplorerHeader';
export { default as MetaDataPanel } from './MetaDataPanel';
export { default as TreeViewPanel } from './TreeViewPanel';

// Dialogs
export { default as CreateTableDialog } from './CreateTableDialog';
export { default as AlterTableDialog } from './AlterTableDialog';
export { default as DropTableDialog } from './DropTableDialog';
export { default as AddIndexesDialog } from './AddIndexesDialog';

// Form components
export { default as TableDesignerForm } from './TableDesignerForm';
export { default as ForeignKeyRow } from './ForeignKeyRow';
export { default as IndexRow } from './IndexRow';

// Metadata detail components
export * from './metadata';

// Types
export type {
    Column,
    TableSchema,
    Schema,
    DatabaseSchema,
    TreeViewPanelProps,
    MetaDataPanelProps,
    TableSelection,
} from './types';
