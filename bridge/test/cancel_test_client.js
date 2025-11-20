// bridge/test/cancel_test_client.js
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
      handleMessage(obj);
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

function isLogObject(obj) {
  return obj && typeof obj === 'object' && ('level' in obj || 'msg' in obj || 'time' in obj) && !('result' in obj) && !('error' in obj);
}

function handleMessage(obj) {
  if (isLogObject(obj)) {
    console.debug('<< LOG', obj.msg || obj);
    return;
  }

  if (obj.method && obj.id === undefined) {
    switch (obj.method) {
      case 'bridge.ready':
        console.log('bridge.ready', obj.params);
        break;
      case 'query.started':
        console.log('>>> query.started', obj.params);
        break;
      case 'query.result':
        console.log(`-- batch ${obj.params.batchIndex} rows:${obj.params.rows.length} (sample ${JSON.stringify(obj.params.rows[0])})`);
        break;
      case 'query.progress':
        console.log('*** progress', obj.params);
        break;
      case 'query.done':
        console.log('>>> query.done', obj.params);
        child.kill();
        break;
      default:
        console.log('notification:', obj.method);
    }
    return;
  }

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
        runQueryAndCancel(sessionId);
      } else {
        console.error('createSession failed', obj);
        child.kill();
      }
    } else if (p.method === 'query.run') {
      console.log('query.run started', obj.result);
    } else if (p.method === 'query.cancel') {
      console.log('query.cancel response', obj.result);
    } else {
      console.log('response', obj);
    }
    return;
  }

  console.log('<< unknown shape ->', obj);
}

function runQueryAndCancel(sessionId) {
  const connection = { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'postgres', database: 'postgres' };
  // a long query — streaming many rows
  const sql = 'SELECT generate_series(1,1000000) AS n';
  sendRequest('query.run', { sessionId, connection, sql, batchSize: 5000 });

  // after short delay, send cancel
  setTimeout(() => {
    console.log('-> sending cancel request');
    sendRequest('query.cancel', { sessionId });
  }, 300); // 300ms
}

// start: create session
sendRequest('query.createSession', {});
