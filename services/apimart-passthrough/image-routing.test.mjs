import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { ImageLedger, ImageError } from "./image-ledger.mjs";
import { ImageService } from "./image-service.mjs";

const ORIGIN = "https://up.example";
const AICOPY = "https://aicopy.example";
const IP = "127.0.0.1";
const MODEL = "gpt-image-2";
const INITIAL = 1_000_000;
const TTL = 600;
const RESULT = { created: 1, data: [{ url: "https://cdn.example/x.png" }] };

function fixture(t, { groups = { default: 1 }, price = 0.02 } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keyo-image-routing-test-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const dbPath = path.join(temp, "wallet.db");
  let now = 1000;
  const config = { reservationTtl: TTL, dedupSeconds: 300, clock: () => now, ackDir: path.join(temp, "acks") };
  const ledger = new ImageLedger(dbPath, config);
  const database = (fn) => {
    const db = new DatabaseSync(dbPath);
    try { return fn(db); } finally { db.close(); }
  };
  database((db) => {
    db.exec(`
      CREATE TABLE users(id INTEGER PRIMARY KEY,status INTEGER,quota INTEGER,used_quota INTEGER DEFAULT 0,request_count INTEGER DEFAULT 0,"group" TEXT,deleted_at TEXT);
      CREATE TABLE tokens(id INTEGER PRIMARY KEY,user_id INTEGER,key TEXT,name TEXT,status INTEGER,expired_time INTEGER,remain_quota INTEGER,unlimited_quota INTEGER,used_quota INTEGER DEFAULT 0,model_limits_enabled INTEGER DEFAULT 0,model_limits TEXT DEFAULT '',allow_ips TEXT DEFAULT '',"group" TEXT,auto_groups TEXT DEFAULT '',deleted_at TEXT);
      CREATE TABLE options(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE channels(id INTEGER PRIMARY KEY,status INTEGER,base_url TEXT,name TEXT);
      CREATE TABLE abilities(channel_id INTEGER,model TEXT,"group" TEXT,enabled INTEGER,priority INTEGER DEFAULT 0,weight INTEGER DEFAULT 1);
      CREATE TABLE logs(user_id,created_at INTEGER,type INTEGER,content TEXT,username TEXT,token_name TEXT,model_name TEXT,quota INTEGER,prompt_tokens INTEGER,completion_tokens INTEGER,use_time INTEGER,is_stream INTEGER,channel_id INTEGER,token_id INTEGER,"group" TEXT,ip TEXT,request_id TEXT,upstream_request_id TEXT,other TEXT);
    `);
    db.prepare("INSERT INTO users(id,status,quota,\"group\") VALUES(1,1,?,'default')").run(INITIAL);
    db.prepare('INSERT INTO tokens(id,user_id,key,name,status,expired_time,remain_quota,unlimited_quota,"group") VALUES(1,1,\'routing-1\',\'t\',1,-1,?,0,\'default\')').run(INITIAL);
    // Channel 1: grsai-backed default group. Channel 2: grsai-backed vip group.
    // Channel 3: GPT-Image-Pro (aicopy lane, any base_url). Channel 4: grsai-backed HD group.
    db.prepare("INSERT INTO channels(id,status,base_url,name) VALUES(1,1,?,'c1'),(2,1,?,'c2'),(3,1,'https://pro.example','c3'),(4,1,?,'c4')").run(ORIGIN, ORIGIN, ORIGIN);
    db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(1,?,\'default\',1)').run(MODEL);
    for (const [key, value] of Object.entries({
      ModelPrice: { [MODEL]: price },
      GroupRatio: groups,
      UserUsableGroups: { default: "Default" },
    })) db.prepare("INSERT INTO options(key,value) VALUES(?,?)").run(key, JSON.stringify(value));
  });
  return { temp, dbPath, ledger, database, config, advance: (s) => { now += s; } };
}

const reserveOn = (f, extra = {}) => f.ledger.reserve({ apiKey: "sk-routing-1", model: MODEL, requestHash: `h${Math.random()}`, ip: IP, origin: ORIGIN, ...extra });
const wallet = (f) => f.database((db) => ({ quota: db.prepare("SELECT quota FROM users WHERE id=1").get().quota, remain: db.prepare("SELECT remain_quota FROM tokens WHERE id=1").get().remain_quota }));

test("price-priority routing picks the cheapest group across token-group boundaries", (t) => {
  const f = fixture(t, { groups: { default: 1, vip: 0.5 } });
  f.database((db) => db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(2,?,\'vip\',1)').run(MODEL));
  const { row, group } = reserveOn(f);
  assert.equal(group, "vip"); // 0.02 × 0.5 < 0.02 × 1
  assert.equal(row.using_group, "vip");
  assert.equal(row.quota, 5000);
});

test("GPT-Image-Pro fixed quota competes in the price sort and wins when cheapest", (t) => {
  const f = fixture(t);
  f.database((db) => db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(3,?,\'GPT-Image-Pro\',1)').run(MODEL));
  const { row, group } = reserveOn(f);
  assert.equal(group, "GPT-Image-Pro"); // 5918 < 0.02 × 500000 = 10000
  assert.equal(row.quota, 5918);
});

