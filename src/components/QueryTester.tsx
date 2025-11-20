import  { useEffect, useState } from 'react';
import { startBridgeListeners, bridgeRequest } from '../services/bridgeClient';

export function QueryTester() {
    const [logs, setLogs] = useState<string[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [running, setRunning] = useState(false);

    useEffect(() => {
        startBridgeListeners();

        const onBridgeReady = (e: any) => {
            pushLog(`bridge.ready ${JSON.stringify(e.detail)}`);
        };
        const onQueryResult = (e: any) => {
            const p = e.detail;
            pushLog(`batch ${p.batchIndex} rows=${p.rows.length} sample=${JSON.stringify(p.rows[0])}`);
        };
        const onQueryDone = (e: any) => {
            pushLog(`done ${JSON.stringify(e.detail)}`);
            setRunning(false);
        };
        const onQueryProgress = (e: any) => {
            pushLog(`progress ${e.detail.rowsSoFar} rows`);
        };

        window.addEventListener('bridge:bridge.ready', onBridgeReady as EventListener);
        window.addEventListener('bridge:query.result', onQueryResult as EventListener);
        window.addEventListener('bridge:query.done', onQueryDone as EventListener);
        window.addEventListener('bridge:query.progress', onQueryProgress as EventListener);

        return () => {
            window.removeEventListener('bridge:bridge.ready', onBridgeReady as EventListener);
            window.removeEventListener('bridge:query.result', onQueryResult as EventListener);
            window.removeEventListener('bridge:query.done', onQueryDone as EventListener);
            window.removeEventListener('bridge:query.progress', onQueryProgress as EventListener);
        };
    }, []);

    function pushLog(s: string) {
        setLogs((l) => [s, ...l].slice(0, 200));
    }

    async function doPing() {
        try {
            const r = await bridgeRequest('ping', { hello: 'world' });
            pushLog(`ping -> ${JSON.stringify(r)}`);
        } catch (e: any) {
            pushLog(`ping err ${String(e)}`);
        }
    }

    async function createSession() {
        try {
            const r: any = await bridgeRequest('query.createSession', {});
            setSessionId(r.data?.sessionId || r.sessionId || null);
            pushLog(`created session ${JSON.stringify(r)}`);
        } catch (e: any) {
            pushLog(`createSession err ${String(e)}`);
        }
    }

    async function runSampleQuery() {
        if (!sessionId) {
            pushLog('no sessionId, creating one...');
            await createSession();
            await new Promise(r => setTimeout(r, 100));
        }
        const conn = { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'postgres', database: 'postgres' };
        const sql = 'SELECT generate_series(1,100000) AS n';
        setRunning(true);
        try {
            const res = await bridgeRequest('query.run', { sessionId, connection: conn, sql, batchSize: 1000 });
            pushLog(`query.run started ${JSON.stringify(res)}`);
        } catch (e: any) {
            pushLog(`query.run err ${String(e)}`);
            setRunning(false);
        }
    }

    async function cancelQuery() {
        if (!sessionId) { pushLog('no session'); return; }
        try {
            const r = await bridgeRequest('query.cancel', { sessionId });
            pushLog(`cancel response ${JSON.stringify(r)}`);
        } catch (e: any) {
            pushLog(`cancel err ${String(e)}`);
        }
    }

    return (
        <div style={{ padding: 16 }}>
            <h3>Bridge / Query Tester</h3>
            <div style={{ marginBottom: 8 }}>
                <button onClick={doPing}>Ping</button>
                <button onClick={createSession} style={{ marginLeft: 8 }}>Create Session</button>
                <button onClick={runSampleQuery} disabled={running} style={{ marginLeft: 8 }}>Run Sample Query</button>
                <button onClick={cancelQuery} style={{ marginLeft: 8 }}>Cancel</button>
            </div>
            <div style={{ maxHeight: 420, overflow: 'auto', background: '#111', color: '#fff', padding: 8, fontFamily: 'monospace', fontSize: 13 }}>
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
}
