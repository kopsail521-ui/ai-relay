import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { createDecisionsHandler } from "./decisions.mjs";
import { caddyFullSite } from "../../scripts/caddy-seo-shared.mjs";

const payload = { model: "cloudflare/clef", state: "Great service", questions: {
  sentiment: { type: "choice", instructions: "Classify sentiment", criteria: { positive: null, negative: null } },
} };
const success = { answers: { sentiment: "positive" }, usage: { input_tokens: 289, output_tokens: 0, cost: 0.00002601 },
  id: "gen-dec-secret-upstream", provider: "private-provider" };

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t, { upstream, balance = 1000, envKey = "environment-secret", timeoutMs = 1000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clef-test-"));
  const dbPath = path.join(dir, "one-api.db");
  const db = new DatabaseSync(dbPath);
  // Column names/types match model/{token,user,channel,ability,log,option}.go.
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT, status INTEGER, quota INTEGER, used_quota INTEGER DEFAULT 0,
      request_count INTEGER DEFAULT 0, "group" TEXT, deleted_at DATETIME);
    CREATE TABLE tokens(id INTEGER PRIMARY KEY, user_id INTEGER, key TEXT, name TEXT, status INTEGER, expired_time INTEGER,
      remain_quota INTEGER, unlimited_quota INTEGER, model_limits_enabled INTEGER, model_limits TEXT,
      allow_ips TEXT, used_quota INTEGER DEFAULT 0, "group" TEXT, auto_groups TEXT, deleted_at DATETIME, accessed_time INTEGER);
    CREATE TABLE channels(id INTEGER PRIMARY KEY, key TEXT, status INTEGER, base_url TEXT,
      used_quota INTEGER DEFAULT 0, channel_info TEXT);
    CREATE TABLE abilities("group" TEXT, model TEXT, channel_id INTEGER, enabled INTEGER, priority INTEGER);
    CREATE TABLE options(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE logs(id INTEGER PRIMARY KEY, user_id INTEGER, created_at INTEGER, type INTEGER, content TEXT, username TEXT,
      token_name TEXT, model_name TEXT, quota INTEGER, prompt_tokens INTEGER, completion_tokens INTEGER, use_time INTEGER,
      is_stream INTEGER, channel_id INTEGER, token_id INTEGER, "group" TEXT, ip TEXT, request_id TEXT, other TEXT);
    INSERT INTO users(id,username,status,quota,"group") VALUES(1,'tester',1,${balance},'default');
    INSERT INTO tokens(id,user_id,key,name,status,expired_time,remain_quota,unlimited_quota,model_limits_enabled,model_limits,
      allow_ips,"group",auto_groups) VALUES(1,1,'localtoken','test',1,-1,${balance},0,0,'','','','');
    INSERT INTO channels(id,key,status,base_url,channel_info) VALUES
      (14,'database-secret',1,'https://openrouter.ai/api','{}'),
      (20,'placeholder',1,'http://127.0.0.1:3010','{}');
    INSERT INTO abilities VALUES('default','cloudflare/clef',20,1,0);
  `);
  const calls = [];
  const upstreamServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
    if (upstream) return upstream(req, res);
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(success));
  });
  const upstreamUrl = await listen(upstreamServer);
  const handler = createDecisionsHandler({ dbPath, quotaPerUsd: 500000, envKey, timeoutMs,
    fetchImpl: (url, init) => {
      assert.equal(url, "https://openrouter.ai/api/alpha/decisions");
      assert.equal(init.redirect, "error");
      return fetch(upstreamUrl, init);
    } });
  const local = http.createServer(async (req, res) => {
    if (!(await handler(req, res))) { res.writeHead(404); res.end(); }
  });
  const localUrl = await listen(local);
  t.after(async () => {
    await Promise.all([local, upstreamServer].map(s => new Promise(resolve => { s.closeAllConnections(); s.close(resolve); })));
    db.close(); fs.rmSync(dir, { recursive: true, force: true });
  });
  return { db, dbPath, calls, localUrl,
    async request(body = payload, { key = "sk-localtoken", headers = {}, method = "POST", url = "/v1/decisions" } = {}) {
      const r = await fetch(`${localUrl}${url}`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...headers },
        ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
      const text = await r.text();
      return { status: r.status, text, body: text ? JSON.parse(text) : null };
    },
    snapshot() {
      return { user: db.prepare("SELECT quota,used_quota,request_count FROM users").get(),
        token: db.prepare("SELECT remain_quota,used_quota FROM tokens").get(),
        channel: db.prepare("SELECT used_quota FROM channels WHERE id=20").get(),
        logs: db.prepare("SELECT * FROM logs").all() };
    },
  };
}

test("actual upstream cost × 1.5 settles atomically with sanitized response/logs", async t => {
  const f = await fixture(t);
  const r = await f.request();
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.usage.cost, 0.00002601 * 1.5);
  assert.equal(r.body.usage.output_tokens, 0);
  assert.match(r.body.id, /^dec-/);
  for (const hidden of ["gen-dec-secret-upstream", "private-provider", "environment-secret", "database-secret", "0.00002601"])
    assert.ok(!r.text.includes(hidden));
  assert.deepEqual(f.calls[0].body, payload);
  assert.equal(f.calls[0].headers.authorization, "Bearer environment-secret");
  const s = f.snapshot();
  assert.equal(s.user.quota, 980); assert.equal(s.user.used_quota, 20); assert.equal(s.user.request_count, 1);
  assert.equal(s.token.remain_quota, 980); assert.equal(s.token.used_quota, 20); assert.equal(s.channel.used_quota, 20);
  assert.equal(s.logs.length, 1); assert.equal(s.logs[0].quota, 20); assert.equal(s.logs[0].channel_id, 20);
  assert.equal(s.logs[0].group, "default"); assert.equal(s.logs[0].type, 2); assert.equal(s.logs[0].prompt_tokens, 289);
  assert.equal(s.logs[0].request_id, r.body.id);
  assert.deepEqual(JSON.parse(s.logs[0].other), { sale_cost: success.usage.cost * 1.5, billing_multiplier: 1.5 });
});

test("tiny cost rounds with DB precision, without fixed minimum price; explicit zero is valid", async t => {
  for (const cost of [0.0000001, 0]) await t.test(String(cost), async t => {
    const f = await fixture(t, { upstream: (_, res) => res.end(JSON.stringify({ ...success, usage: { ...success.usage, cost } })) });
    const r = await f.request(); assert.equal(r.status, 200, r.text); assert.equal(r.body.usage.cost, cost * 1.5);
    const s = f.snapshot(); assert.equal(s.user.quota, 1000); assert.equal(s.logs[0].quota, 0);
  });
});

test("auth rejects disabled/expired/deleted/exhausted tokens, limits and invalid users", async t => {
  const mutations = [
    ["disabled token", "UPDATE tokens SET status=2", 401],
    ["expired token", "UPDATE tokens SET expired_time=1", 401],
    ["deleted token", "UPDATE tokens SET deleted_at='2026-01-01'", 401],
    ["exhausted token", "UPDATE tokens SET remain_quota=0", 401],
    ["small token", "UPDATE tokens SET remain_quota=49", 402],
    ["model restriction", "UPDATE tokens SET model_limits_enabled=1,model_limits='other'", 403],
    ["IP restriction", "UPDATE tokens SET allow_ips='192.0.2.0/24'", 403],
    ["malformed IP restriction", "UPDATE tokens SET allow_ips='not-an-ip'", 403],
    ["disabled user", "UPDATE users SET status=2", 403],
    ["deleted user", "UPDATE users SET deleted_at='2026-01-01'", 403],
    ["no balance", "UPDATE users SET quota=0", 402],
    ["small balance", "UPDATE users SET quota=49", 402],
    ["forbidden group", "UPDATE tokens SET \"group\"='unknown'", 403],
    ["disabled ability", "UPDATE abilities SET enabled=0", 403],
    ["disabled channel", "UPDATE channels SET status=2 WHERE id=20", 403],
    ["unrelated channel", "UPDATE channels SET base_url='https://example.com' WHERE id=20", 403],
  ];
  for (const [name, sql, expected] of mutations) await t.test(name, async t => {
    const f = await fixture(t); f.db.exec(sql); const before = f.snapshot();
    const r = await f.request(); assert.equal(r.status, expected, r.text);
    assert.equal(f.calls.length, 0); assert.deepEqual(f.snapshot(), before);
  });
  await t.test("case sensitive key and channel suffix denied", async t => {
    const f = await fixture(t);
    for (const key of ["", "sk-LOCALtoken", "sk-localtoken-14", "environment-secret"])
      assert.equal((await f.request(payload, { key })).status, 401);
    assert.equal(f.calls.length, 0);
  });
});

test("IP CIDR and trusted local proxy use rightmost verified peer", async t => {
  const f = await fixture(t);
  f.db.exec("UPDATE tokens SET allow_ips='192.0.2.0/24\\n::1'".replace("\\n", "\n"));
  assert.equal((await f.request(payload, { headers: { "X-Forwarded-For": "203.0.113.3, 192.0.2.8" } })).status, 200);
  assert.equal((await f.request(payload, { headers: { "X-Forwarded-For": "192.0.2.8, 203.0.113.3" } })).status, 403);
  assert.equal((await f.request(payload, { headers: { "X-Forwarded-For": "::1" } })).status, 200);
});

test("model limits and group special/auto rules follow current DB options with no price multiplier", async t => {
  const f = await fixture(t);
  const opt = (key, val) => f.db.prepare("INSERT OR REPLACE INTO options VALUES(?,?)").run(key, JSON.stringify(val));
  f.db.exec("UPDATE tokens SET model_limits_enabled=1,model_limits='other,cloudflare/clef',\"group\"='auto',auto_groups='[\"vip\",\"default\"]'; UPDATE abilities SET \"group\"='vip'");
  opt("UserUsableGroups", { default: "default", vip: "vip", auto: "auto" });
  opt("GroupRatio", { default: 1, vip: 100 });
  let r = await f.request(); assert.equal(r.status, 200, r.text); assert.equal(r.body.usage.cost, success.usage.cost * 1.5);
  assert.equal(f.snapshot().logs[0].group, "vip");
  opt("group_ratio_setting.group_special_usable_group", { default: { "-:vip": "remove" } });
  assert.equal((await f.request()).status, 403);
  opt("group_ratio_setting.group_special_usable_group", { default: { "+:vip": "add" } });
  assert.equal((await f.request()).status, 200);
  f.db.exec("UPDATE tokens SET auto_groups='[\"unknown\"]'");
  assert.equal((await f.request()).status, 403); // no fallback after snapshot permissions change
  f.db.exec("UPDATE tokens SET auto_groups='not-json'");
  assert.equal((await f.request()).status, 403);
});

test("environment key wins; valid channel14 fallback; disabled/multi-key upstream fails closed", async t => {
  const f = await fixture(t, { envKey: "" });
  assert.equal((await f.request()).status, 200); assert.equal(f.calls[0].headers.authorization, "Bearer database-secret");
  f.db.exec("UPDATE channels SET status=2 WHERE id=14");
  assert.equal((await f.request()).status, 503);
  f.db.exec("UPDATE channels SET status=1,channel_info='{\"is_multi_key\":true}' WHERE id=14");
  assert.equal((await f.request()).status, 503);
  assert.equal(f.calls.length, 1);
});

test("DB missing or incompatible schema fails closed before upstream", async t => {
  const f = await fixture(t);
  f.db.exec("ALTER TABLE tokens DROP COLUMN allow_ips");
  assert.equal((await f.request()).status, 503); assert.equal(f.calls.length, 0);
  f.db.exec("ALTER TABLE tokens ADD COLUMN allow_ips TEXT; DROP TABLE abilities");
  assert.equal((await f.request()).status, 503); assert.equal(f.calls.length, 0);
  const handler = createDecisionsHandler({ dbPath: path.join(os.tmpdir(), "nonexistent-clef.db"), quotaPerUsd: 500000 });
  const req = { url: "/v1/decisions", method: "POST", headers: { authorization: "Bearer sk-localtoken", "content-type": "application/json" } };
  let response;
  const res = { writeHead(status) { response = status; }, end() {} };
  await handler(req, res); assert.equal(response, 503);
});

test("invalid requests including provider/BYOK/score/remote images never reach upstream", async t => {
  const f = await fixture(t);
  const invalid = [
    { ...payload, model: "other" }, { ...payload, provider: { order: ["expensive"] } },
    { ...payload, api_key: "attacker" }, { ...payload, price: 10000 },
    { ...payload, questions: { bad: { type: "score", instructions: "score it" } } },
    { ...payload, questions: { bad: { type: "choice", instructions: "x", criteria: { positive: 10 } } } },
    { ...payload, state: [{ type: "image_url", image_url: { url: "https://example.com/image.png" } }] },
    { ...payload, state: "x".repeat(65537) }, "{broken json",
  ];
  for (const body of invalid) assert.equal((await f.request(body)).status, 400);
  assert.equal((await f.request("x".repeat(2 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await f.request(payload, { method: "GET" })).status, 405);
  assert.equal((await f.request(payload, { headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal(f.calls.length, 0); assert.equal(f.snapshot().user.quota, 1000);
});

test("bounded inline images and official noul contract", async t => {
  const f = await fixture(t);
  const image = { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } };
  const body = { model: "cloudflare/clef", state: ["Describe this", image], questions: { photo: { type: "noul", instructions: "The photo shows..." } } };
  assert.equal((await f.request(body)).status, 200);
  assert.deepEqual(f.calls[0].body, body);
  assert.equal((await f.request({ ...body, state: Array(5).fill(image) })).status, 400);
  const huge = { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.alloc(300 * 1024).toString("base64")}` } };
  assert.equal((await f.request({ ...body, state: [huge] })).status, 400);
});

