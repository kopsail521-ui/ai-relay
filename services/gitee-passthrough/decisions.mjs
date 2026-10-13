import fs from "node:fs";
import { BlockList, isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const MODEL = "cloudflare/clef";
const UPSTREAM = "https://openrouter.ai/api/alpha/decisions";
const MAX_BODY = 2 * 1024 * 1024;
const MAX_RESPONSE = 256 * 1024;
const owns = (o, k) => Object.hasOwn(o, k);
const object = (o) => o !== null && typeof o === "object" && !Array.isArray(o);
class Failure extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new Failure(status, message); };

function json(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const timer = setTimeout(() => finish(new Failure(408, "Request body timed out")), 10000);
    function finish(error) {
      clearTimeout(timer);
      req.off("data", data); req.off("end", end); req.off("error", errorEvent); req.off("aborted", aborted);
      if (error) { req.resume(); reject(error); }
      else resolve(Buffer.concat(chunks));
    }
    function data(chunk) {
      size += chunk.length;
      if (size > MAX_BODY) return finish(new Failure(413, "Request body too large"));
      chunks.push(chunk);
    }
    function end() { finish(); }
    function errorEvent() { finish(new Failure(400, "Invalid request body")); }
    function aborted() { finish(new Failure(400, "Request aborted")); }
    req.on("data", data); req.on("end", end); req.on("error", errorEvent); req.on("aborted", aborted);
  });
}

function validatePayload(body) {
  if (!object(body) || Object.keys(body).some(k => !["model", "state", "questions"].includes(k)))
    fail(400, "Only model, state and questions are supported");
  if (body.model !== MODEL) fail(400, "Only cloudflare/clef is supported");
  if (typeof body.state !== "string" && !Array.isArray(body.state)) fail(400, "state must be text or an array");
  const states = Array.isArray(body.state) ? body.state : [body.state];
  let images = 0;
  if (!states.length || states.length > 16) fail(400, "Invalid state");
  for (const state of states) {
    if (typeof state === "string" && state.length && Buffer.byteLength(state) <= 64 * 1024) continue;
    if (!object(state) || Object.keys(state).some(k => !["type", "image_url"].includes(k)) ||
        state.type !== "image_url" || !object(state.image_url) ||
        Object.keys(state.image_url).some(k => k !== "url") || typeof state.image_url.url !== "string")
      fail(400, "state supports text or inline image_url items");
    const image = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(state.image_url.url);
    if (!image || image[2].length % 4 !== 0 || ++images > 4 ||
        Buffer.from(image[2], "base64").length >= 300 * 1024)
      fail(400, "Use at most 4 inline PNG, JPEG or WebP images under 300KB each");
  }
  if (!object(body.questions)) fail(400, "questions must be an object");
  const questions = Object.entries(body.questions);
  if (!questions.length || questions.length > 16) fail(400, "Expected 1 to 16 questions");
  for (const [name, q] of questions) {
    if (!/^[a-zA-Z0-9_]{1,64}$/.test(name) || !object(q) || !["choice", "noul"].includes(q.type) ||
        Object.keys(q).some(k => !(q.type === "choice" ? ["type", "instructions", "criteria"] : ["type", "instructions"]).includes(k)) ||
        typeof q.instructions !== "string" || !q.instructions.length || q.instructions.length > 4096)
      fail(400, "Each question requires type choice or noul and instructions");
    if (q.type === "choice") {
      if (!object(q.criteria)) fail(400, "choice requires criteria");
      const criteria = Object.entries(q.criteria);
      if (!criteria.length || criteria.length > 32 || criteria.some(([k, v]) => !k.length || k.length > 128 || v !== null))
        fail(400, "criteria must contain 1 to 32 choices with null values");
    }
  }
  return body;
}

function normalizeIp(ip) {
  return ip?.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}
