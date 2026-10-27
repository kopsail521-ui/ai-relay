import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import test from "node:test";
import { ImageError, ImageLedger, imageClientIp } from "./image-ledger.mjs";
import { ImageService } from "./image-service.mjs";

// Mirrors the isolated gateway fixture's New API columns. No env files, real
// wallet paths, provider credentials or network connections are used here.
const MODEL = "nano-banana-2";
const ORIGIN = "http://127.0.0.1:1";
const INITIAL = 1000000;
const COST = 10000;
const TTL = 120;
const RESULT = { created: 1000, data: [{ url: "https://example.invalid/image.png" }] };
const IP = "127.0.0.1";

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keyo-image-ledger-test-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const dbPath = path.join(temp, "wallet.db");
  const ackDir = path.join(temp, "acks");
  let now = 1000;
  const config = { reservationTtl: TTL, dedupSeconds: 300, clock: () => now, ackDir };
  const ledger = new ImageLedger(dbPath, config);
  function database(fn) {
    const db = new DatabaseSync(dbPath);
    try { return fn(db); } finally { db.close(); }
  }
  database((db) => {
    db.exec(`
      CREATE TABLE users(id INTEGER PRIMARY KEY,status INTEGER,quota INTEGER,used_quota INTEGER DEFAULT 0,request_count INTEGER DEFAULT 0,"group" TEXT,deleted_at TEXT);
      CREATE TABLE tokens(id INTEGER PRIMARY KEY,user_id INTEGER,key TEXT,name TEXT,status INTEGER,expired_time INTEGER,remain_quota INTEGER,unlimited_quota INTEGER,used_quota INTEGER DEFAULT 0,model_limits_enabled INTEGER DEFAULT 0,model_limits TEXT DEFAULT '',allow_ips TEXT DEFAULT '',"group" TEXT,auto_groups TEXT DEFAULT '',deleted_at TEXT);
      CREATE TABLE options(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE channels(id INTEGER PRIMARY KEY,status INTEGER,base_url TEXT,name TEXT);
      CREATE TABLE abilities(channel_id INTEGER,model TEXT,"group" TEXT,enabled INTEGER,priority INTEGER DEFAULT 0,weight INTEGER DEFAULT 1);
      CREATE TABLE logs(user_id INTEGER,created_at INTEGER,type INTEGER,content TEXT,username TEXT,token_name TEXT,model_name TEXT,quota INTEGER,prompt_tokens INTEGER,completion_tokens INTEGER,use_time INTEGER,is_stream INTEGER,channel_id INTEGER,token_id INTEGER,"group" TEXT,ip TEXT,request_id TEXT,upstream_request_id TEXT,other TEXT);
    `);
    for (const id of [1, 2]) db.prepare('INSERT INTO users(id,status,quota,"group") VALUES(?,1,?,\'default\')').run(id, INITIAL);
    // Tokens 1 and 2 share a user; token 3 belongs to a different user.
    for (const [id, user] of [[1, 1], [2, 1], [3, 2]]) {
      db.prepare('INSERT INTO tokens(id,user_id,key,name,status,expired_time,remain_quota,unlimited_quota,"group") VALUES(?,?,?,?,1,-1,?,0,\'default\')')
        .run(id, user, `fixture-${id}`, `token-${id}`, INITIAL);
    }
    db.prepare("INSERT INTO channels(id,status,base_url,name) VALUES(1,1,?,'fixture')").run(ORIGIN);
    db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(1,?,\'default\',1)').run(MODEL);
    for (const [key, value] of Object.entries({ ModelPrice: { [MODEL]: 0.02 }, GroupRatio: { default: 1 }, UserUsableGroups: { default: "Default" } })) {
      db.prepare("INSERT INTO options(key,value) VALUES(?,?)").run(key, JSON.stringify(value));
    }
  });
  function reserve(overrides = {}) {
    return ledger.reserve({ apiKey: "sk-fixture-1", model: MODEL, requestHash: "fixture-request", ip: IP, origin: ORIGIN, ...overrides });
  }
  function ready(overrides) {
    const { row } = reserve(overrides);
    assert.equal(ledger.submitting(row.id, 30), true);
    ledger.submitted(row.id, `upstream-${row.id}`);
    ledger.ready(row.id, RESULT);
    return ledger.get(row.id);
  }
  function wallet(userId = 1, tokenId = 1) {
    return database((db) => ({
      user: { ...db.prepare("SELECT quota,used_quota,request_count FROM users WHERE id=?").get(userId) },
      token: { ...db.prepare("SELECT remain_quota,used_quota FROM tokens WHERE id=?").get(tokenId) },
      logs: db.prepare("SELECT * FROM logs WHERE type=2").all(),
    }));
  }
  return { temp, dbPath, ackDir, ledger, database, reserve, ready, wallet,
    advance: (seconds) => { now += seconds; },
    restart: () => new ImageLedger(dbPath, config),
  };
}
function errorCode(code, status) {
  return (e) => e instanceof ImageError && e.code === code && (status === undefined || e.status === status);
}
function uncharged(f, reserved = 0) {
  const wallet = f.wallet();
  assert.deepEqual(wallet.user, { quota: INITIAL - reserved, used_quota: 0, request_count: 0 });
  assert.deepEqual(wallet.token, { remain_quota: INITIAL - reserved, used_quota: 0 });
  assert.equal(wallet.logs.length, 0);
}
function chargedOnce(f, id) {
  const wallet = f.wallet();
  assert.deepEqual(wallet.user, { quota: INITIAL - COST, used_quota: COST, request_count: 1 });
  assert.deepEqual(wallet.token, { remain_quota: INITIAL - COST, used_quota: COST });
  assert.equal(wallet.logs.length, 1);
  const log = wallet.logs[0];
  assert.equal(log.request_id, id);
  assert.equal(log.upstream_request_id, `upstream-${id}`);
  assert.equal(log.token_id, 1);
  assert.equal(log.user_id, 1);
  assert.equal(log.quota, COST);
  assert.equal(log.model_name, MODEL);
  assert.deepEqual(JSON.parse(log.other), { source: "native_image", task_id: id });
  const row = f.ledger.get(id);
  assert.equal(row.charged, 1);
  assert.equal(row.reserved, 0);
  assert.deepEqual(JSON.parse(row.result), RESULT);
}
function service(t, ledger, fetchImpl) {
  const svc = new ImageService({ ledger, models: { [MODEL]: { id: MODEL, kind: "image", upstream: "grsai" } },
    origin: ORIGIN, key: "fixture-provider-key", fetchImpl, pollIntervalMs: 1, transportMs: 100, waitMs: 100 });
  t.after(() => svc.stop());
  return svc;
}

