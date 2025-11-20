// bridge/test/stream_test_client.js (robust to logger JSON on stdout)
const { spawn } = require('child_process');
const path = require('path');

const bridgePath = path.resolve(__dirname, '..', 'dist', 'index.js');
const child = spawn('node', [bridgePath], { stdio: ['pipe','pipe','pipe'] });

child.stderr.on('data', (d) => process.stderr.write(d.toString()));

let buffer = '';
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      handleMessage(obj, line);
    } catch (e) {
      console.log('<< raw ->', line);
    }
  }
});

let nextId = 1;
const pending = new Map();

function sendRequest(method, params) {
  const id = nextId++;
  const req = { id, method, params };
  pending.set(id, { method });
  child.stdin.write(JSON.stringify(req) + '\n');
  return id;
}

// Utility: decide whether object is a log (pino) entry
function isLogObject(obj) {
  // pino outputs keys like level, time, pid, hostname, msg
  return obj && typeof obj === 'object' && ('level' in obj || 'msg' in obj || 'time' in obj) && !('result' in obj) && !('error' in obj);
}

function handleMessage(obj, rawLine) {
  // If it's a pino/console log, print and ignore (do not treat as RPC)
  if (isLogObject(obj)) {
    // optionally print debug logs, or route them to stderr
    console.debug('<< LOG', obj.msg || obj);
    return;
  }

  // notifications (method present, id undefined) — real RPC notifications
  if (obj.method && obj.id === undefined) {
    switch (obj.method) {
      case 'bridge.ready':
        console.log('bridge.ready', obj.params);
        break;
      case 'query.result':
        console.log(`-- batch ${obj.params.batchIndex} rows:${obj.params.rows.length}`);
        console.log('  sample:', obj.params.rows[0]);
        break;
      case 'query.done':
        console.log('>>> query.done', obj.params);
        // exit after done
        child.kill();
        break;
      case 'bridge.parse_error':
        console.warn('parse_error', obj.params);
        break;
      default:
        console.log('notification:', obj.method, obj.params && Object.keys(obj.params).slice(0,3));
    }
    return;
  }

  // responses: only treat as response if id exists AND (result or error) exists
  if (obj.id !== undefined && ('result' in obj || 'error' in obj)) {
    const p = pending.get(obj.id);
    pending.delete(obj.id);
    if (!p) {
      console.log('orphan response', obj);
      return;
    }
    if (p.method === 'query.createSession') {
      if (obj.result && obj.result.data && obj.result.data.sessionId) {
        const sessionId = obj.result.data.sessionId;
        console.log('created session', sessionId);
        runQuery(sessionId);
      } else {
        console.error('createSession failed', obj);
        child.kill();
      }
    } else if (p.method === 'query.run') {
      console.log('query.run started', obj.result);
    } else {
      console.log('response', obj);
    }
    return;
  }

  // If we get here, the message shape is unknown: print raw line for debugging
  console.log('<< unknown message shape ->', rawLine);
}

function runQuery(sessionId) {
  const connection = { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'postgres', database: 'postgres' };
  const sql = 'SELECT generate_series(1,100000) AS n';
  sendRequest('query.run', { sessionId, connection, sql, batchSize: 1000 });
}

// flow: create session -> run query
sendRequest('query.createSession', {});