function clientIp(req) {
  const remote = normalizeIp(req.socket.remoteAddress);
  // Only the local reverse proxy may supply forwarding headers. Caddy appends
  // the verified peer at the right; never trust the caller-supplied left edge.
  if (remote === "127.0.0.1" || remote === "::1") {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string") return normalizeIp(xff.split(",").at(-1).trim());
  }
  return remote;
}
function allowedIp(ip, raw) {
  const limits = (raw || "").replaceAll(" ", "").split("\n").map(s => s.trim().replaceAll(",", "")).filter(Boolean);
  if (!limits.length) return true;
  const version = isIP(ip || "");
  if (!version) return false;
  for (const limit of limits) {
    try {
      const list = new BlockList();
      const parts = limit.split("/");
      const address = normalizeIp(parts[0]);
      const kind = isIP(address) === 4 ? "ipv4" : "ipv6";
      if (parts.length === 1) list.addAddress(address, kind);
      else if (parts.length === 2 && /^\d+$/.test(parts[1])) list.addSubnet(address, Number(parts[1]), kind);
      else continue;
      if (list.check(ip, version === 4 ? "ipv4" : "ipv6")) return true;
    } catch { /* malformed entries are ignored, as in common/ip.go */ }
  }
  return false;
}

function option(db, name, fallback) {
  const row = db.prepare("SELECT value FROM options WHERE key = ?").get(name);
  return row ? JSON.parse(row.value) : fallback;
}
function groupsFor(db, user, token) {
  // Defaults and special +/- rules from service/group.go and setting/*.go.
  const usable = option(db, "UserUsableGroups", { default: "default", vip: "vip" });
  const ratios = option(db, "group_ratio_setting.group_ratio",
    option(db, "GroupRatio", { default: 1, vip: 1, svip: 1 }));
  const special = option(db, "group_ratio_setting.group_special_usable_group", {});
  if (!object(usable) || !object(ratios) || !object(special)) throw new Error("Invalid group configuration");
  const permitted = new Set(Object.keys(usable));
  for (const name of Object.keys(special[user.group] || {})) {
    if (name.startsWith("-:")) permitted.delete(name.slice(2));
    else permitted.add(name.startsWith("+:") ? name.slice(2) : name);
  }
  if (user.group) permitted.add(user.group);
  const group = token.group || user.group;
  if (token.group && (!permitted.has(group) || (group !== "auto" && !owns(ratios, group))))
    fail(403, "Token group is not permitted");
  if (group !== "auto") return [group];
  let snapshot;
  try { snapshot = token.auto_groups ? JSON.parse(token.auto_groups) : null; }
  catch { return []; }
  if (snapshot !== null && !Array.isArray(snapshot)) return [];
  // SetupContextForToken only stores a valid nonempty snapshot. Invalid JSON
  // stores an empty snapshot; an explicit [] inherits global AutoGroups.
  const custom = snapshot && snapshot.length > 0;
  const source = custom ? snapshot : option(db, "AutoGroups", ["default"]);
  if (!Array.isArray(source)) throw new Error("Invalid auto groups");
  const groups = [...new Set(source.filter(g => typeof g === "string" && g !== "auto" && permitted.has(g) && owns(ratios, g)))];
  if (!custom) return groups;
  const max = option(db, "MaxTokenAutoGroups", 5);
  if (!Number.isSafeInteger(max) || max <= 0) throw new Error("Invalid auto group limit");
  return groups.slice(0, max);
}

