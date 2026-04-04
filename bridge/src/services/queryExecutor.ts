import { DBType, Rpc, QueryParams } from "../types";
import { getConnector } from "./connectorRegistry";
import logger from "./logger";

// Concurrency limit for parallel processing
const PARALLEL_LIMIT = 5;

/**
 * Process items in parallel with a concurrency limit.
 * Results are returned in INPUT ORDER regardless of completion order.
 */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number = PARALLEL_LIMIT
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  if (workerCount === 0) return results;
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/** Map a column row to the canonical shape used by schemaExplorer */
function mapColumn(col: any) {
  return {
    name: col.name,
    type: col.type,
    nullable: !col.not_nullable,
    isPrimaryKey: col.is_primary_key === true,
    isForeignKey: col.is_foreign_key === true,
    defaultValue: col.default_value || null,
    isUnique: false,
  };
}

export class QueryExecutor {
  // Keep direct connector references for cache-clear calls in queryHandlers
  // (e.g. mysqlCache.clearForConnection). These aren't used for dispatch.
  public postgres = getConnector(DBType.POSTGRES) as typeof import("../connectors/postgres");
  public mysql = getConnector(DBType.MYSQL) as typeof import("../connectors/mysql");
  public mariadb = getConnector(DBType.MARIADB) as typeof import("../connectors/mariadb");
  public sqlite = getConnector(DBType.SQLITE) as typeof import("../connectors/sqlite");

  async executeQuery(
    params: QueryParams,
    conn: unknown,
    dbType: DBType,
    rpc: Rpc,
    onCancel: (cancelFn: () => Promise<void>) => void
  ) {
    const { sessionId, sql, batchSize = 200 } = params;
    const connector = getConnector(dbType);

    let totalRows = 0;
    let batchIndex = 0;
    const start = Date.now();
    let lastProgressEmit = Date.now();

    const onBatch = async (rows: unknown[], columns: unknown[]) => {
      totalRows += rows.length;
      rpc.sendNotification?.("query.result", {
        sessionId,
        batchIndex: batchIndex++,
        rows,
        columns,
        complete: false,
      });

      const now = Date.now();
      if (now - lastProgressEmit >= 500) {
        lastProgressEmit = now;
        rpc.sendNotification?.("query.progress", {
          sessionId,
          rowsSoFar: totalRows,
          elapsedMs: now - start,
        });
      }
    };

    const onDone = () => {
      rpc.sendNotification?.("query.done", {
        sessionId,
        rows: totalRows,
        timeMs: Date.now() - start,
        status: "success",
      });
    };

    const runner = (connector as any).streamQueryCancelable(conn, sql, batchSize, onBatch, onDone);
    onCancel(runner.cancel);
    return { runner, totalRows, start };
  }

  async testConnection(conn: unknown, dbType: DBType): Promise<unknown> {
    return (getConnector(dbType) as any).testConnection(conn);
  }

  async listTables(conn: unknown, dbType: DBType, schema?: string) {
    return (getConnector(dbType) as any).listTables(conn, schema);
  }

  async getStats(conn: unknown, dbType: DBType) {
    return (getConnector(dbType) as any).getDBStats(conn);
  }

  async listSchemaNames(conn: unknown, dbType: DBType): Promise<string[]> {
    const result = await (getConnector(dbType) as any).listSchemaNames(conn);
    return result ?? ["public"];
  }

  async listSchemas(conn: unknown, dbType: DBType): Promise<unknown> {
    const connector = getConnector(dbType) as any;
    const schemas: Array<{ name: string }> = await connector.listSchemas(conn);

    const finalSchemas = await parallelMap(schemas, async (schema) => {
      try {
        const tablesInSchema = await connector.listTables(conn, schema.name);
        const batchData = await connector.getSchemaMetadataBatch(conn, schema.name);

        const finalTables = tablesInSchema.map((table: any) => {
          const tableData = batchData.tables.get(table.name);
          return {
            name: table.name,
            type: table.type,
            columns: tableData?.columns.map(mapColumn) ?? [],
            primaryKeys: tableData?.primaryKeys ?? [],
            foreignKeys: tableData?.foreignKeys ?? [],
            indexes: tableData?.indexes ?? [],
            uniqueConstraints: tableData?.uniqueConstraints ?? [],
            checkConstraints: tableData?.checkConstraints ?? [],
          };
        });

        // Merge any DB-type-specific extra fields from batchData
        const extra: Record<string, unknown> = {};
        if (batchData.enumTypes !== undefined) extra.enumTypes = batchData.enumTypes;
        if (batchData.sequences !== undefined) extra.sequences = batchData.sequences;
        if (batchData.enumColumns !== undefined) extra.enumColumns = batchData.enumColumns;
        if (batchData.autoIncrements !== undefined) extra.autoIncrements = batchData.autoIncrements;

        return { name: schema.name, tables: finalTables, ...extra };
      } catch (e: any) {
        logger.warn({ err: e.message, schema: schema.name }, "Skipping schema due to error");
        return null;
      }
    });

    const dbName =
      dbType === DBType.SQLITE
        ? (conn as any).path || (conn as any).database
        : (conn as any).database;

    return { name: dbName, schemas: finalSchemas.filter(Boolean) };
  }
}
