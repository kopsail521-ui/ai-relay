import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keyo-image-gateway-test-"));
const children = [];
const servers = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlWQAAAAASUVORK5CYII=", "base64");
const key = "sk-integration-fixture";
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
let submitCount = 0;
let standardImageCalls = 0;
const tasks = new Map();
const received = [];
const dbPath = path.join(temp, "wallet.db");
const originalQuota = 1000000;
const perImageQuota = 10000;

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return server.address().port;
}
async function sparePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}
function copyService(name) {
  const destination = path.join(temp, "services", name);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(path.join(root, "services", name))) {
    if (/\.(?:mjs|json|js)$/.test(entry) && !/\.test\.mjs$/.test(entry)) {
      fs.copyFileSync(path.join(root, "services", name, entry), path.join(destination, entry));
    }
  }
  return path.join(destination, "server.mjs");
}
function start(file, env) {
  const child = spawn(process.execPath, ["--import", pathToFileURL(path.join(temp, "local-fetch.mjs")).href, file], {
    cwd: temp,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: temp, TMP: temp, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output = (output + chunk.toString()).slice(-4096); });
  child.stderr.on("data", (chunk) => { output = (output + chunk.toString()).slice(-4096); });
  child.testOutput = () => output;
  children.push(child);
  return child;
}
async function healthy(base, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`Local fixture server exited: ${child.testOutput()}`);
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch {}
    await delay(25);
  }
  throw new Error(`Local fixture server health timed out: ${child.testOutput()}`);
}
function wallet() {
  const db = new DatabaseSync(dbPath);
  try {
    return { user: db.prepare("SELECT quota,used_quota,request_count FROM users WHERE id=1").get(), token: db.prepare("SELECT remain_quota,used_quota FROM tokens WHERE id=1").get(), logs: db.prepare("SELECT request_id,quota FROM logs WHERE type=2").all() };
  } finally { db.close(); }
}
async function ready(base, id) {
  for (let i = 0; i < 100; i++) {
    const response = await fetch(`${base}/v1/images/tasks/${id}`, { headers });
    const body = await response.json();
    if (response.status !== 202) return { response, body };
    await delay(20);
  }
  throw new Error("Local image fixture did not complete");
}