test("upstream errors, missing/invalid cost, timeout and malformed response refund every quota", async t => {
  const cases = [
    ["error", (_, res) => { res.writeHead(400); res.end("secret-provider-and-key"); }, 502],
    ["missing cost", (_, res) => res.end(JSON.stringify({ ...success, usage: { input_tokens: 289, output_tokens: 0 } })), 502],
    ["null cost", (_, res) => res.end(JSON.stringify({ ...success, usage: { ...success.usage, cost: null } })), 502],
    ["string cost", (_, res) => res.end(JSON.stringify({ ...success, usage: { ...success.usage, cost: "0.01" } })), 502],
    ["negative cost", (_, res) => res.end(JSON.stringify({ ...success, usage: { ...success.usage, cost: -1 } })), 502],
    ["excessive cost", (_, res) => res.end(JSON.stringify({ ...success, usage: { ...success.usage, cost: 1e100 } })), 502],
    ["invalid json", (_, res) => res.end("secret-non-json"), 502],
    ["large response", (_, res) => res.end("x".repeat(256 * 1024 + 1)), 502],
    ["timeout", () => {}, 504],
    ["body timeout", (_, res) => { res.writeHead(200); res.write('{"answers":'); }, 504],
    ["final balance insufficient", (_, res) => res.end(JSON.stringify({ ...success, usage: { ...success.usage, cost: 0.01 } })), 402],
  ];
  for (const [name, upstream, status] of cases) await t.test(name, async t => {
    const f = await fixture(t, { upstream, timeoutMs: 80 }); const before = f.snapshot();
    const r = await f.request(); assert.equal(r.status, status, r.text);
    assert.ok(!r.text.includes("secret")); assert.deepEqual(f.snapshot(), before);
  });
});