function authenticate(db, key, ip) {
  // middleware/auth.go strips sk- and recognizes a channel suffix. This
  // endpoint deliberately refuses suffixes; clients cannot choose providers.
  const bare = key.startsWith("sk-") ? key.slice(3) : key;
  if (!bare || bare.includes("-")) fail(401, "Invalid API token");
  const token = db.prepare(`SELECT id, user_id, name, status, expired_time, remain_quota, unlimited_quota,
    model_limits_enabled, model_limits, allow_ips, "group", auto_groups, used_quota, accessed_time
    FROM tokens WHERE key = ? COLLATE BINARY AND deleted_at IS NULL`).get(bare);
  const now = Math.floor(Date.now() / 1000);
  if (!token || token.status !== 1 || (token.expired_time !== -1 && token.expired_time < now) ||
      (!token.unlimited_quota && token.remain_quota <= 0)) fail(401, "Invalid or exhausted API token");
  if (token.model_limits_enabled && !token.model_limits.split(",").includes(MODEL)) fail(403, "Model is not allowed by this token");
  if (!allowedIp(ip, token.allow_ips)) fail(403, "IP is not allowed by this token");
  const user = db.prepare(`SELECT id, username, status, quota, "group", used_quota, request_count
    FROM users WHERE id = ? AND deleted_at IS NULL`).get(token.user_id);
  if (!user || user.status !== 1) fail(403, "User is disabled");
  if (user.quota <= 0) fail(402, "Insufficient user balance");
  for (const group of groupsFor(db, user, token)) {
    const channel = db.prepare(`SELECT c.id FROM abilities a JOIN channels c ON c.id = a.channel_id
      WHERE a."group" = ? AND a.model = ? AND a.enabled = 1 AND c.status = 1
      AND rtrim(c.base_url, '/') = 'http://127.0.0.1:3010'
      ORDER BY a.priority DESC, c.id LIMIT 1`).get(group, MODEL);
    if (channel) return { token, user, group, channelId: channel.id, ip };
  }
  fail(403, "No enabled Decisions capability for this group");
}
function upstreamKey(db, envKey) {
  if (envKey?.trim()) return envKey.trim();
  const rows = db.prepare(`SELECT key, channel_info FROM channels
    WHERE status = 1 AND rtrim(base_url, '/') = 'https://openrouter.ai/api'
    ORDER BY CASE WHEN id = 14 THEN 0 ELSE 1 END, id`).all();
  for (const row of rows) {
    const key = row.key?.trim();
    if (!key || /[\r\n]/.test(key) || key.startsWith("[")) continue;
    const info = row.channel_info ? JSON.parse(row.channel_info) : {};
    if (!info.is_multi_key) return key;
  }
  fail(503, "Decisions upstream is unavailable");
}
function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const result = fn(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
function changed(result) {
  if (result.changes !== 1) throw new Error("Billing record unavailable");
}
function reserve(db, auth, amount) {
  changed(db.prepare("UPDATE users SET quota = quota - ? WHERE id = ? AND quota >= ?").run(amount, auth.user.id, amount));
  changed(db.prepare(`UPDATE tokens SET remain_quota = remain_quota - ? WHERE id = ?
    AND (unlimited_quota = 1 OR remain_quota >= ?)`).run(amount, auth.token.id, amount));
}
function refund(db, auth, amount) {
  transaction(db, () => {
    changed(db.prepare("UPDATE users SET quota = quota + ? WHERE id = ?").run(amount, auth.user.id));
    changed(db.prepare("UPDATE tokens SET remain_quota = remain_quota + ? WHERE id = ?").run(amount, auth.token.id));
  });
}
function settle(db, auth, reserved, quota, saleCost, usage, requestId, elapsed) {
  transaction(db, () => {
    const delta = quota - reserved;
    const now = Math.floor(Date.now() / 1000);
    const user = db.prepare("UPDATE users SET quota = quota - ?, used_quota = used_quota + ?, request_count = request_count + 1 WHERE id = ? AND quota >= ?")
      .run(delta, quota, auth.user.id, Math.max(0, delta));
    if (user.changes !== 1) fail(402, "Insufficient balance for final cost");
    const token = db.prepare(`UPDATE tokens SET remain_quota = remain_quota - ?, used_quota = used_quota + ?, accessed_time = ?
      WHERE id = ? AND (unlimited_quota = 1 OR remain_quota >= ?)`)
      .run(delta, quota, now, auth.token.id, Math.max(0, delta));
    if (token.changes !== 1) fail(402, "Insufficient token quota for final cost");
    changed(db.prepare("UPDATE channels SET used_quota = used_quota + ? WHERE id = ?").run(quota, auth.channelId));
    db.prepare(`INSERT INTO logs (user_id, created_at, type, content, username, token_name, model_name,
      quota, prompt_tokens, completion_tokens, use_time, is_stream, channel_id, token_id, "group", ip, request_id, other)
      VALUES (?, ?, 2, '', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`)
      .run(auth.user.id, now, auth.user.username, auth.token.name, MODEL, quota, usage.input_tokens,
        usage.output_tokens, Math.floor(elapsed / 1000), auth.channelId, auth.token.id, auth.group,
        auth.ip || "", requestId, JSON.stringify({ sale_cost: saleCost, billing_multiplier: 1.5 }));
  });
}
async function upstreamJson(response) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_RESPONSE) fail(502, "Invalid Decisions response");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Owns exact /v1/decisions, including body parsing; never uses permissive legacy auth. */
export function createDecisionsHandler({ dbPath, quotaPerUsd, fetchImpl = fetch,
  envKey = process.env.OPENROUTER_API_KEY, timeoutMs = 30000 } = {}) {
  if (!Number.isSafeInteger(quotaPerUsd) || quotaPerUsd <= 0) throw new Error("Invalid QUOTA_PER_USD");
  const reserveQuota = Math.max(1, Math.round(0.0001 * quotaPerUsd));
  return async function handleDecisions(req, res) {
    if ((req.url || "").split("?")[0] !== "/v1/decisions") return false;
    let db, auth, reserved = false;
    const start = Date.now();
    const requestId = `dec-${randomUUID()}`;
    try {
      if (req.method !== "POST") fail(405, "Use POST /v1/decisions");
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) fail(415, "Expected application/json");
      const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || "");
      if (!match) fail(401, "Missing Authorization Bearer token");
      if (!dbPath || !fs.existsSync(dbPath)) fail(503, "Billing database unavailable");
      db = new DatabaseSync(dbPath);
      db.exec("PRAGMA busy_timeout = 5000");
      auth = authenticate(db, match[1], clientIp(req));
      const key = upstreamKey(db, envKey);
      let payload;
      try { payload = JSON.parse((await readBody(req)).toString("utf8")); }
      catch (error) { if (error instanceof Failure) throw error; fail(400, "Invalid JSON body"); }
      validatePayload(payload);
      transaction(db, () => {
        auth = authenticate(db, match[1], clientIp(req));
        if (auth.user.quota < reserveQuota || (!auth.token.unlimited_quota && auth.token.remain_quota < reserveQuota))
          fail(402, "Insufficient balance for reservation");
        reserve(db, auth, reserveQuota);
      });
      reserved = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let result;
      try {
        const response = await fetchImpl(UPSTREAM, {
          method: "POST", redirect: "error", signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          await response.body?.cancel();
          fail(502, "Decisions upstream request failed");
        }
        result = await upstreamJson(response);
      } catch (error) {
        if (controller.signal.aborted) fail(504, "Decisions upstream timed out");
        if (error instanceof Failure) throw error;
        fail(502, "Invalid Decisions upstream response");
      } finally { clearTimeout(timer); }
      const usage = result?.usage;
      if (!object(result?.answers) || !object(usage) || typeof usage.cost !== "number" ||
          !Number.isFinite(usage.cost) || usage.cost < 0 ||
          !Number.isSafeInteger(usage.input_tokens) || usage.input_tokens < 0 ||
          !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0)
        fail(502, "Decisions response lacks valid billing usage");
      const saleCost = usage.cost * 1.5;
      // Same integer quota precision as new-api. No fixed minimum charge.
      const quota = Math.round(saleCost * quotaPerUsd);
      if (!Number.isSafeInteger(quota) || quota < 0) fail(502, "Invalid Decisions billing cost");
      settle(db, auth, reserveQuota, quota, saleCost, usage, requestId, Date.now() - start);
      reserved = false;
      json(res, 200, { id: requestId, model: MODEL, answers: result.answers,
        usage: { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost: saleCost } });
    } catch (error) {
      let status = error instanceof Failure ? error.status : 503;
      let message = error instanceof Failure ? error.message : "Decisions billing unavailable";
      if (reserved) {
        try { refund(db, auth, reserveQuota); }
        catch {
          status = 503; message = "Billing refund requires reconciliation";
          console.error("[decisions] refund failed", requestId, "user", auth.user.id, "token", auth.token.id, "quota", reserveQuota);
        }
      }
      // Never return upstream errors, headers, provider, IDs or credentials.
      json(res, status, { error: { message, type: status < 500 ? "invalid_request_error" : "server_error", code: "decisions_failed" } });
    } finally { db?.close(); }
    return true;
  };
}
