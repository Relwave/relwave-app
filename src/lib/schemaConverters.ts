import type {
  DatabaseSchemaDetails,
  SchemaGroup,
  TableSchemaDetails,
  ColumnDetails,
} from "@/features/database/types";
import type { SchemaSnapshot, TableSnapshot, ColumnSnapshot } from "@/features/project/types";

// ================================================================
// Shared converters between project snapshot format and live DB format.
// Used by useERDiagramData, useSchemaExplorerData, and useProjectSync.
// ================================================================

/**
 * Convert project SchemaSnapshot[] → DatabaseSchemaDetails
 * (the format that ER diagram and Schema Explorer expect)
 *
 * Note: Snapshots don't store FK/index details — those are only
 * available from a live DB. Columns still carry isPrimaryKey /
 * isForeignKey flags for badge rendering.
 */
export function snapshotToSchemaDetails(
  dbName: string,
  snapshots: SchemaSnapshot[],
): DatabaseSchemaDetails {
  return {
    name: dbName,
    schemas: snapshots.map((snap): SchemaGroup => ({
      name: snap.name,
      tables: snap.tables.map((t): TableSchemaDetails => ({
        name: t.name,
        type: t.type || "BASE TABLE",
        columns: t.columns.map((c): ColumnDetails => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          isPrimaryKey: c.isPrimaryKey,
          isForeignKey: c.isForeignKey,
          isUnique: c.isUnique,
          defaultValue: c.defaultValue,
        })),
      })),
    })),
  };
}

/**
 * Convert live SchemaGroup[] → SchemaSnapshot[] for saving to project files
 */
export function schemaGroupsToSnapshots(groups: SchemaGroup[]): SchemaSnapshot[] {
  return groups.map((sg) => ({
    name: sg.name,
    tables: (sg.tables || []).map((t): TableSnapshot => ({
      name: t.name,
      type: t.type || "BASE TABLE",
      columns: (t.columns || []).map((c): ColumnSnapshot => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable ?? true,
        isPrimaryKey: c.isPrimaryKey ?? false,
        isForeignKey: c.isForeignKey ?? false,
        defaultValue: c.defaultValue ?? null,
        isUnique: c.isUnique ?? false,
      })),
    })),
  }));
}