test("worker saturation rejects before billing; deadline releases media without resubmitting", { timeout: 10000 }, async t => {
  const f = fixture(t);
  let posts = 0, polls = 0, complete = false;
  const fetchImpl = async (url, options) => {
    if (options.method === 'POST') { posts++; return Response.json({ id: 'bounded-upstream', status: 'running' }); }
    polls++;
    return Response.json(complete ? { status: 'succeeded', results: [{ url: 'https://example.invalid/complete.png' }] } : { status: 'running' });
  };
  const svc = new ImageService({ ledger: f.ledger, models: { [MODEL]: { id: MODEL, kind: 'image' } }, origin: ORIGIN, key: 'fixture', fetchImpl, maxJobs: 1, maxJobMs: 250, pollIntervalMs: 5 });
  t.after(() => svc.stop());
  const first = await request(svc);
  assert.equal(first.status, 202);
  assert.equal(svc.budget.requests, 1, 'async response must retain the media budget');
  const second = await request(svc, { idempotencyKey: 'another', body: { model: MODEL, prompt: 'another', replyType: 'async' } });
  assert.equal(second.status, 503);
  assert.equal(posts, 1);
  uncharged(f, COST);
  await Promise.all([...svc.jobs.values()]);
  assert.equal(svc.jobs.size, 0); assert.equal(svc.budget.requests, 0);
  assert.equal(f.ledger.get(first.body.task_id).state, 'running');
  assert.equal(f.ledger.get(first.body.task_id).upstream_id, 'bounded-upstream');
  const count = polls;
  f.advance(1000);
  const restarted = new ImageService({ ledger: f.ledger, models: {}, origin: ORIGIN, key: 'fixture', fetchImpl, maxJobMs: 250 });
  t.after(() => restarted.stop());
  restarted.recover();
  assert.equal(restarted.jobs.size, 0, 'expired tasks do not restart automatic polling');
  assert.equal(polls, count);
  complete = true;
  await request(restarted, { method: 'GET', url: '/v1/images/tasks/' + first.body.task_id });
  await Promise.all([...restarted.jobs.values()]);
  assert.equal(f.ledger.get(first.body.task_id).state, 'ready');
  assert.equal(posts, 1, 'querying a paused task never creates another generation');
});
async function request(svc, { method = "POST", url = "/v1/images/generations", token = 1, idempotencyKey = "fixture-key", body = { model: MODEL, prompt: "fixture prompt", replyType: "async" } } = {}) {
  const req = { method, url, socket: { remoteAddress: IP }, headers: { authorization: `Bearer sk-fixture-${token}`, ...(idempotencyKey === null ? {} : { "idempotency-key": idempotencyKey }) } };
  const res = new EventEmitter();
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers; };
  res.end = (text) => { res.body = JSON.parse(text); res.writableEnded = true; res.emit("finish"); };
  await svc.handle(req, res, body);
  return res;
}

