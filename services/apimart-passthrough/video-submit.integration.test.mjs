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

test('video submission changes candidates only after definitive model rejection', { timeout: 20000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keyo-video-submit-'));
  const wallet = path.join(tmp, 'wallet.db'), pending = path.join(tmp, 'pending.db');
  for (const filename of ['server.mjs', 'request-budget.mjs', 'video-contracts.mjs', 'task-responses.mjs', 'image-contracts.mjs', 'image-ledger.mjs', 'image-service.mjs', 'catalog.json']) {
    let source = fs.readFileSync(path.join(dir, filename), 'utf8');
    if (filename === 'server.mjs') source = source.replace('loadEnvFile();', '// never read developer or VPS credentials');
    fs.writeFileSync(path.join(tmp, filename), source);
  }
  const guard = path.join(tmp, 'loopback-only.mjs');
  fs.writeFileSync(guard, `const original=globalThis.fetch;globalThis.fetch=(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('External fetch forbidden in offline fixtures');
    return original(input,init);
  };`);
  const db = new DatabaseSync(wallet);
  db.exec(`CREATE TABLE tokens(id INTEGER,user_id INTEGER,key TEXT,name TEXT,status INTEGER,remain_quota INTEGER,used_quota INTEGER,unlimited_quota INTEGER,deleted_at TEXT);
    INSERT INTO tokens VALUES(1,11,'local-valid','local',1,1000000,0,1,NULL);
    CREATE TABLE users(id INTEGER PRIMARY KEY,quota INTEGER,used_quota INTEGER,request_count INTEGER);
    INSERT INTO users VALUES(11,1000000,0,0);`);
  db.close();

  const received = [];
  let replies = [];
  const provider = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks).toString()), authorization: req.headers.authorization });
    const reply = replies.shift();
    if (!reply || reply.disconnect) { req.socket.destroy(); return; }
    res.writeHead(reply.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
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
  async function submit(plan) {
    replies = plan;
    const before = received.length;
    const response = await fetch(origin + '/v1/videos/generations', {
      method: 'POST', headers: { Authorization: 'Bearer sk-local-valid', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'MiniMax-H3', prompt: 'Local test only', aspectRatio: 'portrait',
        resolution: '768p', duration: 5, images: ['https://example.invalid/portrait.jpg'] }),
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json(), requests: received.slice(before) };
  }

  await t.test('aborted upload does not exit the gateway or submit upstream', async () => {
    const count = received.length;
    const partial = http.request(origin + '/v1/videos/generations', { method: 'POST', headers: { Authorization: 'Bearer sk-local-valid', 'content-type': 'application/json', 'content-length': '4096' } });
    partial.on('error', () => {});
    partial.write('{"model":"MiniMax-H3","prompt":"partial');
    for (let i = 0; i < 50; i++) {
      const status = await (await fetch(origin + '/healthz')).json();
      if (status.resources.active_requests === 1) break;
      await new Promise(resolve => setTimeout(resolve, 10));
      if (i === 49) throw new Error('partial upload was not admitted');
    }
    partial.destroy();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(child.exitCode, null);
    assert.equal((await fetch(origin + '/healthz')).status, 200);
    assert.equal(received.length, count);
  });

  for (const status of [200, 202, 500, 502, 503, 504]) await t.test(`HTTP ${status} without task ID submits exactly once`, async () => {
    const result = await submit([
      { status, body: status < 300 ? { status: 'accepted' } : { error: { code: 'model_not_available' } } },
      { status: 200, body: { task_id: 'must-not-be-created' } },
    ]);
    assert.equal(result.requests.length, 1);
    assert.equal(result.status, status < 300 ? 502 : status);
    if (status < 300) {
      assert.equal(result.body.error.code, 'missing_task_id');
      assert.match(result.body.error.message, /unknown.*Do not resubmit.*contact support/i);
    }
  });
  await t.test('a disconnected submission does not try another candidate', async () => {
    const result = await submit([{ disconnect: true }, { status: 200, body: { task_id: 'must-not-be-created' } }]);
    assert.equal(result.requests.length, 1);
    assert.equal(result.status, 502);
  });
  await t.test('a successful task ID is persisted without trying another candidate', async () => {
    const result = await submit([{ status: 200, body: { task_id: 'local-success' } }]);
    assert.equal(result.requests.length, 1);
    assert.equal(result.status, 200);
    assert.equal(result.body.task_id, 'local-success');
    const tasks = new DatabaseSync(pending);
    try { assert.equal(tasks.prepare('SELECT user_id FROM pending WHERE task_id=?').get('local-success').user_id, 11); }
    finally { tasks.close(); }
  });
  for (const status of [400, 404, 422]) await t.test(`definitive model rejection HTTP ${status} can select the next candidate`, async () => {
    const result = await submit([
      { status, body: { error: { code: 'model_not_available' } } },
      { status: 200, body: { task_id: `local-after-${status}` } },
    ]);
    assert.equal(result.requests.length, 2);
    assert.equal(result.status, 200);
    assert.equal(result.body.task_id, `local-after-${status}`);
    assert.notEqual(result.requests[0].body.model, result.requests[1].body.model);
  });
  await t.test('generic validation errors and error responses with an ID do not create replacements', async () => {
    for (const body of [{ error: { code: 'invalid_parameter' } }, { error: { code: 'model_not_available' }, task_id: 'already-created' }]) {
      const result = await submit([{ status: 400, body }, { status: 200, body: { task_id: 'must-not-be-created' } }]);
      assert.equal(result.status, 400);
      assert.equal(result.requests.length, 1);
    }
  });
  assert.ok(received.every(row => row.path === '/v1/videos' && row.authorization === 'Bearer local-provider-only'));
});
