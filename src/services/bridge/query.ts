import { RunQueryParams, TableRow } from "@/features/database/types";
import { bridgeRequest } from "./bridgeClient";

class QueryService {
  /**
   * Executes a streaming/long-running SQL query.
   * The actual results, progress, and completion status are sent via asynchronous notifications
   * (query.started, query.result, query.done, query.error) handled by bridgeClient listeners.
   * @param params - Contains sessionId, dbId, SQL query, and optional batchSize.
   * @returns Promise resolves when the query is successfully *initiated* on the server.
   */
  async runQuery(params: RunQueryParams): Promise<void> {
    try {
      if (!params.sessionId || !params.dbId || !params.sql) {
        throw new Error("sessionId, dbId, and sql are required.");
      }

      // The server returns immediately after starting the background job.
      await bridgeRequest("query.run", params);
    } catch (error: any) {
      console.error("Failed to initiate query execution:", error);
      throw new Error(`Failed to run query: ${error.message}`);
    }
  }

  /**
   * Fetches data from a specific table with pagination support.
   * @param dbId - The ID of the database connection to use.
   * @param schemaName - The schema containing the table (e.g., 'public').
   * @param tableName - The name of the table.
   * @param limit - Number of rows per page.
   * @param page - Page number (1-based).
   * @returns Object with rows array and totalCount.
   */
  async fetchTableData(
    dbId: string,
    schemaName: string,
    tableName: string,
    limit: number,
    page: number,
  ): Promise<{ rows: TableRow[]; total: number }> {
    try {
      if (!dbId || !schemaName || !tableName) {
        throw new Error("Database ID, schema, and table name are required.");
      }
      const result = await bridgeRequest("query.fetchTableData", {
        dbId,
        schemaName,
        tableName,
        limit,
        page,
      });
      return {
        rows: result?.data?.rows || [],
        total: result?.data?.total || result?.data?.rows?.length || 0,
      };
    } catch (error: any) {
      console.error("Failed to fetch table data:", error);
      throw new Error(`Failed to fetch table data: ${error.message}`);
    }
  }
}

export const queryService = new QueryService();
