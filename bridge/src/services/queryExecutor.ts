import * as postgresConnector from "../connectors/postgres";
import * as mysqlConnector from "../connectors/mysql";
import { DBType, Rpc, QueryParams, DatabaseConfig } from "../types";

// Concurrency limit for parallel processing
const PARALLEL_LIMIT = 5;

/**
 * Process items in parallel with concurrency limit
 */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number = PARALLEL_LIMIT
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = fn(item).then((result) => {
      results.push(result);
    });

    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
      // Remove completed promises
      for (let i = executing.length - 1; i >= 0; i--) {
        const status = await Promise.race([
          executing[i].then(() => 'fulfilled'),
          Promise.resolve('pending')
        ]);
        if (status === 'fulfilled') {
          executing.splice(i, 1);
        }
      }
    }
  }

  await Promise.all(executing);
  return results;
}

export class QueryExecutor {
  constructor(
    public postgres = postgresConnector,
    public mysql = mysqlConnector
  ) { }

  async executeQuery(
    params: QueryParams,
    conn: DatabaseConfig,
    dbType: DBType,
    rpc: Rpc,
    onCancel: (cancelFn: () => Promise<void>) => void
  ) {
    const { sessionId, sql, batchSize = 200 } = params;

    let totalRows = 0;
    let batchIndex = 0;
    const start = Date.now();
    let lastProgressEmit = Date.now();

    const onBatch = async (rows: any[], columns: any[]) => {
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

    let runner;
    if (dbType === DBType.MYSQL) {
      runner = this.mysql.streamQueryCancelable(
        conn,
        sql,
        batchSize,
        onBatch,
        onDone
      );
    } else {
      runner = this.postgres.streamQueryCancelable(
        conn,
        sql,
        batchSize,
        onBatch,
        onDone
      );
    }

    onCancel(runner.cancel);
    return { runner, totalRows, start };
  }

  async testConnection(conn: DatabaseConfig, dbType: DBType): Promise<any> {
    if (dbType === DBType.MYSQL) {
      return await this.mysql.testConnection(conn);
    } else {
      return await this.postgres.testConnection(conn);

    }
  }

  async listTables(conn: DatabaseConfig, dbType: DBType, schema?: string) {
    if (dbType === DBType.MYSQL) {
      return this.mysql.listTables(conn, schema);
    } else {
      return this.postgres.listTables(conn, schema);
    }
  }

  async getStats(conn: DatabaseConfig, dbType: DBType) {
    if (dbType === DBType.MYSQL) {
      return this.mysql.getDBStats(conn);
    } else {
      return this.postgres.getDBStats(conn);
    }
  }

  async listSchemas(conn: DatabaseConfig, dbType: DBType): Promise<any> {
    if (dbType === DBType.MYSQL) {
      const schemas = await mysqlConnector.listSchemas(conn);

      // Process schemas in parallel with batch queries
      const finalSchemas = await parallelMap(schemas, async (schema) => {
        try {
          // Get tables list
          const tablesInSchema = await mysqlConnector.listTables(conn, schema.name);

          // Use batch query to get all metadata at once
          const batchData = await mysqlConnector.getSchemaMetadataBatch(conn, schema.name);

          const finalTables = tablesInSchema.map((table) => {
            const tableData = batchData.tables.get(table.name);

            const columns = tableData?.columns.map((col) => ({
              name: col.name,
              type: col.type,
              nullable: !col.not_nullable,
              isPrimaryKey: col.is_primary_key === true,
              isForeignKey: col.is_foreign_key === true,
              defaultValue: col.default_value || null,
              isUnique: false,
            })) || [];

            return {
              name: table.name,
              type: table.type,
              columns: columns,
              primaryKeys: tableData?.primaryKeys || [],
              foreignKeys: tableData?.foreignKeys || [],
              indexes: tableData?.indexes || [],
              uniqueConstraints: tableData?.uniqueConstraints || [],
              checkConstraints: tableData?.checkConstraints || [],
            };
          });

          return {
            name: schema.name,
            tables: finalTables,
            enumColumns: batchData.enumColumns,
            autoIncrements: batchData.autoIncrements,
          };
        } catch (e: any) {
          console.warn(`Skipping schema ${schema.name} due to error: ${e.message}`);
          return null;
        }
      });

      return {
        name: conn.database,
        schemas: finalSchemas.filter(Boolean), // Remove null entries from failed schemas
      };
    } else {
      // PostgreSQL - Use optimized batch query
      const schemas = await postgresConnector.listSchemas(conn);

      // Process schemas in parallel with batch queries
      const finalSchemas = await parallelMap(schemas, async (schema) => {
        try {
          // Get tables list
          const tablesInSchema = await postgresConnector.listTables(conn, schema.name);

          // Use batch query to get all metadata at once
          const batchData = await postgresConnector.getSchemaMetadataBatch(conn, schema.name);

          const finalTables = tablesInSchema.map((table) => {
            const tableData = batchData.tables.get(table.name);

            const columns = tableData?.columns.map((col) => ({
              name: col.name,
              type: col.type,
              nullable: !col.not_nullable,
              isPrimaryKey: col.is_primary_key === true,
              isForeignKey: col.is_foreign_key === true,
              defaultValue: col.default_value || null,
              isUnique: false,
            })) || [];

            return {
              name: table.name,
              type: table.type,
              columns: columns,
              primaryKeys: tableData?.primaryKeys || [],
              foreignKeys: tableData?.foreignKeys || [],
              indexes: tableData?.indexes || [],
              uniqueConstraints: tableData?.uniqueConstraints || [],
              checkConstraints: tableData?.checkConstraints || [],
            };
          });

          return {
            name: schema.name,
            tables: finalTables,
            enumTypes: batchData.enumTypes,
            sequences: batchData.sequences,
          };
        } catch (e: any) {
          console.warn(`Skipping schema ${schema.name} due to error: ${e.message}`);
          return null;
        }
      });

      return {
        name: conn.database,
        schemas: finalSchemas.filter(Boolean), // Remove null entries from failed schemas
      };
    }
  }
}