test("settlement log failure rolls back user/token/channel changes and refunds reservation", async t => {
  const f = await fixture(t);
  f.db.exec("CREATE TRIGGER reject_log BEFORE INSERT ON logs BEGIN SELECT RAISE(ABORT,'test failure'); END");
  const before = f.snapshot(); const r = await f.request();
  assert.equal(r.status, 503); assert.deepEqual(f.snapshot(), before);
});

test("concurrent requests cannot overspend user/token; successful requests have one settlement", async t => {
  const f = await fixture(t, { balance: 100, upstream: async (_, res) => {
    await new Promise(resolve => setTimeout(resolve, 100)); res.end(JSON.stringify(success));
  } });
  const results = await Promise.all(Array.from({ length: 10 }, () => f.request()));
  const ok = results.filter(r => r.status === 200).length;
  assert.equal(ok, 2); assert.equal(results.filter(r => [401, 402].includes(r.status)).length, 8);
  const s = f.snapshot(); assert.equal(s.user.quota, 60); assert.equal(s.token.remain_quota, 60);
  assert.equal(s.user.used_quota, 40); assert.equal(s.token.used_quota, 40); assert.equal(s.channel.used_quota, 40);
  assert.equal(s.user.request_count, 2); assert.equal(s.logs.length, 2);
  assert.equal(new Set(s.logs.map(l => l.request_id)).size, 2);
});