test("a default-group token reaches models served only by other groups (customer issue 2)", (t) => {
  const f = fixture(t, { groups: { default: 1, "GPT-Image-HD": 1.5 } });
  f.database((db) => {
    db.prepare('UPDATE abilities SET "group"=\'GPT-Image-HD' + "' WHERE channel_id=1").run();
    db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(3,?,\'GPT-Image-Pro\',1)').run(MODEL);
  });
  // Model no longer has a default-group channel; smart routing still serves it
  // from the cheapest other group instead of 503 image_channel_unavailable.
  const { row, group } = reserveOn(f);
  assert.equal(group, "GPT-Image-Pro"); // 5918 < 0.02 × 1.5 × 500000 = 15000
  assert.equal(row.using_group, "GPT-Image-Pro");
  const w = wallet(f);
  assert.equal(w.quota, INITIAL - 5918);
});

test("smart routing off keeps the legacy token-group-only selection", (t) => {
  const f = fixture(t);
  f.ledger.smartRouting = false;
  f.database((db) => db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(2,?,\'vip\',1)').run(MODEL));
  assert.throws(() => {
    f.database((db) => db.prepare('UPDATE abilities SET "group"=\'vip' + "' WHERE channel_id=1").run());
    reserveOn(f);
  }, (e) => e instanceof ImageError && e.code === "image_channel_unavailable");
});

function mockFetch(steps) {
  const calls = [];
  const fetchImpl = (url, options) => {
    const target = String(url);
    calls.push(target);
    const step = steps.shift();
    if (!step) throw new Error("unexpected extra fetch: " + target);
    const status = step.status ?? 200;
    return Promise.resolve({
      status,
      body: (async function* () { yield Buffer.from(JSON.stringify(step.body ?? {})); })(),
    });
  };
  return { fetchImpl, calls };
}

function resLike() {
  const res = new EventEmitter();
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers; };
  res.end = (text) => { res.body = JSON.parse(text); res.writableEnded = true; res.emit("finish"); };
  return res;
}

test("generation failure fails over to the next group and keeps the task id", async (t) => {
  const f = fixture(t);
  // Cheapest first = GPT-Image-Pro (aicopy, 5918); failover target = default (grsai, 10000).
  f.database((db) => db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(3,?,\'GPT-Image-Pro\',1)').run(MODEL));
  const { fetchImpl, calls } = mockFetch([
    { body: { id: "a1", status: "processing" } },                       // aicopy submit, no urls → generation failed
    { body: { id: "g1", status: "processing" } },                        // grsai submit
    { body: { status: "succeeded", data: [{ url: "https://cdn.example/ok.png" }] } }, // grsai poll
  ]);
  const svc = new ImageService({ ledger: f.ledger, models: { [MODEL]: { id: MODEL, kind: "image" } },
    origin: ORIGIN, key: "k", aicopyOrigin: AICOPY, aicopyKey: "k2", fetchImpl, pollIntervalMs: 1, transportMs: 200, waitMs: 200 });
  t.after(() => svc.stop());

  const res = resLike();
  await svc.handle({ method: "POST", url: "/v1/images/generations", socket: { remoteAddress: IP },
    headers: { authorization: "Bearer sk-routing-1", "idempotency-key": "fx-1" } },
    res, { model: MODEL, prompt: "p", replyType: "async" });

  const id = res.body.task_id;
  assert.equal(res.status, 202);
  await svc.jobs.get(id); // wait for submit + failover + poll to settle
  const row = f.ledger.get(id);
  assert.equal(row.id, id);                    // customer-facing id unchanged
  assert.equal(row.state, "ready");
  assert.equal(row.using_group, "default");    // failed over from GPT-Image-Pro
  assert.equal(row.quota, 10000);              // re-reserved at the new group's price
  const w = wallet(f);
  assert.equal(w.quota, INITIAL - 10000);      // Pro's 5918 refunded; exactly one live reservation
  assert.deepEqual(calls, [
    `${AICOPY}/v1/images/generations`,
    `${ORIGIN}/v1/api/generate`,
    `${ORIGIN}/v1/api/result?id=g1`,
  ]);
});

test("policy rejections never fail over", async (t) => {
  const f = fixture(t);
  f.database((db) => db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(3,?,\'GPT-Image-Pro\',1)').run(MODEL));
  const { fetchImpl, calls } = mockFetch([
    { status: 200, body: { status: "violation" } },
  ]);
  const svc = new ImageService({ ledger: f.ledger, models: { [MODEL]: { id: MODEL, kind: "image" } },
    origin: ORIGIN, key: "k", aicopyOrigin: AICOPY, aicopyKey: "k2", fetchImpl, pollIntervalMs: 1, transportMs: 200, waitMs: 200 });
  t.after(() => svc.stop());

  const res = resLike();
  await svc.handle({ method: "POST", url: "/v1/images/generations", socket: { remoteAddress: IP },
    headers: { authorization: "Bearer sk-routing-1", "idempotency-key": "fx-2" } },
    res, { model: MODEL, prompt: "p", replyType: "async" });

  await svc.jobs.get(res.body.task_id);
  const row = f.ledger.get(res.body.task_id);
  assert.equal(row.state, "failed");
  assert.equal(row.error_code, "image_policy_rejected");
  assert.equal(calls.length, 1); // no second group was contacted
  assert.equal(wallet(f).quota, INITIAL); // reservation refunded
});