test("reserve and idempotent replay hold funds without consuming quota or logging", (t) => {
  const f = fixture(t);
  const first = f.reserve({ idempotencyKey: "once" });
  assert.equal(first.fresh, true);
  assert.equal(first.row.state, "reserved");
  assert.equal(first.row.quota, COST);
  assert.equal(first.row.reserved_until, 1000 + TTL);
  uncharged(f, COST);
  for (const overrides of [{ idempotencyKey: "once" }, {}]) {
    const replay = f.reserve(overrides);
    assert.equal(replay.fresh, false);
    assert.equal(replay.row.id, first.row.id);
  }
  assert.throws(() => f.reserve({ idempotencyKey: "once", requestHash: "different" }), errorCode("idempotency_conflict", 409));
  uncharged(f, COST);
});

test("failure and repeated failure release a reservation exactly once", (t) => {
  const f = fixture(t);
  const { row } = f.reserve();
  f.ledger.submitting(row.id, 30);
  f.ledger.submitted(row.id, "upstream-failed");
  f.ledger.failed(row.id, "image_policy_rejected");
  f.ledger.failed(row.id);
  f.advance(TTL + 1);
  const failed = f.ledger.get(row.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.error_code, "image_policy_rejected");
  assert.equal(failed.reserved, 0);
  uncharged(f);
});

test("reservation expires at the TTL boundary and repeated expiry does not refund twice", (t) => {
  const f = fixture(t);
  const { row } = f.reserve();
  f.advance(TTL - 1);
  assert.equal(f.ledger.get(row.id).reserved, 1);
  uncharged(f, COST);
  f.advance(1);
  assert.equal(f.ledger.get(row.id).reserved, 0);
  f.advance(100);
  f.ledger.get(row.id);
  f.ledger.failed(row.id);
  uncharged(f);
});

test("ready result persists across expiry and restart, then reserves again for delivery", (t) => {
  const f = fixture(t);
  const row = f.ready({ idempotencyKey: "completed" });
  f.advance(TTL);
  const restarted = f.restart();
  const expired = restarted.get(row.id, { tokenId: 1, userId: 1 });
  assert.equal(expired.state, "ready");
  assert.equal(expired.reserved, 0);
  assert.deepEqual(JSON.parse(expired.result), RESULT);
  uncharged(f);
  assert.equal(f.reserve({ idempotencyKey: "completed" }).fresh, false);
  restarted.prepareDelivery(row.id);
  restarted.prepareDelivery(row.id);
  const reserved = restarted.get(row.id);
  assert.equal(reserved.reserved, 1);
  assert.equal(reserved.reserved_until, 1000 + 2 * TTL);
  uncharged(f, COST);
  restarted.acknowledge(row.id);
  chargedOnce(f, row.id);
  f.advance(TTL + 60);
  restarted.prepareDelivery(row.id);
  restarted.acknowledge(row.id);
  chargedOnce(f, row.id);
});

