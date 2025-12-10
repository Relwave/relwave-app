import * as postgresConnector from "../connectors/postgres";
import * as mysqlConnector from "../connectors/mysql";
import { DBType, Rpc, QueryParams, DatabaseConfig } from "../types";

export class QueryExecutor {
  constructor(
    public postgres = postgresConnector,
    public mysql = mysqlConnector
  ) {}

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
      return this.mysql.testConnection(conn);
    } else {
      await this.postgres.testConnection(conn);
      return { ok: true };
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

      const finalSchemas = [];
      for (const schema of schemas) {
        const tablesInSchema = await mysqlConnector.listTables(
          conn,
          schema.name
        );
        const finalTables = [];
        for (const table of tablesInSchema) {
          const tableDetails = await mysqlConnector.getTableDetails(
            conn,
            table.schema,
            table.name
          );
          const columns = tableDetails.map((col) => ({
            name: col.name,
            type: col.type,
            nullable: !col.not_nullable,
            isPrimaryKey: col.is_primary_key === true,
            isForeignKey: col.is_foreign_key === true,
            defaultValue: col.default_value || null,
            isUnique: false,
          }));
          finalTables.push({
            name: table.name,
            type: table.type,
            columns: columns,
          });
        }
        finalSchemas.push({
          name: schema.name,
          tables: finalTables,
        });
      }
      const responseData = {
        name: conn.database,
        schemas: finalSchemas,
      };
      return responseData;
    } else {
      const schemas = await postgresConnector.listSchemas(conn);

      const finalSchemas = [];

      for (const schema of schemas) {
        try {
          const tablesInSchema = await postgresConnector.listTables(
            conn,
            schema.name
          );
          const finalTables = [];

          for (const table of tablesInSchema) {
            const tableDetails = await postgresConnector.getTableDetails(
              conn,
              table.schema,
              table.name
            );

            const columns = tableDetails.map((col) => ({
              name: col.name,
              type: col.type,
              nullable: !col.not_nullable,
              isPrimaryKey: col.is_primary_key === true,
              isForeignKey: col.is_foreign_key === true,
              defaultValue: col.default_value || null,
              isUnique: false,
            }));

            finalTables.push({
              name: table.name,
              type: table.type,
              columns: columns,
            });
          }

          finalSchemas.push({
            name: schema.name,
            tables: finalTables,
          });
        } catch (e) {
          // Log and skip schemas that cause errors
          console.warn(
            `Skipping schema ${schema.name} due to error: ${e.message}`
          );
        }
      }

      const responseData = {
        name: conn.database,
        schemas: finalSchemas,
      };
      return responseData;
    }
  }
}
