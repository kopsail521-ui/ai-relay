import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

test('persisted video routes query the right protocol and retain task ownership', { timeout: 20000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keyo-video-poll-'));
  const wallet = path.join(tmp, 'wallet.db'), pending = path.join(tmp, 'pending.db');
  for (const filename of ['server.mjs', 'request-budget.mjs', 'video-contracts.mjs', 'task-responses.mjs', 'image-contracts.mjs', 'image-ledger.mjs', 'image-service.mjs', 'catalog.json']) {
    let source = fs.readFileSync(path.join(dir, filename), 'utf8');
    if (filename === 'server.mjs') source = source.replace('loadEnvFile();', '// no developer or VPS env in this local fixture');
    fs.writeFileSync(path.join(tmp, filename), source);
  }
  const guard = path.join(tmp, 'loopback-only.mjs');
  fs.writeFileSync(guard, `const original=globalThis.fetch;globalThis.fetch=(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('External fetch forbidden in offline fixtures');
    return original(input,init);
  };`);
  const db = new DatabaseSync(wallet);
  db.exec(`CREATE TABLE tokens(id INTEGER,user_id INTEGER,key TEXT,name TEXT,status INTEGER,remain_quota INTEGER,unlimited_quota INTEGER,deleted_at TEXT);
    INSERT INTO tokens VALUES(1,11,'local-valid','local',1,1000000,1,NULL),(2,22,'local-other','other',1,1000000,1,NULL);`);
  db.close();
  const tasks = new DatabaseSync(pending);
  tasks.exec(`CREATE TABLE pending(task_id TEXT PRIMARY KEY,user_id INTEGER,token_id INTEGER,model TEXT,precharge_usd REAL,settled INTEGER,created_at INTEGER,upstream TEXT);`);
  const put = tasks.prepare('INSERT INTO pending VALUES(?,11,1,?,0,1,1,?)');
  put.run('native-h3', 'MiniMax-H3', 'openlux');
  put.run('native-h3-vip', 'MiniMax-H3-vip', 'openlux');
  put.run('native-missing', 'MiniMax-H3', 'openlux');
  put.run('image-h3', 'MiniMax-H3', 'aicopy');
  put.run('seedance-480', 'seedance-2.5', 'aicopy');
  tasks.close();

  const received = [];
  const provider = http.createServer((req, res) => {
    received.push({ url: req.url, authorization: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/minimax/v2/query/video_generation/native-missing') {
      res.writeHead(404); res.end('{"error":{"message":"local task missing"}}');
    } else if (/^\/minimax\/v2\/query\/video_generation\/native-h3(?:-vip)?$/.test(req.url)) {
      res.end(JSON.stringify({ task: { id: req.url.split('/').pop(), status: 'succeeded', content: { url: 'https://cdn.example.test/video.mp4' } } }));
    } else if (/^\/v1\/videos\/(?:image-h3|seedance-480)$/.test(req.url)) {
      res.end('{"status":"completed","url":"https://cdn.example.test/video.mp4"}');
    } else { res.writeHead(404); res.end('{"error":{"message":"wrong local protocol"}}'); }
  });
  const providerPort = await listen(provider);
  const probe = http.createServer(), servicePort = await listen(probe);
  await close(probe);
  const child = spawn(process.execPath, ['--import', pathToFileURL(guard).href, path.join(tmp, 'server.mjs')], {
    cwd: tmp,
    env: { ...process.env, PORT: String(servicePort), LISTEN_HOST: '127.0.0.1',
      NEW_API_DB: wallet, APIMART_PENDING_DB: pending, CATALOG: path.join(tmp, 'catalog.json'),
      NEW_API_BASE: `http://127.0.0.1:${providerPort}`,
      ...Object.fromEntries(['APIMART', 'OPENLUX', 'GRSAI', 'AIONE', 'AICOPY'].flatMap(name => [
        [name + '_BASE_URL', `http://127.0.0.1:${providerPort}`], [name + '_API_KEY', 'local-provider-only'],
      ])),
    }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', part => { output += part; });
  child.stderr.on('data', part => { output += part; });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await close(provider);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${servicePort}`;
  for (let i = 0; ; i++) {
    if (child.exitCode !== null) throw new Error('Local video fixture exited: ' + output);
    try { if ((await fetch(origin + '/healthz')).ok) break; } catch {}
    if (i === 99) throw new Error('Local video fixture did not start: ' + output);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  for (const id of ['native-h3', 'native-h3-vip', 'image-h3', 'seedance-480']) {
    const response = await fetch(origin + '/v1/tasks/' + id, { headers: { Authorization: 'Bearer sk-local-valid' } });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'completed');
    assert.equal(body.id, id);
    assert.equal(body.url, 'https://cdn.example.test/video.mp4');
  }
  assert.deepEqual(received.map(row => row.url), [
    '/minimax/v2/query/video_generation/native-h3', '/minimax/v2/query/video_generation/native-h3-vip',
    '/v1/videos/image-h3', '/v1/videos/seedance-480',
  ]);
  assert.ok(received.every(row => row.authorization === 'Bearer local-provider-only'));
  const before = received.length;
  const forbidden = await fetch(origin + '/v1/tasks/native-h3', { headers: { Authorization: 'Bearer sk-local-other' } });
  assert.equal(forbidden.status, 404);
  assert.equal(received.length, before, 'Other accounts must not query a provider task');
  const missing = await fetch(origin + '/v1/tasks/native-missing', { headers: { Authorization: 'Bearer sk-local-valid' } });
  assert.equal(missing.status, 404);
  assert.equal(received.length, before + 1, 'Native MiniMax task misses must not be retried at another provider');
});