try {
  fs.writeFileSync(path.join(temp, "local-fetch.mjs"), `
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === 'https://test-api.creem.io/v1/moderation/prompt') {
    const body = JSON.parse(init.body);
    return Response.json({decision: body.prompt === 'deny' ? 'deny' : 'allow'});
  }
  if (!/^http:\\/\\/127\\.0\\.0\\.1[:/]/.test(url)) throw new Error('Nonlocal network forbidden in fixture');
  return original(input, init);
};
`);
  const upstreamPort = await listen(http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://local").pathname;
    if (pathname === "/v1/models") return json(res, 200, { object: "list", data: [] });
    if (pathname === "/v1/api/generate") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      received.push(body);
      const id = `upstream-${++submitCount}`;
      tasks.set(id, { body, polls: 0 });
      return json(res, 200, { id, status: "running" });
    }
    if (pathname === "/v1/api/result") {
      const task = tasks.get(new URL(req.url, "http://local").searchParams.get("id"));
      if (!task) return json(res, 404, { error: { message: "unknown fixture task" } });
      task.polls++;
      if (task.body.prompt === "transient" && task.polls === 1) return json(res, 503, { error: { message: "temporary fixture outage" } });
      if (task.body.prompt === "policy") return json(res, 200, { status: "violation" });
      if (task.body.prompt === "empty") return json(res, 200, { status: "completed", results: [] });
      if (task.body.prompt === "invalid-output") return json(res, 200, { status: "completed", results: [{ b64_json: "%%%" }] });
      if (task.body.prompt === "slow" && task.polls < 12) return json(res, 200, { status: "running" });
      return json(res, 200, { status: "completed", results: ["https://example.invalid/result.png"] });
    }
    if (pathname.startsWith("/v1/images")) standardImageCalls++;
    return json(res, 404, { error: { message: "unused fixture route" } });
  }));
  const origin = `http://127.0.0.1:${upstreamPort}`;
  const db = new DatabaseSync(dbPath);
  db.exec(`
CREATE TABLE users(id INTEGER PRIMARY KEY,status INTEGER,quota INTEGER,used_quota INTEGER DEFAULT 0,request_count INTEGER DEFAULT 0,"group" TEXT,deleted_at TEXT);
CREATE TABLE tokens(id INTEGER PRIMARY KEY,user_id INTEGER,key TEXT,name TEXT,status INTEGER,expired_time INTEGER,remain_quota INTEGER,unlimited_quota INTEGER,used_quota INTEGER DEFAULT 0,model_limits_enabled INTEGER DEFAULT 0,model_limits TEXT DEFAULT '',allow_ips TEXT DEFAULT '',"group" TEXT,auto_groups TEXT DEFAULT '',deleted_at TEXT);
CREATE TABLE options(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE channels(id INTEGER PRIMARY KEY,status INTEGER,base_url TEXT,name TEXT);
CREATE TABLE abilities(channel_id INTEGER,model TEXT,"group" TEXT,enabled INTEGER,priority INTEGER DEFAULT 0,weight INTEGER DEFAULT 1);
CREATE TABLE logs(user_id INTEGER,created_at INTEGER,type INTEGER,content TEXT,username TEXT,token_name TEXT,model_name TEXT,quota INTEGER,prompt_tokens INTEGER,completion_tokens INTEGER,use_time INTEGER,is_stream INTEGER,channel_id INTEGER,token_id INTEGER,"group" TEXT,ip TEXT,request_id TEXT,upstream_request_id TEXT,other TEXT);
INSERT INTO users(id,status,quota,"group") VALUES(1,1,${originalQuota},'default');
INSERT INTO tokens(id,user_id,key,name,status,expired_time,remain_quota,unlimited_quota,"group") VALUES(1,1,'integration-fixture','fixture',1,-1,${originalQuota},0,'default');
`);
  db.prepare("INSERT INTO channels(id,status,base_url,name) VALUES(1,1,?,'fixture')").run(origin);
  for (const model of ["nano-banana-2", "gpt-image-2-vip"]) db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(1,?,\'default\',1)').run(model);
  for (const [name, value] of Object.entries({ ModelPrice: { "nano-banana-2": 0.02, "gpt-image-2-vip": 0.02 }, GroupRatio: { default: 1 }, UserUsableGroups: { default: "Default" } })) db.prepare("INSERT INTO options(key,value) VALUES(?,?)").run(name, JSON.stringify(value));
  db.close();
  const nativePort = await sparePort();
  const proxyPort = await sparePort();
  const nativeBase = `http://127.0.0.1:${nativePort}`;
  const proxyBase = `http://127.0.0.1:${proxyPort}`;
  const native = start(copyService("apimart-passthrough"), {
    PORT: String(nativePort), LISTEN_HOST: "127.0.0.1", GRSAI_API_KEY: "fixture-upstream-key", GRSAI_BASE_URL: origin,
    NEW_API_DB: dbPath, NEW_API_BASE: origin, QUOTA_PER_USD: "500000", IMAGE_POLL_INTERVAL_MS: "15", IMAGE_POLL_MAX_MS: "50", IMAGE_TRANSPORT_TIMEOUT_MS: "1000",
    IMAGE_TRUSTED_PROXIES: "127.0.0.1/32", IMAGE_RECOVERY_INTERVAL_MS: "50",
  });
  await healthy(nativeBase, native);
  const proxy = start(copyService("creem-moderation-proxy"), {
    PORT: String(proxyPort), LISTEN_HOST: "127.0.0.1", UPSTREAM_URL: origin, VIDEO_GEN_URL: nativeBase,
    VIDEO_CATALOG: path.join(temp, "services/apimart-passthrough/catalog.json"), CREEM_API_KEY: "fixture-moderation-key", CREEM_TEST_MODE: "true",
    UPLOAD_DIR: path.join(temp, "uploads"), UPLOAD_PUBLIC_BASE: `${proxyBase}/uploads`, IMAGE_FORWARD_TIMEOUT_MS: "3000", UPLOAD_AUTH_TIMEOUT_MS: "1000",
  });
  await healthy(proxyBase, proxy);

  const preflight = await fetch(`${proxyBase}/v1/images/edits`, { method: "OPTIONS", headers: { origin: "http://fixture.invalid", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,idempotency-key" } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-headers") || "", /idempotency-key/i);

  const form = new FormData();
  form.append("model", "nano-banana-2"); form.append("prompt", "local-edit");
  form.append("image", new Blob([png], { type: "image/png" }), "local.png");
  form.append("aspectRatio", "16:9"); form.append("imageSize", "4K"); form.append("replyType", "async");
  const accepted = await fetch(`${proxyBase}/v1/images/edits`, { method: "POST", headers: { authorization: `Bearer ${key}`, "idempotency-key": "local-edit-once" }, body: form });
  assert.equal(accepted.status, 202);
  const task = await accepted.json();
  assert.match(task.task_id, /^img_/);
  assert.equal(accepted.headers.get("x-image-task-id"), task.task_id);
  const result = await ready(proxyBase, task.task_id);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data[0].url, "https://example.invalid/result.png");
  assert.equal(received[0].imageSize, "4K"); assert.equal(received[0].aspectRatio, "16:9");
  assert.equal(received[0].images[0], `data:image/png;base64,${png.toString("base64")}`);
  await delay(30);
  const firstWallet = wallet();
  assert.equal(firstWallet.user.quota, originalQuota - perImageQuota);
  assert.equal(firstWallet.user.used_quota, perImageQuota);
  assert.equal(firstWallet.token.remain_quota, originalQuota - perImageQuota);
  assert.equal(firstWallet.logs.length, 1);
  await Promise.all([ready(proxyBase, task.task_id), ready(proxyBase, task.task_id)]);
  const replay = await fetch(`${proxyBase}/v1/images/generations`, { method: "POST", headers: { ...headers, "idempotency-key": "local-edit-once" }, body: JSON.stringify({ model: "nano-banana-2", prompt: "local-edit", images: [`data:image/png;base64,${png.toString("base64")}`], aspectRatio: "16:9", imageSize: "4K", replyType: "async" }) });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).task_id, task.task_id);
  await delay(30);
  assert.equal(submitCount, 1); assert.equal(wallet().logs.length, 1);

  for (const prompt of ["policy", "empty", "invalid-output"]) {
    const response = await fetch(`${proxyBase}/v1/images/generations`, { method: "POST", headers, body: JSON.stringify({ model: "nano-banana-2", prompt, replyType: "async" }) });
    const failed = await ready(proxyBase, (await response.json()).task_id);
    assert.equal(failed.response.status, 502);
    assert.equal(wallet().user.quota, originalQuota - perImageQuota);
    assert.equal(wallet().logs.length, 1);
  }
  const beforeTransient = submitCount;
  const transient = await fetch(`${proxyBase}/v1/images/generations`, { method: "POST", headers, body: JSON.stringify({ model: "nano-banana-2", prompt: "transient" }) });
  const transientBody = await transient.json();
  const recovered = transient.status === 202 ? await ready(proxyBase, transientBody.task_id) : { response: transient, body: transientBody };
  assert.equal(recovered.response.status, 200);
  assert.equal(submitCount, beforeTransient + 1);
  const slow = await fetch(`${proxyBase}/v1/images/generations`, { method: "POST", headers, body: JSON.stringify({ model: "nano-banana-2", prompt: "slow" }) });
  assert.equal(slow.status, 202);
  const slowBody = await slow.json();
  assert.equal((await ready(proxyBase, slowBody.task_id)).response.status, 200);
  assert.equal(submitCount, 6);

  const beforeDeny = submitCount;
  const denied = await fetch(`${proxyBase}/v1/images/generations`, { method: "POST", headers, body: JSON.stringify({ model: "nano-banana-2", prompt: "deny" }) });
  assert.equal(denied.status, 400); assert.equal(submitCount, beforeDeny);
  const variation = await fetch(`${proxyBase}/v1/images/variations`, { method: "POST", headers, body: JSON.stringify({ model: "nano-banana-2", prompt: "variation" }) });
  assert.equal(variation.status, 400);
  const maskForm = new FormData();
  maskForm.append("model", "gpt-image-2-vip"); maskForm.append("prompt", "mask");
  maskForm.append("image", new Blob([png], { type: "image/png" }), "image.png");
  maskForm.append("mask", new Blob([png], { type: "image/png" }), "mask.png");
  const mask = await fetch(`${proxyBase}/v1/images/edits`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: maskForm });
  assert.equal(mask.status, 400); assert.equal(submitCount, beforeDeny);

  for (const endpoint of ["/v1/uploads", "/v1/files"]) {
    const uploadForm = new FormData(); uploadForm.append("file", new Blob([png], { type: "image/png" }), "local.png");
    const upload = await fetch(`${proxyBase}${endpoint}`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: uploadForm });
    assert.equal(upload.status, 200);
    const uploaded = await upload.json();
    const readback = await fetch(uploaded.url);
    assert.equal(readback.status, 200); assert.deepEqual(Buffer.from(await readback.arrayBuffer()), png);
  }
  await delay(30);
  assert.equal(standardImageCalls, 0);
  const finalWallet = wallet();
  assert.equal(finalWallet.user.used_quota, perImageQuota * 3);
  assert.equal(finalWallet.user.quota, originalQuota - perImageQuota * 3);
  assert.equal(finalWallet.logs.length, 3);
  assert.equal(new Set(finalWallet.logs.map((row) => row.request_id)).size, 3);
  console.log("PASS: isolated moderation + native + wallet integration (multipart 4K input, task/replay, failures, polling outage, timeout, policy, uploads, once-only billing)");
} finally {
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(2000)]);
    }
  }
  for (const server of servers) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  fs.rmSync(temp, { recursive: true, force: true });
}