for (const limitedBy of ["user", "token"]) {
  test(`ready result re-reservation checks current ${limitedBy} balance and rolls back on shortage`, (t) => {
    const f = fixture(t);
    const row = f.ready();
    f.advance(TTL);
    f.ledger.get(row.id);
    f.database((db) => db.exec(limitedBy === "user" ? `UPDATE users SET quota=${COST - 1} WHERE id=1` : `UPDATE tokens SET remain_quota=${COST - 1} WHERE id=1`));
    const before = f.wallet();
    assert.throws(() => f.ledger.prepareDelivery(row.id), errorCode("insufficient_quota", 403));
    assert.deepEqual(f.wallet(), before);
    const retained = f.ledger.get(row.id);
    assert.equal(retained.reserved, 0);
    assert.equal(retained.charged, 0);
    assert.equal(retained.lease_until, 0);
    assert.deepEqual(JSON.parse(retained.result), RESULT);
    f.database((db) => db.exec("UPDATE users SET quota=1000000 WHERE id=1; UPDATE tokens SET remain_quota=1000000 WHERE id=1"));
    f.ledger.prepareDelivery(row.id);
    f.ledger.acknowledge(row.id);
    chargedOnce(f, row.id);
  });
}

test("delivery lease prevents TTL release during a response, but eventually expires", (t) => {
  const f = fixture(t);
  const row = f.ready();
  f.advance(TTL - 1);
  f.ledger.prepareDelivery(row.id);
  f.advance(1);
  assert.equal(f.ledger.get(row.id).reserved, 1);
  uncharged(f, COST);
  f.advance(58);
  assert.equal(f.ledger.get(row.id).reserved, 1);
  f.advance(1);
  assert.equal(f.ledger.get(row.id).reserved, 0);
  uncharged(f);
});

test("duplicate delivery, ACK and restarted replay consume quota and log only once", (t) => {
  const f = fixture(t);
  const row = f.ready();
  f.ledger.prepareDelivery(row.id);
  f.ledger.delivered(row.id);
  for (const ledger of [f.ledger, f.restart()]) {
    ledger.delivered(row.id);
    ledger.prepareDelivery(row.id);
    ledger.acknowledge(row.id);
  }
  chargedOnce(f, row.id);
  assert.deepEqual(fs.readdirSync(f.ackDir), []);
});

test("independent workers racing re-reservation and settlement produce one consume log", { timeout: 20000 }, async (t) => {
  const f = fixture(t);
  const row = f.ready();
  f.advance(TTL);
  f.ledger.get(row.id);
  uncharged(f);
  const gate = new SharedArrayBuffer(4);
  const workers = Array.from({ length: 4 }, () => new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { ImageLedger } = await import(workerData.module);
      const ledger = new ImageLedger(workerData.dbPath, {
        ackDir: workerData.ackDir, reservationTtl: workerData.ttl,
        clock: () => workerData.now,
      });
      parentPort.postMessage('ready');
      Atomics.wait(new Int32Array(workerData.gate), 0, 0);
      for (let i = 0; i < 3; i++) {
        ledger.prepareDelivery(workerData.id);
        ledger.delivered(workerData.id);
      }
    })().catch((e) => { throw e; });
  `, { eval: true, workerData: { module: new URL("./image-ledger.mjs", import.meta.url).href, dbPath: f.dbPath,
    ackDir: f.ackDir, ttl: TTL, now: 1000 + TTL, id: row.id, gate } }));
  t.after(async () => { await Promise.all(workers.map((worker) => worker.terminate())); });
  const ready = workers.map((worker) => new Promise((resolve, reject) => {
    worker.once("message", resolve); worker.once("error", reject);
  }));
  const done = workers.map((worker) => new Promise((resolve, reject) => {
    worker.once("error", reject);
    worker.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Settlement worker exited ${code}`)));
  }));
  // Observe exit errors even if startup fails before all workers reach the gate.
  const completed = Promise.allSettled(done);
  await Promise.all(ready);
  Atomics.store(new Int32Array(gate), 0, 1);
  Atomics.notify(new Int32Array(gate), 0);
  for (const result of await completed) if (result.status === "rejected") throw result.reason;
  chargedOnce(f, row.id);
});

