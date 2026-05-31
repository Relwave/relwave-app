import { ColumnDetails, SelectedTable } from "@/features/database/types";
import { databaseService } from "@/services/bridge/database";
import { queryService } from "@/services/bridge/query";
import { toPng, toSvg } from "html-to-image";
import { useEffect, useState } from "react";
import { toast } from "sonner";


interface QueryResultRow {
    count: string;
}

interface QueryResultColumn {
    name: string
}

export interface QueryResultEventDetail {
    sessionId: string;
    batchIndex: number;
    rows: QueryResultRow[];
    columns: QueryResultColumn[];
    completed: boolean;
}

export const useChartVisualization = (selectedTable: SelectedTable, dbId?: string) => {

    const [chartType, setChartType] = useState<"bar" | "line" | "area" | "pie">("bar");
    const [xAxis, setXAxis] = useState("");
    const [yAxis, setYAxis] = useState("");
    const [chartTitle, setChartTitle] = useState("Query Results Visualization");
    const [columnData, setColumnData] = useState<ColumnDetails[]>([]);
    const [schemaData, setSchemaData] = useState<QueryResultEventDetail | null>(null);
    const [rowData, setRowData] = useState<QueryResultRow[]>([]);
    const [querySessionId, setQuerySessionId] = useState<string | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [queryProgress, setQueryProgress] = useState<any>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);



    const handleExport = async (format: "png" | "svg") => {
        const chartElement = document.getElementById("chart-container");
        if (!chartElement) return;

        try {
            // Determine background based on current theme (simple detection based on dark class presence)
            const isDarkMode = chartElement.closest('.dark');
            const backgroundColor = isDarkMode ? "#050505" : "#FFFFFF"; // Use app background

            const dataUrl = format === "png"
                ? await toPng(chartElement, { quality: 0.95, backgroundColor })
                : await toSvg(chartElement, { backgroundColor });

            const link = document.createElement("a");
            link.download = `chart-${Date.now()}.${format}`;
            link.href = dataUrl;
            link.click();

            toast.success(`Chart exported as ${format.toUpperCase()}`);
        } catch (error) {
            toast.error("Failed to export chart");
            setErrorMessage("Failed to export chart");
        }
    }

    useEffect(() => {
        async function getTables() {
            if (dbId) {
                try {
                    const result = await databaseService.getSchema(dbId);
                    const schemas = result?.schemas

                    schemas?.map((schema) => {
                        if (schema.name === selectedTable?.schema) {
                            schema.tables.map((table) => {
                                if (table.name === selectedTable?.name) {
                                    setColumnData(table.columns);
                                }
                            })
                        }
                    });
                } catch (error) {
                    toast.error("Failed to fetch table schema");
                    setErrorMessage("Failed to fetch table schema");
                }
            }
        }


        getTables();
    }, [selectedTable, dbId]);

    // Execute query when x or y axis changes
    useEffect(() => {
        if (!xAxis || !yAxis) return;

        const executeQuery = async () => {
            // Clear old data immediately when config changes
            setRowData([]);
            setIsExecuting(true);
            setErrorMessage(null);

            try {
                const sessionId = `chart-${Date.now()}`;
                setQuerySessionId(sessionId);

                // X-axis: grouping dimension (non-primary keys like address, name)
                // Y-axis: what we're counting (primary keys like id)
                const sql = `
                        SELECT "${xAxis}" as name, COUNT("${yAxis}") as count 
                        FROM "${selectedTable?.schema}"."${selectedTable?.name}" 
                        GROUP BY "${xAxis}"
                        ORDER BY count DESC
                        LIMIT 50
                    `;

                await queryService.runQuery({
                    sessionId,
                    dbId: dbId || "",
                    sql: sql.trim(),
                    batchSize: 50,
                });

                // Query execution started successfully
            } catch (err: any) {
                console.error("Query execution error:", err);
                setErrorMessage(err.message || "Failed to execute query");
                setIsExecuting(false);
                setRowData([]); // Clear data on error
            }
        };

        executeQuery();
    }, [xAxis, yAxis, selectedTable, dbId]);

    useEffect(() => {
        const handleResult = (event: CustomEvent) => {
            if (event.detail.sessionId !== querySessionId) return;
            setSchemaData(event.detail);
            // Replace data instead of appending to prevent accumulation
            setRowData(event.detail.rows);
            setIsExecuting(false);
        };

        const handleError = (event: CustomEvent) => {
            if (event.detail.sessionId !== querySessionId) return;

            setIsExecuting(false);
            setQuerySessionId(null);
            setQueryProgress(null);
            toast.error("Query failed", { description: event.detail.error?.message || "An error occurred" });
        };

        const eventListeners = [
            { name: 'bridge:query.result', handler: handleResult },
            { name: 'bridge:query.error', handler: handleError },
        ];

        eventListeners.forEach(listener => {
            window.addEventListener(listener.name, listener.handler as EventListener);
        });

        return () => {
            eventListeners.forEach(listener => {
                window.removeEventListener(listener.name, listener.handler as EventListener);
            });
        };
    }, [querySessionId]);

    return {
        handleExport,
        setXAxis,
        setYAxis,
        setChartType,
        setChartTitle,
        errorMessage,
        isExecuting,
        rowData,
        schemaData,
        columnData,
        chartTitle,
        chartType,
        xAxis,
        yAxis,


    };
}