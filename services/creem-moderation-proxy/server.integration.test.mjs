import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import { multipart } from "./media-input.test.mjs";
import { caddyFullSite } from "../../scripts/caddy-seo-shared.mjs";

const models = ['gpt-image-2', 'gpt-image-2-vip', 'gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'nano-banana-2', 'nano-banana-2.1', 'nano-banana-pro'];
const listen = async (server) => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const bodyOf = async (req) => { const chunks = []; for await (const part of req) chunks.push(part); return Buffer.concat(chunks); };
const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };

test('local HTTP integration: moderation, native JSON/multipart, tasks, auth/storage and video routes', { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-proxy-integration-'));
  const catalog = path.join(dir, 'catalog.json');
  fs.writeFileSync(catalog, JSON.stringify({ models: [...models.map(id => ({ id, kind: 'image' })), { id: 'wan3.0-video', kind: 'video' }, { id: 'seedance-2.0-720p', kind: 'video' }] }));
  let authMode = 'valid';
  let nativeMode = 'ok';
  let moderationDecision = 'allow';
  const screened = [], submitted = [], upstreamImages = [], nativeTasks = [], videoRequests = [];
  const upstream = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      if (authMode === 'hang') return;
      if (authMode === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('login'); return; }
      const status = authMode === 'valid' ? 200 : Number(authMode);
      return send(res, status, status === 200 ? { object: 'list', data: [] } : { error: 'auth mock' });
    }
    if (req.url.startsWith('/v1/images/')) { upstreamImages.push({ url: req.url, body: await bodyOf(req), headers: req.headers }); return send(res, 200, { compatibility: true }); }
    if (req.url.startsWith('/v1/videos/')) return send(res, 404, { error: { message: 'Video not found' } });
    return send(res, 200, {});
  });
  const native = http.createServer(async (req, res) => {
    if (req.url.startsWith('/v1/images/tasks/')) {
      nativeTasks.push(req.url);
      if (nativeMode === 'disconnect') { req.socket.destroy(); return; }
      return send(res, 200, { id: 'task-local', status: 'running' }, { 'X-Image-Task-Id': 'task-local', 'Retry-After': '2' });
    }
    if (req.url.startsWith('/v1/videos/')) { videoRequests.push(req.url); await bodyOf(req); return send(res, 200, { id: 'video-local', status: 'running' }); }
    submitted.push({ url: req.url, headers: req.headers, body: JSON.parse((await bodyOf(req)).toString()) });
    if (nativeMode === 'disconnect') { req.socket.destroy(); return; }
    if (nativeMode === 'hang') return;
    return send(res, 202, { id: 'task-local', status: 'running' }, { 'X-Image-Task-Id': 'task-local', 'Location': '/v1/images/tasks/task-local', 'Retry-After': '2', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Existing' });
  });
  const moderation = http.createServer(async (req, res) => {
    const payload = JSON.parse((await bodyOf(req)).toString());
    screened.push(payload);
    send(res, 200, { decision: moderationDecision });
  });
  const upPort = await listen(upstream), nativePort = await listen(native), modPort = await listen(moderation);
  const probe = http.createServer(); const proxyPort = await listen(probe); await new Promise(resolve => probe.close(resolve));
  const preload = path.join(dir, 'mock-fetch.mjs');
  // Actual screenPrompt remains unchanged. Intercept its transport, and forbid
  // every network destination other than local HTTP mocks in this child process.
  fs.writeFileSync(preload, `const realFetch=globalThis.fetch;globalThis.fetch=(input,options)=>{let u=new URL(String(input));if(u.hostname==='test-api.creem.io')u=new URL('http://127.0.0.1:${modPort}'+u.pathname);if(u.hostname!=='127.0.0.1'||u.protocol!=='http:')throw new Error('Nonlocal test request blocked');return realFetch(u,options);};`);
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    cwd: dir,
    env: { SystemRoot: process.env.SystemRoot || '', PATH: process.env.PATH || '', PORT: String(proxyPort), LISTEN_HOST: '127.0.0.1', UPSTREAM_URL: `http://127.0.0.1:${upPort}`, VIDEO_GEN_URL: `http://127.0.0.1:${nativePort}`, VIDEO_CATALOG: catalog,
      CREEM_API_KEY: 'local-mock-key', CREEM_TEST_MODE: 'true', UPLOAD_DIR: 'relative-uploads', UPLOAD_PUBLIC_BASE: `http://127.0.0.1:${proxyPort}/uploads`, UPLOAD_AUTH_TIMEOUT_MS: '100', IMAGE_FORWARD_TIMEOUT_MS: '1000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Proxy startup failed: ' + output)), 5000);
      child.stdout.on('data', chunk => { if (String(chunk).includes('creem-moderation-proxy on')) { clearTimeout(timer); resolve(); } });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Proxy startup exit ' + code + output)); });
    });
    const base = `http://127.0.0.1:${proxyPort}`;
    const post = (endpoint, payload, extra = {}) => fetch(base + endpoint, { method: 'POST', headers: { authorization: 'Bearer local', 'content-type': 'application/json', 'Idempotency-Key': 'local-idempotent-key', ...extra }, body: typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload) });
    assert.equal((await fetch(base + '/healthz')).status, 200);
    for (const endpoint of ['/v1/images/generations', '/v1/images/edits', '/v1/images/tasks/task-local']) {
      const r = await fetch(base + endpoint, { method: 'OPTIONS', headers: { origin: 'https://client.invalid', 'Access-Control-Request-Headers': 'Authorization, Idempotency-Key' } });
      assert.equal(r.status, 204); assert.match(r.headers.get('Access-Control-Allow-Headers'), /Idempotency-Key/);
    }
    for (const model of models) {
      const r = await post('/v1/images/generations', { model, prompt: 'allowed text', replyType: 'async' });
      assert.equal(r.status, 202); assert.equal(r.headers.get('X-Image-Task-Id'), 'task-local');
      assert.equal(r.headers.get('Location'), '/v1/images/tasks/task-local'); assert.equal(r.headers.get('Retry-After'), '2');
      assert.match(r.headers.get('Access-Control-Expose-Headers'), /X-Image-Task-Id/);
      assert.match(r.headers.get('Access-Control-Expose-Headers'), /Existing/);
      assert.equal(submitted.at(-1).body.model, model);
    }
    const bytes = Buffer.from([0, 255, 128, ...Buffer.from('\r\n--local-boundary-extra')]);
    const imageForm = multipart([{ field: 'model', data: models[0] }, { field: 'prompt', data: 'edit with local file' }, { field: 'image', filename: 'local.png', mime: 'image/png', data: bytes }, { field: 'mask', data: 'https://example.invalid/mask.png' }, { field: 'n', data: '1' }]);
    for (const endpoint of ['/v1/images/edits', '/v1/images/generations']) {
      const r = await post(endpoint, imageForm, { 'content-type': 'multipart/form-data; boundary=local-boundary' });
      assert.equal(r.status, 202);
      const last = submitted.at(-1);
      assert.equal(last.headers['content-type'], 'application/json');
      assert.equal(last.headers['idempotency-key'], 'local-idempotent-key');
      assert.equal(last.headers['content-length'], String(Buffer.byteLength(JSON.stringify(last.body))));
      assert.equal(last.body.images[0], 'data:image/png;base64,' + bytes.toString('base64'));
      assert.equal(last.body.mask, 'https://example.invalid/mask.png'); assert.equal(last.body.n, 1);
    }
    assert.ok(screened.some(item => item.prompt === 'edit with local file'));
    assert.ok(screened.every(item => !item.external_id.includes('Bearer') && !item.external_id.includes('local-mock-key')));
    let count = submitted.length;
    moderationDecision = 'deny';
    assert.equal((await post('/v1/images/edits', imageForm, { 'content-type': 'multipart/form-data; boundary=local-boundary' })).status, 400);
    assert.equal(submitted.length, count);
    moderationDecision = 'mystery'; assert.equal((await post('/v1/images/generations', { model: models[0], prompt: 'x' })).status, 503);
    assert.equal(submitted.length, count); moderationDecision = 'allow';
    assert.equal((await post('/v1/images/edits', multipart([{ field: 'model', data: models[0] }, { field: 'image', filename: 'a.png', mime: 'image/png', data: bytes }]), { 'content-type': 'multipart/form-data; boundary=local-boundary' })).status, 400);
    const unsupported = await post('/v1/images/variations', { model: models[0], prompt: 'x' }); assert.equal(unsupported.status, 400); assert.equal((await unsupported.json()).error.code, 'unsupported_image_operation');
    nativeMode = 'disconnect';
    const failed = await post('/v1/images/generations', { model: models[0], prompt: 'x' }); assert.equal(failed.status, 502); assert.equal((await failed.json()).error.code, 'image_forwarding_failed');
    assert.equal(upstreamImages.length, 0);
    const taskFailed = await fetch(base + '/v1/images/tasks/task-local'); assert.equal(taskFailed.status, 502); assert.equal(upstreamImages.length, 0);
    nativeMode = 'hang'; const began = Date.now(); assert.equal((await post('/v1/images/generations', { model: models[0], prompt: 'x' })).status, 502); assert.ok(Date.now() - began < 3000); assert.equal(upstreamImages.length, 0);
    nativeMode = 'ok'; assert.equal((await fetch(base + '/v1/images/tasks/task-local')).status, 200); assert.equal(nativeTasks.at(-1), '/v1/images/tasks/task-local');
    const legacyForm = multipart([{ field: 'model', data: 'other-model' }, { field: 'prompt', data: 'x' }, { field: 'image', filename: 'a.png', mime: 'image/png', data: bytes }]);
    assert.equal((await post('/v1/images/edits', legacyForm, { 'content-type': 'multipart/form-data; boundary=local-boundary' })).status, 200);
    assert.deepEqual(upstreamImages.at(-1).body, legacyForm);
    assert.match(upstreamImages.at(-1).headers['content-type'], /multipart/);
    for (const mode of ['401', '403', '500', '302', 'html', 'hang']) {
      authMode = mode;
      const r = await post('/v1/uploads', { file_base64: 'YQ==', filename: 'tiny.png' });
      assert.equal(r.status, ['401', '403'].includes(mode) ? 401 : 503);
      assert.equal((await r.json()).error.code, ['401', '403'].includes(mode) ? 'invalid_api_key' : 'auth_unavailable');
      assert.deepEqual(fs.readdirSync(path.join(dir, 'relative-uploads')), []);
    }
    authMode = 'valid';
    for (const endpoint of ['/v1/uploads', '/v1/files']) {
      const r = await post(endpoint, { file_base64: 'data:image/png;base64,' + bytes.toString('base64'), filename: 'tiny.png' });
      assert.equal(r.status, 200); const stored = await r.json();
      const read = await fetch(stored.url); assert.equal(read.status, 200); assert.deepEqual(Buffer.from(await read.arrayBuffer()), bytes);
    }
    const invalid = await post('/v1/uploads', { file_base64: 'junk%%%=', filename: 'tiny.png' }); assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error.code, 'invalid_base64');
    const uploadDir = path.join(dir, 'relative-uploads'); fs.rmSync(uploadDir, { recursive: true }); fs.writeFileSync(uploadDir, 'directory failure mock');
    const full = await post('/v1/uploads', { file_base64: 'YQ==', filename: 'tiny.png' }); assert.equal(full.status, 503); const error = (await full.json()).error; assert.equal(error.code, 'storage_unavailable'); assert.ok(error.request_id); assert.ok(output.includes(error.request_id));
    assert.equal((await post('/v1/videos', { model: 'wan3.0-video', prompt: 'x' })).status, 200);
    // Clients that submit to the [OI]-style path must reach the video service
    // too; falling through to New API yields "no available channel".
    assert.equal((await post('/v1/videos/generations', { model: 'seedance-2.0-720p', prompt: 'x', duration: 4 })).status, 200);
    assert.equal((await fetch(base + '/v1/videos/video-local')).status, 200);
    assert.ok(videoRequests.includes('/v1/videos/generations')); assert.ok(videoRequests.includes('/v1/videos/video-local'));
    const caddy = caddyFullSite(); assert.match(caddy, /handle \{\s*reverse_proxy 127\.0\.0\.1:3001/);
    assert.ok(!caddy.match(/@gitee_special[^\n]*\/v1\/images\/tasks/));
  } finally {
    const exited = once(child, 'exit'); child.kill(); await exited;
    for (const server of [upstream, native, moderation]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