test("ACK survives unavailable SQLite and restart drains it before reservation expiry", (t) => {
  const f = fixture(t);
  const row = f.ready();
  f.ledger.prepareDelivery(row.id);
  const backup = path.join(f.temp, "wallet-offline.db");
  fs.renameSync(f.dbPath, backup);
  try {
    assert.throws(() => f.ledger.acknowledge(row.id), errorCode("image_billing_unavailable", 503));
    assert.equal(fs.readFileSync(f.ledger.ackPath(row.id), "utf8"), row.id);
    assert.equal(fs.existsSync(f.dbPath), false, "outage must not create an empty wallet");
  } finally { fs.renameSync(backup, f.dbPath); }
  uncharged(f, COST);
  f.advance(TTL + 60);
  const restarted = f.restart();
  restarted.recoverable();
  chargedOnce(f, row.id);
  assert.equal(fs.existsSync(restarted.ackPath(row.id)), false);
  restarted.recoverable();
  restarted.acknowledge(row.id);
  chargedOnce(f, row.id);
});

test("failed settlement transaction rolls back accounting and retains ACK until recovery commits", (t) => {
  const f = fixture(t);
  const row = f.ready();
  f.ledger.prepareDelivery(row.id);
  f.database((db) => db.exec("CREATE TRIGGER reject_consume BEFORE INSERT ON logs BEGIN SELECT RAISE(ABORT,'fixture write failure'); END"));
  assert.throws(() => f.ledger.acknowledge(row.id), errorCode("image_billing_unavailable", 503));
  uncharged(f, COST);
  assert.equal(fs.readFileSync(f.ledger.ackPath(row.id), "utf8"), row.id);
  const restarted = f.restart();
  assert.throws(() => restarted.recoverable(), errorCode("image_billing_unavailable", 503));
  uncharged(f, COST);
  assert.equal(fs.existsSync(restarted.ackPath(row.id)), true);
  f.database((db) => db.exec("DROP TRIGGER reject_consume"));
  restarted.recoverable();
  chargedOnce(f, row.id);
  assert.equal(fs.existsSync(restarted.ackPath(row.id)), false);
});

test("recovery converts abandoned reserved/submitting tasks to submit_unknown without resubmission", async (t) => {
  const f = fixture(t);
  const reserved = f.reserve({ requestHash: "never-submitted", idempotencyKey: "reserved" }).row;
  const submitting = f.reserve({ requestHash: "uncertain", idempotencyKey: "submitting" }).row;
  f.ledger.submitting(submitting.id, 30);
  const restarted = f.restart();
  assert.deepEqual(restarted.recoverable(), []);
  assert.equal(restarted.get(reserved.id).state, "submit_unknown");
  assert.equal(restarted.get(submitting.id).state, "submitting");
  uncharged(f, COST);
  f.advance(30);
  assert.deepEqual(restarted.recoverable(), []);
  for (const row of [reserved, submitting]) {
    const unknown = restarted.get(row.id);
    assert.equal(unknown.state, "submit_unknown");
    assert.equal(unknown.error_code, "image_submission_unknown");
    assert.equal(unknown.reserved, 0);
    assert.equal(restarted.submitting(row.id, 30), false);
  }
  f.advance(1000); // Unknown outcomes remain deduplicated beyond the ordinary window.
  for (const row of [reserved, submitting]) {
    const replay = f.reserve({ requestHash: row.request_hash });
    assert.equal(replay.fresh, false);
    assert.equal(replay.row.id, row.id);
  }
  let calls = 0;
  const svc = service(t, restarted, async () => { calls++; throw new Error("Unexpected transport"); });
  svc.recover();
  for (const row of [reserved, submitting]) await svc.startJob(restarted.get(row.id), { prompt: "must not submit" });
  assert.equal(calls, 0);
  uncharged(f);
});

