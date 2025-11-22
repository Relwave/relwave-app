import React, { useEffect, useState, useRef } from "react";
import { startBridgeListeners, bridgeRequest, isBridgeReady } from "../services/bridgeClient";

// Local mockup path (uploaded asset)

type Row = Record<string, any>;

type Batch = {
    batchIndex: number;
    rows: Row[];
    columns: string[];
};

// --- AESTHETIC IMPROVEMENT: Dark Theme and Modern Styling ---

export default function QueryRunner() {
    // State remains the same
    const [connectionJson, setConnectionJson] = useState<string>(`{\n  "host": "localhost",\n  "port": 5432,\n  "user": "postgres",\n  "password": "",\n  "database": "testdb"\n}`);
    const [sql, setSql] = useState<string>("SELECT * FROM big_table;");
    const [batchSize, setBatchSize] = useState<number>(1000);

    const [sessionId, setSessionId] = useState<string | null>(null);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [streaming, setStreaming] = useState(false);
    const [rowsTotal, setRowsTotal] = useState<number>(0);
    const [statusText, setStatusText] = useState<string>("idle");

    const batchesRef = useRef(batches);
    batchesRef.current = batches;

    // useEffect and handlers remain the same logic, but I've kept them here for a complete, runnable component.

    useEffect(() => {
        // Start bridge listeners once
        startBridgeListeners()
            .then(() => console.log("bridgeClient: Listeners initialized (QueryRunner)"))
            .catch((e) => console.warn("bridgeClient init failed", e));

        // Listen to notifications emitted by bridgeClient (custom events: bridge:method)
        const onResult = (e: any) => {
            const detail = e.detail as any;
            if (!detail || detail.sessionId !== sessionId) return;

            // Normalize columns to strings:
            // `detail.columns` may be either ['id','name'] or [{name:'id'},{name:'name'}]
            let cols: string[] = [];
            if (Array.isArray(detail.columns) && detail.columns.length) {
                cols = detail.columns.map((c: any) => {
                    if (typeof c === "string") return c;
                    // common object shapes:
                    if (c?.name) return String(c.name);
                    if (c?.column) return String(c.column);
                    if (c?.field) return String(c.field);
                    // fallback: stringify but avoid [object Object]
                    try { return JSON.stringify(c); } catch { return String(c); }
                });
            } else if (detail.rows?.length) {
                cols = Object.keys(detail.rows[0]);
            }

            const nextBatch: Batch = {
                batchIndex: detail.batchIndex,
                rows: detail.rows || [],
                columns: cols,
            };

            setBatches((prev) => [...prev, nextBatch]);
            setRowsTotal((t) => t + (detail.rows?.length || 0));
            setStatusText("streaming");
        };


        const onDone = (e: any) => {
            const detail = e.detail as any;
            if (!detail || detail.sessionId !== sessionId) return;
            setStreaming(false);
            setStatusText(detail.status || "done");
            console.log("query.done", detail);
        };

        window.addEventListener("bridge:query.result", onResult as EventListener);
        window.addEventListener("bridge:query.done", onDone as EventListener);

        return () => {
            window.removeEventListener("bridge:query.result", onResult as EventListener);
            window.removeEventListener("bridge:query.done", onDone as EventListener);
        };
    }, [sessionId]);

    async function handleCreateSession() {
        try {
            setStatusText("creating-session");
            const conn = JSON.parse(connectionJson);
            const res = await bridgeRequest("query.createSession", { connection: conn });
            if (res?.ok && res.data?.sessionId) {
                setSessionId(res.data.sessionId);
                setStatusText("session-created");
            } else {
                console.warn("createSession failed", res);
                setStatusText("session-failed");
            }
        } catch (err: any) {
            console.error("createSession err", err);
            setStatusText("session-error");
        }
    }

    async function handleRun() {
        if (!sessionId) {
            await handleCreateSession();
            // wait a tick for session to set
            await new Promise((r) => setTimeout(r, 100));
        }
        if (!sessionId) {
            alert("Unable to create session");
            return;
        }

        // clear previous
        setBatches([]);
        setRowsTotal(0);
        setStreaming(true);
        setStatusText("running");

        try {
            const res = await bridgeRequest("query.run", { sessionId, connection: JSON.parse(connectionJson), sql, batchSize });
            // query.run replies immediately with {ok:true}
            console.log("query.run started", res);
        } catch (err: any) {
            console.error("query.run error", err);
            setStatusText("run-error");
            setStreaming(false);
        }
    }

    async function handleCancel() {
        if (!sessionId) return;
        setStatusText("cancelling");
        try {
            await bridgeRequest("query.cancel", { sessionId });
            setStatusText("cancel-requested");
        } catch (err: any) {
            console.error("cancel error", err);
            setStatusText("cancel-error");
        }
    }

    function exportCsv() {
        // flatten batches into CSV
        const allRows: Row[] = batchesRef.current.flatMap((b) => b.rows || []);
        if (!allRows.length) return;
        const cols = Array.from(new Set(allRows.flatMap((r) => Object.keys(r))));
        const lines = [cols.join(",")];
        for (const r of allRows) {
            const row = cols.map((c) => {
                const v = r[c];
                if (v === null || v === undefined) return "";
                // Handle complex values by stringifying (e.g., objects/arrays)
                const valueString = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
                const s = valueString.replace(/"/g, '""');
                return `"${s}"`;
            });
            lines.push(row.join(","));
        }
        const csv = lines.join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `query_${sessionId || "export"}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // Helper to determine status color
    const getStatusColor = (status: string) => {
        switch (status) {
            case "running":
            case "streaming":
                return "text-yellow-400";
            case "done":
            case "session-created":
                return "text-green-400";
            case "session-failed":
            case "session-error":
            case "run-error":
            case "cancel-error":
                return "text-red-500";
            default:
                return "text-gray-400";
        }
    }

    const sampleColumns = batches.length ? batches[0].columns : [];

    return (
        <div className="bg-gray-900 min-h-screen text-gray-100 p-8">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-extrabold mb-8 text-indigo-400">⚡️ SQL Query Streamer</h1>

                {/* --- Configuration Section --- */}
                <div className="bg-gray-800 p-6 rounded-xl shadow-2xl mb-8 border border-gray-700">
                    <h2 className="text-xl font-semibold mb-4 text-indigo-300">Configuration</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium mb-1 text-gray-300">Connection (JSON)</label>
                            <textarea
                                value={connectionJson}
                                onChange={(e) => setConnectionJson(e.target.value)}
                                rows={8}
                                className="w-full p-3 border border-gray-600 rounded-lg bg-gray-900 text-green-300 font-mono text-sm resize-none focus:ring-2 focus:ring-indigo-500 outline-none transition duration-200"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1 text-gray-300">SQL Statement</label>
                            <textarea
                                value={sql}
                                onChange={(e) => setSql(e.target.value)}
                                rows={8}
                                className="w-full p-3 border border-gray-600 rounded-lg bg-gray-900 text-yellow-300 font-mono text-sm resize-none focus:ring-2 focus:ring-indigo-500 outline-none transition duration-200"
                            />
                        </div>
                    </div>
                </div>

                {/* --- Controls and Status Section --- */}
                <div className="bg-gray-800 p-4 rounded-xl shadow-xl mb-8 border border-gray-700 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-gray-300">Batch Size:</label>
                        <input
                            type="number"
                            value={batchSize}
                            onChange={(e) => setBatchSize(Number(e.target.value))}
                            className="w-24 p-2 border border-gray-600 rounded-lg bg-gray-900 text-center focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    <button
                        onClick={handleCreateSession}
                        className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800 transition duration-150 ease-in-out"
                    >
                        Create Session
                    </button>
                    <button
                        onClick={handleRun}
                        disabled={streaming}
                        className={`px-4 py-2 font-semibold rounded-lg shadow-md transition duration-150 ease-in-out ${streaming
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800'
                            }`}
                    >
                        {streaming ? 'Running...' : '🚀 Run Query'}
                    </button>
                    <button
                        onClick={handleCancel}
                        disabled={!streaming}
                        className={`px-4 py-2 font-semibold rounded-lg shadow-md transition duration-150 ease-in-out ${!streaming
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800'
                            }`}
                    >
                        Stop/Cancel
                    </button>
                    <button
                        onClick={exportCsv}
                        disabled={!batches.length}
                        className={`px-4 py-2 font-semibold rounded-lg shadow-md transition duration-150 ease-in-out ${!batches.length
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-teal-600 text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-gray-800'
                            }`}
                    >
                        ⬇️ Export CSV
                    </button>

                    <div className="ml-auto text-sm">
                        <span className="font-medium text-gray-400">Session ID: </span>
                        <span className="font-mono text-xs p-1 bg-gray-700 rounded-md select-all">{sessionId || 'N/A'}</span>
                    </div>

                    <div className="text-sm text-gray-400 ml-0 md:ml-auto">
                        <span className="font-medium">Status: </span>
                        <span className={`font-bold uppercase tracking-wider ${getStatusColor(statusText)}`}>{statusText}</span>
                        <span className="mx-3">|</span>
                        <span className="font-medium">Rows Total: </span>
                        <span className="font-bold text-indigo-300">{rowsTotal.toLocaleString()}</span>
                    </div>
                </div>

                {/* --- Results Display Section --- */}
                <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-700">
                    <h2 className="text-xl font-semibold mb-4 text-indigo-300">Query Results</h2>

                    <div className="overflow-x-auto max-h-[500px] border border-gray-700 rounded-lg">
                        {batches.length === 0 ? (
                            <div className="p-8 text-center text-lg text-gray-500">
                                🛸 No results loaded. Run a query to stream data here.
                            </div>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700 sticky top-0 z-10 shadow-lg">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-bold text-indigo-300 uppercase tracking-wider border-r border-gray-600 w-16">
                                            Batch
                                        </th>
                                        {sampleColumns.map((c) => (
                                            <th key={`col-${c}`} className="px-4 py-2 text-left text-xs font-bold text-indigo-300 uppercase tracking-wider border-r border-gray-600">
                                                {c}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {batches.flatMap((b) =>
                                        b.rows.map((r, i) => (
                                            <tr
                                                key={`batch-${b.batchIndex}-row-${i}`}
                                                className="hover:bg-gray-700 transition duration-100 even:bg-gray-800/50 odd:bg-gray-900/50"
                                            >
                                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-gray-400 border-r border-gray-700">
                                                    {b.batchIndex}
                                                </td>
                                                {sampleColumns.map((c) => (
                                                    <td key={`batch-${b.batchIndex}-row-${i}-col-${c}`} className="px-4 py-2 whitespace-nowrap text-sm font-mono text-gray-200 border-r border-gray-700 max-w-xs overflow-hidden text-ellipsis">
                                                        {String(r[c] ?? "")}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <div className="mt-4 text-sm text-gray-400">
                        Total Batches Received: <span className="font-bold text-indigo-300">{batches.length}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}