test("concurrent final charges above reservation cannot overdraw and failed settlement refunds", async t => {
  const f = await fixture(t, { balance: 100, upstream: async (_, res) => {
    await new Promise(resolve => setTimeout(resolve, 80));
    res.end(JSON.stringify({ ...success, usage: { ...success.usage, cost: 0.00008 } }));
  } });
  const results = await Promise.all([f.request(), f.request()]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 402]);
  const s = f.snapshot();
  assert.equal(s.user.quota, 40); assert.equal(s.token.remain_quota, 40);
  assert.equal(s.user.used_quota, 60); assert.equal(s.token.used_quota, 60);
  assert.equal(s.channel.used_quota, 60); assert.equal(s.logs.length, 1);
  assert.equal(s.user.request_count, 1);
});

test("unlimited token permits zero remaining quota, still records actual token usage", async t => {
  const f = await fixture(t); f.db.exec("UPDATE tokens SET unlimited_quota=1,remain_quota=0");
  const r = await f.request(); assert.equal(r.status, 200, r.text);
  assert.equal(f.snapshot().token.used_quota, 20);
  // new-api service/quota.go calls model.DecreaseTokenQuota unconditionally.
  assert.equal(f.snapshot().token.remain_quota, -20);
});

test("exact route and server handler registration precede legacy path/body/auth checks", async t => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.localUrl}/v1/decisions-extra`)).status, 404);
  const source = fs.readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
  const mount = source.indexOf("if (await handleDecisions(req, res)) return;");
  assert.ok(mount > 0); assert.ok(mount < source.indexOf("if (!isPassthrough(urlPath))"));
  assert.ok(mount < source.indexOf(": await readBody(req)"));
  assert.match(caddyFullSite(), /handle \/v1\/decisions \{\s*reverse_proxy 127\.0\.0\.1:3010/);
  assert.ok(!caddyFullSite().includes("/v1/decisions*"));
});