test("uncertain native submit is posted once; repeat POST, GET and restart replay its terminal error", async (t) => {
  const f = fixture(t);
  let posts = 0;
  const svc = service(t, f.ledger, async (_url, init) => {
    assert.equal(init.method, "POST");
    posts++;
    throw new Error("fixture connection lost after submission");
  });
  const initial = await request(svc);
  assert.equal(initial.status, 202);
  const id = initial.body.task_id;
  await Promise.all([...svc.jobs.values()]);
  assert.equal(f.ledger.get(id).state, "submit_unknown");
  f.advance(1000);
  const restarted = service(t, f.restart(), async () => { posts++; throw new Error("Unexpected resubmission"); });
  restarted.recover();
  for (const options of [{}, { idempotencyKey: null }, { method: "GET", url: `/v1/images/tasks/${id}` }]) {
    const response = await request(restarted, options);
    assert.equal(response.status, 502);
    assert.equal(response.body.error.code, "image_submission_unknown");
    assert.equal(response.body.error.task_id, id);
    await Promise.all([...restarted.jobs.values()]);
  }
  assert.equal(posts, 1);
  uncharged(f);
});

test("running recovery polls the persisted upstream ID without generating again", async (t) => {
  const f = fixture(t);
  const { row } = f.reserve();
  f.ledger.submitting(row.id, 30);
  f.ledger.submitted(row.id, "existing-upstream");
  f.advance(TTL);
  const restarted = f.restart();
  const calls = [];
  const svc = service(t, restarted, async (url, init) => {
    calls.push({ url, method: init.method });
    return Response.json({ status: "completed", results: [RESULT.data[0].url] });
  });
  svc.recover();
  await Promise.all([...svc.jobs.values()]);
  assert.deepEqual(calls, [{ url: `${ORIGIN}/v1/api/result?id=existing-upstream`, method: "GET" }]);
  const recovered = restarted.get(row.id);
  assert.equal(recovered.state, "ready");
  assert.equal(recovered.reserved, 0);
  assert.deepEqual(JSON.parse(recovered.result), RESULT);
  uncharged(f);
});

test("task access validates both token and user; identical idempotency keys stay token scoped", async (t) => {
  const f = fixture(t);
  const row = f.ready({ idempotencyKey: "shared-key" });
  const owner = f.ledger.authenticate("sk-fixture-1", MODEL, IP);
  assert.equal(f.ledger.get(row.id, owner).id, row.id);
  for (const auth of [{ tokenId: 2, userId: 1 }, { tokenId: 1, userId: 2 }, { tokenId: 3, userId: 2 }]) {
    assert.throws(() => f.ledger.get(row.id, auth), errorCode("image_task_not_found", 404));
  }
  let calls = 0;
  const svc = service(t, f.ledger, async () => { calls++; throw new Error("Unexpected transport"); });
  for (const token of [2, 3]) {
    const response = await request(svc, { method: "GET", url: `/v1/images/tasks/${row.id}`, token });
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "image_task_not_found");
  }
  assert.equal(calls, 0);
  uncharged(f, COST);
  const second = f.reserve({ apiKey: "sk-fixture-2", idempotencyKey: "shared-key" });
  const third = f.reserve({ apiKey: "sk-fixture-3", idempotencyKey: "shared-key" });
  assert.equal(second.fresh, true);
  assert.equal(third.fresh, true);
  assert.equal(new Set([row.id, second.row.id, third.row.id]).size, 3);
  assert.equal(f.wallet(1, 2).user.quota, INITIAL - 2 * COST);
  assert.equal(f.wallet(1, 2).token.remain_quota, INITIAL - COST);
  assert.equal(f.wallet(2, 3).user.quota, INITIAL - COST);
  assert.equal(f.wallet(2, 3).token.remain_quota, INITIAL - COST);
  assert.equal(f.wallet().logs.length, 0);
});

