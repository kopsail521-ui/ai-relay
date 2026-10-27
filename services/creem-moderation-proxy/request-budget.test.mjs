import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { RequestBudget } from "./request-budget.mjs";

test("parallel and chunked requests cannot exceed the budget; abort releases admission", async t => {
  const budget = new RequestBudget({ maxBytes: 1024, maxRequests: 2, reserveBytes: 1, available: () => Infinity });
  const server = http.createServer(async (req, res) => {
    if (req.url === '/healthz') return res.end('ok');
    let lease;
    try {
      lease = budget.acquire();
      await lease.read(req, 4096);
      res.end('ok');
    } catch (e) { req.resume(); if (!res.destroyed) { res.writeHead(e.status || 400); res.end(e.code || 'aborted'); } }
    finally { lease?.release(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const partial = http.request(base, { method: 'POST', headers: { 'content-length': '900' } });
  partial.on('error', () => {}); partial.write(Buffer.alloc(500));
  while (budget.bytes !== 900) await new Promise(r => setTimeout(r, 5));
  const rejected = await fetch(base, { method: 'POST', body: Buffer.alloc(200) });
  assert.equal(rejected.status, 503);
  assert.equal(budget.bytes, 900);
  assert.equal(await (await fetch(base + '/healthz')).text(), 'ok');
  partial.destroy();
  while (budget.requests) await new Promise(r => setTimeout(r, 5));
  assert.equal(budget.bytes, 0);
  const chunked = await new Promise((resolve, reject) => {
    const req = http.request(base, { method: 'POST', headers: { 'transfer-encoding': 'chunked' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write(Buffer.alloc(700)); req.end(Buffer.alloc(700));
  });
  assert.equal(chunked, 413);
  assert.deepEqual(budget.health(), { active_requests: 0, buffered_bytes: 0, max_requests: 2, max_buffered_bytes: 1024 });
  assert.equal((await fetch(base, { method: 'POST', body: 'small' })).status, 200);
});

test("low host memory rejects before the upload is retained", () => {
  const budget = new RequestBudget({ maxBytes: 1024, maxRequests: 2, reserveBytes: 100, available: () => 110 });
  const lease = budget.acquire();
  assert.throws(() => lease.grow(20), e => e.status === 503);
  lease.release(); lease.release();
  assert.equal(budget.bytes, 0); assert.equal(budget.requests, 0);
});