test("token and user restrictions reject before any wallet reservation", (t) => {
  const f = fixture(t);
  for (const key of ["sk-FIXTURE-1", "sk-fixture-1.channel", " sk-fixture-1", "sk-fixture-1 "]) {
    assert.throws(() => f.reserve({ apiKey: key }), errorCode("invalid_api_key", 401));
  }
  for (const [change, restore, code, status] of [
    ["UPDATE tokens SET expired_time=1000 WHERE id=1", "UPDATE tokens SET expired_time=-1 WHERE id=1", "invalid_api_key", 401],
    ["UPDATE tokens SET status=2 WHERE id=1", "UPDATE tokens SET status=1 WHERE id=1", "invalid_api_key", 401],
    ["UPDATE users SET status=2 WHERE id=1", "UPDATE users SET status=1 WHERE id=1", "user_disabled", 403],
    ["UPDATE tokens SET model_limits_enabled=1,model_limits='different-model' WHERE id=1", "UPDATE tokens SET model_limits_enabled=0 WHERE id=1", "model_not_allowed", 403],
    ["UPDATE tokens SET allow_ips='192.0.2.0/24' WHERE id=1", "UPDATE tokens SET allow_ips='' WHERE id=1", "ip_not_allowed", 403],
    ["UPDATE tokens SET \"group\"='unavailable' WHERE id=1", "UPDATE tokens SET \"group\"='default' WHERE id=1", "group_not_allowed", 403],
    ["UPDATE abilities SET enabled=0", "UPDATE abilities SET enabled=1", "image_channel_unavailable", 503],
  ]) {
    f.database((db) => db.exec(change));
    assert.throws(() => f.reserve(), errorCode(code, status));
    uncharged(f);
    f.database((db) => db.exec(restore));
  }
  assert.equal(f.database((db) => db.prepare("SELECT COUNT(*) AS count FROM keyo_image_tasks").get().count), 0);
});

test("forwarded IP honours only configured proxy hops", () => {
  const request = (remote, forwarded) => ({ socket: { remoteAddress: remote }, headers: { "x-forwarded-for": forwarded } });
  assert.equal(imageClientIp(request("::ffff:127.0.0.1", "192.0.2.10")), "127.0.0.1");
  assert.equal(imageClientIp(request("198.51.100.10", "192.0.2.10"), "127.0.0.1"), "198.51.100.10");
  assert.equal(imageClientIp(request("127.0.0.1", "203.0.113.5, 192.0.2.10, 127.0.0.2"), "127.0.0.0/8"), "192.0.2.10");
});

test("unlimited token reserves and settles only the user wallet", (t) => {
  const f = fixture(t);
  f.database((db) => db.exec("UPDATE tokens SET unlimited_quota=1,remain_quota=0 WHERE id=1"));
  const row = f.ready();
  assert.equal(row.token_limited, 0);
  f.ledger.failed(row.id); // A ready result is retained rather than downgraded.
  assert.equal(f.ledger.get(row.id).state, "ready");
  f.ledger.prepareDelivery(row.id);
  f.ledger.acknowledge(row.id);
  const wallet = f.wallet();
  assert.deepEqual(wallet.user, { quota: INITIAL - COST, used_quota: COST, request_count: 1 });
  assert.deepEqual(wallet.token, { remain_quota: 0, used_quota: 0 });
  assert.equal(wallet.logs.length, 1);
});

test("missing wallet or incompatible consume-log schema fails closed without a reservation", (t) => {
  const f = fixture(t);
  const missing = path.join(f.temp, "missing.db");
  const unavailable = new ImageLedger(missing, { ackDir: path.join(f.temp, "missing-acks") });
  assert.throws(() => unavailable.reserve({ apiKey: "sk-fixture-1", model: MODEL, requestHash: "missing", ip: IP, origin: ORIGIN }), errorCode("image_billing_unavailable", 503));
  assert.equal(fs.existsSync(missing), false);
  f.database((db) => db.exec("ALTER TABLE logs DROP COLUMN upstream_request_id"));
  assert.throws(() => f.reserve(), errorCode("image_billing_unavailable", 503));
  uncharged(f);
  assert.equal(f.database((db) => db.prepare("SELECT COUNT(*) AS count FROM keyo_image_tasks").get().count), 0);
});
