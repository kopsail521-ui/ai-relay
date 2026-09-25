/**
 * Gitee 透传网关（生产）
 *
 * 大白话：New API 不会的“特殊窗口”（检测/抠图/异步视频等），由本服务接手，
 * 转给模力方舟，并用客户的 New API 令牌扣费。
 *
 * Env:
 *   PORT=3010
 *   LISTEN_HOST=127.0.0.1
 *   GITEE_API_KEY=...
 *   GITEE_BASE_URL=https://ai.gitee.com
 *   OPENLUX_API_KEY=...   (for relay: openlux_passthrough models e.g. jev-1.13.0)
 *   OPENLUX_BASE_URL=https://api.openlux.ai
 *   NEW_API_BASE=http://127.0.0.1:3000
 *   NEW_API_DB=/data/one-api.db
 *   CATALOG=/app/catalog.json
 *   QUOTA_PER_USD=500000
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { fixMarketplaceMeta } from "./fix-marketplace-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  for (const p of [
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../.env"),
    "/opt/ai-relay/.env",
    "/opt/ai-relay/.env.gitee",
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}
loadEnvFile();

const PORT = Number(process.env.PORT || 3010);
const HOST = process.env.LISTEN_HOST || "127.0.0.1";
const GITEE_KEY = process.env.GITEE_API_KEY || process.env.GITEE_TOKEN || "";
const GITEE_ORIGIN = (process.env.GITEE_BASE_URL || "https://ai.gitee.com").replace(
  /\/v1\/?$/,
  ""
);
const OPENLUX_KEY = process.env.OPENLUX_API_KEY || "";
const OPENLUX_ORIGIN = (
  process.env.OPENLUX_BASE_URL || "https://api.openlux.ai"
).replace(/\/v1\/?$/, "");
const NEW_API_BASE = (process.env.NEW_API_BASE || "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);
const DB_PATH = process.env.NEW_API_DB || "/data/one-api.db";
const CATALOG_PATH =
  process.env.CATALOG || path.join(__dirname, "catalog.json");
const QUOTA_PER_USD = Number(process.env.QUOTA_PER_USD || 500000);

const PASSTHROUGH_PREFIXES = [
  "/v1/images/object-detection",
  "/v1/images/segmentation",
  "/v1/images/pose-detection",
  "/v1/images/upscaling",
  "/v1/images/unwarping",
  "/v1/images/mattings",
  "/v1/async/",
  "/v1/task/",
  "/v1/systemone",
];

if (!fs.existsSync(CATALOG_PATH)) {
  console.error("Missing catalog:", CATALOG_PATH);
  process.exit(1);
}
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const modelMap = Object.fromEntries(catalog.models.map((m) => [m.id, m]));

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(data);
}

function isPassthrough(urlPath) {
  return PASSTHROUGH_PREFIXES.some(
    (p) => urlPath === p || urlPath.startsWith(p)
  );
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function extractBearer(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}

function openDb(readonly = false) {
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    // DatabaseSync requires options object (not undefined)
    return new DatabaseSync(DB_PATH, readonly ? { readOnly: true } : {});
  } catch (e) {
    console.error("[gitee-passthrough] openDb failed:", e.message || e);
    return null;
  }
}

function findGiteeChannelId(db) {
  try {
    const row = db
      .prepare(
        `SELECT id FROM channels WHERE name LIKE '%Keyo Media%' OR name LIKE '%Gitee%' OR base_url LIKE '%gitee%' LIMIT 1`
      )
      .get();
    return row?.id || 0;
  } catch {
    return 0;
  }
}

function tokenKeyCandidates(apiKey) {
  const raw = String(apiKey || "").trim();
  const bare = raw.replace(/^sk-/i, "").trim();
  const base = bare.split("-")[0];
  return [bare, raw, base, `sk-${bare}`].filter(
    (v, i, a) => v && a.indexOf(v) === i
  );
}

function lookupTokenRow(db, apiKey) {
  const keyCandidates = tokenKeyCandidates(apiKey);
  const select =
    "SELECT id, user_id, name, status, remain_quota, unlimited_quota FROM tokens";
  const queries = [
    `${select} WHERE key = ? AND deleted_at IS NULL LIMIT 1`,
    `${select} WHERE key = ? LIMIT 1`,
    `${select} WHERE key = ? COLLATE NOCASE AND deleted_at IS NULL LIMIT 1`,
    `${select} WHERE key = ? COLLATE NOCASE LIMIT 1`,
    `${select} WHERE lower(trim(key)) = lower(trim(?)) AND deleted_at IS NULL LIMIT 1`,
    `${select} WHERE lower(trim(key)) = lower(trim(?)) LIMIT 1`,
  ];
  for (const sql of queries) {
    try {
      for (const k of keyCandidates) {
        const row = db.prepare(sql).get(k);
        if (row) return row;
      }
    } catch (e) {
      // older schema may lack deleted_at / COLLATE — try next query
      console.warn("[gitee-passthrough] token lookup:", e.message || e);
    }
  }
  return null;
}

/** True auth probe — prefer usage; fall back to /v1/models (may be weak). */
async function probeNewApiToken(apiKey) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  try {
    const usage = await fetch(`${NEW_API_BASE}/api/usage/token/`, { headers });
    if (usage.ok) return true;
    // 404/405 = endpoint missing; 401/403 = this path may not accept sk- tokens — try models
    if (![401, 403, 404, 405].includes(usage.status) && usage.status < 500) {
      return false;
    }
  } catch (e) {
    console.warn("[gitee-passthrough] usage probe failed:", e.message || e);
  }
  try {
    const r = await fetch(`${NEW_API_BASE}/v1/models`, { headers });
    return r.ok;
  } catch (e) {
    console.warn("[gitee-passthrough] models probe failed:", e.message || e);
    return false;
  }
}

/** Validate New API token — DB hit is authoritative for billing; New API probe is fallback. */
async function validateToken(apiKey) {
  const db = openDb(true);
  if (db) {
    try {
      const row = lookupTokenRow(db, apiKey);
      if (row && Number(row.status) === 1) {
        return {
          userId: row.user_id,
          tokenId: row.id,
          name: row.name,
          remainQuota: row.remain_quota,
          unlimited: !!row.unlimited_quota,
          skipBill: false,
        };
      }
      if (row && Number(row.status) !== 1) {
        console.warn(
          "[gitee-passthrough] token disabled status=",
          row.status,
          "id=",
          row.id
        );
        return null;
      }
    } finally {
      db.close();
    }
  } else {
    console.warn("[gitee-passthrough] DB missing at", DB_PATH);
  }

  // No local row: allow through only if New API accepts the key (skip local bill).
  const authed = await probeNewApiToken(apiKey);
  if (!authed) return null;
  if (!fs.existsSync(DB_PATH)) {
    return { userId: 0, tokenId: 0, name: "unknown", skipBill: true };
  }
  console.warn(
    "[gitee-passthrough] token not in DB after auth OK; db=",
    DB_PATH,
    "bare_prefix=",
    String(apiKey).replace(/^sk-/i, "").trim().slice(0, 12)
  );
  return null;
}

function priceUsdForModel(modelId) {
  const m = modelMap[modelId];
  if (!m) return null;
  if (m.billing?.mode === "token") {
    // Approximate floor for pre-check (1000 input tokens). Prefer usage billing.
    const sellInUsd =
      m.billing.sell_in_usd_per_m != null
        ? Number(m.billing.sell_in_usd_per_m)
        : (m.billing.sell_in_cny_per_m || 0) / (catalog.fx || 7.3);
    return Number((sellInUsd * 0.001).toFixed(6));
  }
  return m.billing?.model_price_usd ?? null;
}

function sellUsdPerM(modelId) {
  const m = modelMap[modelId];
  if (!m || m.billing?.mode !== "token") return null;
  const fx = catalog.fx || 7.3;
  const sellIn =
    m.billing.sell_in_usd_per_m != null
      ? Number(m.billing.sell_in_usd_per_m)
      : (m.billing.sell_in_cny_per_m || 0) / fx;
  const sellOut =
    m.billing.sell_out_usd_per_m != null
      ? Number(m.billing.sell_out_usd_per_m)
      : (m.billing.sell_out_cny_per_m || 0) / fx;
  return { sellIn, sellOut };
}

function priceUsdFromUsage(modelId, usage) {
  const rates = sellUsdPerM(modelId);
  if (!rates) return null;
  const tin = Number(
    usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.total_tokens ?? 0
  );
  const tout = Number(usage?.output_tokens ?? usage?.completion_tokens ?? 0);
  const usd = (tin / 1e6) * rates.sellIn + (tout / 1e6) * rates.sellOut;
  return Number(Math.max(0, usd).toFixed(8));
}

function deductQuota(userId, tokenId, modelId, priceUsd) {
  if (!userId || !priceUsd || priceUsd <= 0) return { ok: true, quota: 0 };
  const quota = Math.max(1, Math.round(priceUsd * QUOTA_PER_USD));
  const db = openDb(false);
  if (!db) return { ok: true, quota: 0, skipped: true };
  const requestId = `gpt_${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    db.exec("BEGIN");
    const user = db.prepare(`SELECT quota FROM users WHERE id = ?`).get(userId);
    if (!user || user.quota < quota) {
      db.exec("ROLLBACK");
      return { ok: false, quota, error: "insufficient_quota" };
    }
    db.prepare(
      `UPDATE users SET quota = quota - ?, used_quota = used_quota + ?, request_count = request_count + 1 WHERE id = ?`
    ).run(quota, quota, userId);

    const tok = db
      .prepare(`SELECT unlimited_quota FROM tokens WHERE id = ?`)
      .get(tokenId);
    if (tok && !tok.unlimited_quota) {
      db.prepare(
        `UPDATE tokens SET remain_quota = remain_quota - ?, used_quota = used_quota + ? WHERE id = ?`
      ).run(quota, quota, tokenId);
    }

    const channelId = findGiteeChannelId(db);
    const now = Math.floor(Date.now() / 1000);
    try {
      db.prepare(
        `INSERT INTO logs (
          user_id, created_at, type, content, username, token_name, model_name,
          quota, prompt_tokens, completion_tokens, use_time, is_stream,
          channel_id, token_id, "group", ip, request_id, upstream_request_id, other
        ) VALUES (?, ?, 2, ?, '', '', ?, ?, 0, 0, 0, 0, ?, ?, '', '', ?, '', ?)`
      ).run(
        userId,
        now,
        `relay model=${modelId} price_usd=${priceUsd}`,
        modelId,
        quota,
        channelId,
        tokenId,
        requestId,
        JSON.stringify({ source: "relay", price_usd: priceUsd })
      );
    } catch (logErr) {
      console.warn("log insert skipped:", logErr.message);
    }

    db.exec("COMMIT");
    return { ok: true, quota, requestId };
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    return { ok: false, quota, error: String(e.message || e) };
  } finally {
    db.close();
  }
}

function refundQuota(userId, tokenId, bill) {
  if (!userId || !bill?.quota) return;
  const db = openDb(false);
  if (!db) return;
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("BEGIN");
    db.prepare(
      `UPDATE users SET quota = quota + ?, used_quota = MAX(0, used_quota - ?) WHERE id = ?`
    ).run(bill.quota, bill.quota, userId);
    const token = db
      .prepare(`SELECT unlimited_quota FROM tokens WHERE id = ?`)
      .get(tokenId);
    if (token && !token.unlimited_quota) {
      db.prepare(
        `UPDATE tokens SET remain_quota = remain_quota + ?, used_quota = MAX(0, used_quota - ?) WHERE id = ?`
      ).run(bill.quota, bill.quota, tokenId);
    }
    if (bill.requestId) {
      try {
        db.prepare(
          `UPDATE logs SET quota = 0, content = content || ' (refunded: request rejected)' WHERE request_id = ?`
        ).run(bill.requestId);
      } catch (e) {
        console.warn("[gitee-passthrough] refund log update skipped:", e.message);
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error("[gitee-passthrough] quota refund failed:", e.message || e);
  } finally {
    db.close();
  }
}

function extractModel(urlPath, bodyBuf, contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("multipart/form-data")) {
    const s = bodyBuf.toString("utf8");
    const m = /name="model"\r?\n\r?\n([^\r\n]+)/i.exec(s);
    if (m) return m[1].trim();
  }
  if (ct.includes("application/json") || (bodyBuf.length && bodyBuf[0] === 0x7b)) {
    try {
      const j = JSON.parse(bodyBuf.toString("utf8"));
      if (j.model) return String(j.model);
    } catch {}
  }
  try {
    const u = new URL(urlPath, "http://x");
    if (u.searchParams.get("model")) return u.searchParams.get("model");
  } catch {}
  return "";
}

function scrubGiteeErrorBuf(buf, ct) {
  const type = String(ct || "").toLowerCase();
  if (!type.includes("json") && !type.includes("text") && type !== "") {
    return buf;
  }
  let t = buf.toString("utf8");
  const before = t;
  t = t
    .replace(/https?:\/\/ai\.gitee\.com[^\s"'\\]*/gi, "[redacted]")
    .replace(/模力方舟/g, "provider")
    .replace(/\bMoArk\b/gi, "provider")
    .replace(/\bGitee(?:\s*AI)?\b/gi, "provider");
  if (t === before) return buf;
  return Buffer.from(t, "utf8");
}

async function prepareInfiniteTalkRequest(bodyBuf, contentType) {
  if (!/multipart\/form-data/i.test(String(contentType || ""))) {
    return {
      error: "InfiniteTalk requires multipart/form-data",
      code: "invalid_infinitetalk_content_type",
    };
  }
  let form;
  try {
    form = await new Request("http://localhost/", {
      method: "POST",
      headers: { "content-type": contentType },
      body: bodyBuf,
    }).formData();
  } catch {
    return { error: "Invalid multipart body", code: "invalid_multipart_body" };
  }

  let changed = false;
  for (const [legacy, current] of [
    ["image", "cond_video"],
    ["audio", "cond_audio"],
  ]) {
    if (!form.has(current) && form.has(legacy)) {
      form.set(current, form.get(legacy));
      changed = true;
    }
    if (form.has(legacy)) {
      form.delete(legacy);
      changed = true;
    }
  }
  const missing = ["model", "prompt", "cond_video", "cond_audio"].filter(
    (field) => {
      const value = form.get(field);
      return value == null || (typeof value === "string" && !value.trim());
    }
  );
  if (missing.length) {
    return {
      error: `InfiniteTalk requires multipart fields: ${missing.join(", ")}`,
      code: "missing_infinitetalk_field",
    };
  }
  if (String(form.get("model")) !== "InfiniteTalk") {
    return { error: "Invalid model for this endpoint", code: "invalid_model" };
  }
  const audio = form.get("cond_audio");
  if (!(audio instanceof Blob)) {
    return {
      error: "InfiniteTalk cond_audio must be an uploaded audio file",
      code: "invalid_infinitetalk_audio",
    };
  }
  // Duration follows audio (upstream InfiniteTalk is unlimited-length). Do not
  // split long audio into 15s chunks on Keyo's side.
  if (!changed) return { body: bodyBuf, contentType };
  const request = new Request("http://localhost/", { method: "POST", body: form });
  return {
    body: Buffer.from(await request.arrayBuffer()),
    contentType: request.headers.get("content-type"),
  };
}

function upstreamCreds(modelId) {
  const relay = modelMap[modelId]?.relay || "";
  if (relay === "openlux_passthrough" || relay === "openlux") {
    if (!OPENLUX_KEY) {
      throw new Error("OPENLUX_API_KEY missing for openlux_passthrough model");
    }
    return { origin: OPENLUX_ORIGIN, key: OPENLUX_KEY };
  }
  return { origin: GITEE_ORIGIN, key: GITEE_KEY };
}

async function proxyToGitee(
  req,
  res,
  bodyBuf,
  { capture = false, timeoutMs = 0, modelId = "", deferWrite = false } = {}
) {
  const { origin, key } = upstreamCreds(modelId);
  const target = `${origin}${req.url}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  headers.authorization = `Bearer ${key}`;
  headers["x-failover-enabled"] = headers["x-failover-enabled"] || "true";

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method || "") ? undefined : bodyBuf,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });

  // 只回传必要头，避免上游响应头暴露来源；错误体 scrub 供应商名
  const outHeaders = { "Access-Control-Allow-Origin": "*" };
  const ct = upstream.headers.get("content-type");
  if (ct) outHeaders["Content-Type"] = ct;
  let buf = Buffer.from(await upstream.arrayBuffer());
  const pathOnly = (req.url || "/").split("?")[0];
  if (upstream.status >= 400) {
    buf = scrubGiteeErrorBuf(buf, ct);
  } else {
    buf = enrichGiteeClientJson(pathOnly, buf, ct);
    if (ct && /json/i.test(ct)) {
      outHeaders["Content-Type"] = "application/json; charset=utf-8";
    }
  }
  if (!deferWrite) {
    res.writeHead(upstream.status, outHeaders);
    res.end(buf);
  }
  let parsed = null;
  try {
    parsed = JSON.parse(buf.toString("utf8") || "{}");
  } catch {}
  if (!capture && !deferWrite) return { status: upstream.status };
  return { status: upstream.status, body: parsed, buf, headers: outHeaders };
}

function extractTaskId(body) {
  if (!body || typeof body !== "object") return "";
  return String(
    body.task_id ||
      body.id ||
      body.data?.task_id ||
      body.data?.id ||
      (Array.isArray(body.data) && body.data[0]?.task_id) ||
      (Array.isArray(body.data) && body.data[0]?.id) ||
      ""
  ).trim();
}

function softCheckQuota(userId, minQuota) {
  const db = openDb(true);
  try {
    const user = db
      ?.prepare(`SELECT quota FROM users WHERE id = ?`)
      .get(userId);
    if (!user || user.quota < minQuota) {
      return { ok: false, error: "insufficient_quota" };
    }
    return { ok: true };
  } finally {
    db?.close();
  }
}

/**
 * Make Gitee async responses AI-agent friendly without breaking old clients:
 * - always expose top-level id + task_id
 * - map status success/failure/waiting → completed/failed/processing
 * - alias output.file_url → url (+ Path-B-like data.result.videos when it's a media file)
 */
function enrichGiteeClientJson(pathOnly, buf, ct) {
  if (!ct || !/json/i.test(String(ct))) return buf;
  let j;
  try {
    j = JSON.parse(buf.toString("utf8") || "{}");
  } catch {
    return buf;
  }
  const isPoll = pathOnly.startsWith("/v1/task/");
  const isSubmit = pathOnly.startsWith("/v1/async/");
  if (!isPoll && !isSubmit) return buf;

  const pollId = isPoll ? pathOnly.split("/").filter(Boolean).pop() : "";
  const tid = String(j.task_id || j.id || pollId || "");
  if (tid) {
    if (j.id == null || j.id === "") j.id = tid;
    if (j.task_id == null || j.task_id === "") j.task_id = tid;
  }

  if (isPoll) {
    const rawSt = j.status;
    const mapped = mapGiteeStatus(rawSt);
    if (mapped) {
      if (rawSt != null && String(rawSt).toLowerCase() !== mapped) {
        j.status_raw = rawSt;
      }
      j.status = mapped;
    }
    const fileUrl =
      (j.output && j.output.file_url) || j.file_url || j.url || "";
    if (fileUrl) {
      j.url = fileUrl;
      if (!j.output || typeof j.output !== "object") j.output = {};
      if (!j.output.file_url) j.output.file_url = fileUrl;
      if (!j.data || typeof j.data !== "object" || Array.isArray(j.data)) {
        j.data = {
          id: tid || j.id,
          task_id: tid || j.task_id,
          status: j.status,
          result: { videos: [{ url: [fileUrl] }] },
        };
      }
    } else if (j.output && Array.isArray(j.output.segments)) {
      const text = j.output.segments
        .map((s) => (s && s.content != null ? String(s.content) : ""))
        .filter(Boolean)
        .join("\n");
      if (text && (j.text == null || j.text === "")) j.text = text;
      if (!j.data || typeof j.data !== "object" || Array.isArray(j.data)) {
        j.data = {
          id: tid || j.id,
          task_id: tid || j.task_id,
          status: j.status,
          output: j.output,
        };
      }
    } else if (tid && (!j.data || typeof j.data !== "object")) {
      j.data = { id: tid, task_id: tid, status: j.status };
    }
  }

  return Buffer.from(JSON.stringify(j), "utf8");
}

function mapGiteeStatus(raw) {
  const st = String(raw || "").toLowerCase();
  if (!st) return "";
  if (["success", "succeeded", "completed", "done"].includes(st)) return "completed";
  if (["failure", "failed", "error"].includes(st)) return "failed";
  if (["cancelled", "canceled"].includes(st)) return "cancelled";
  if (
    [
      "waiting",
      "pending",
      "queued",
      "in_progress",
      "running",
      "processing",
      "submitted",
    ].includes(st)
  ) {
    return "processing";
  }
  return st;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization,Content-Type,X-Failover-Enabled",
    });
    return res.end();
  }

  const urlPath = (req.url || "/").split("?")[0];

  if (urlPath === "/healthz") {
    return json(res, 200, {
      ok: true,
      key: !!GITEE_KEY,
      models: catalog.models.length,
      db: fs.existsSync(DB_PATH),
      db_path: DB_PATH,
      new_api: NEW_API_BASE,
    });
  }

  // 内网修正模型广场分类（单标签）
  if (urlPath === "/internal/fix-marketplace-meta" && req.method === "POST") {
    const secret = req.headers["x-fix-secret"] || "";
    if (secret !== GITEE_KEY || !GITEE_KEY) {
      return json(res, 403, { error: "forbidden" });
    }
    try {
      const result = fixMarketplaceMeta(DB_PATH);
      return json(res, 200, { ok: true, ...result });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (!isPassthrough(urlPath)) {
    return json(res, 404, {
      error: {
        message: "Invalid path for this endpoint.",
        type: "invalid_request_error",
      },
    });
  }

  if (!GITEE_KEY) {
    return json(res, 500, {
      error: { message: "Service temporarily unavailable", type: "server_error" },
    });
  }

  const apiKey = extractBearer(req);
  if (!apiKey) {
    return json(res, 401, {
      error: {
        message: "Missing Authorization Bearer token",
        type: "auth_error",
      },
    });
  }

  const token = await validateToken(apiKey);
  if (!token) {
    return json(res, 401, {
      error: {
        message:
          "Token rejected by special-path gateway (models OK but billing lookup failed). Check NEW_API_DB mount.",
        type: "auth_error",
        code: "passthrough_token_lookup_failed",
      },
    });
  }

  const bodyBuf = ["GET", "HEAD"].includes(req.method || "")
    ? Buffer.alloc(0)
    : await readBody(req);

  if (urlPath.startsWith("/v1/task/")) {
    return proxyToGitee(req, res, bodyBuf);
  }

  let forwardBuf = bodyBuf;
  if (urlPath === "/v1/async/videos/image-to-video") {
    const prepared = await prepareInfiniteTalkRequest(
      bodyBuf,
      req.headers["content-type"]
    );
    if (prepared.error) {
      return json(res, 400, {
        error: {
          message: prepared.error,
          type: "invalid_request_error",
          code: prepared.code,
        },
      });
    }
    forwardBuf = prepared.body;
    req.headers["content-type"] = prepared.contentType;
  }
  // The async speech contract uses `inputs` (plural). Accept the common
  // OpenAI-style `input` alias so existing clients do not fail with 400.
  if (
    urlPath === "/v1/async/audio/speech" &&
    bodyBuf.length &&
    String(req.headers["content-type"] || "").includes("json")
  ) {
    try {
      const body = JSON.parse(bodyBuf.toString("utf8") || "{}");
      if (body.inputs == null && body.input != null) body.inputs = body.input;
      delete body.input;
      forwardBuf = Buffer.from(JSON.stringify(body), "utf8");
    } catch {}
  }
  // Duix-Avatar upstream requires ref_audio / ref_video (normalize common aliases).
  if (
    urlPath.includes("/async/videos/audio-video-to-video") &&
    bodyBuf.length &&
    String(req.headers["content-type"] || "").includes("json")
  ) {
    try {
      const body = JSON.parse(bodyBuf.toString("utf8") || "{}");
      if (!body.ref_audio && (body.audio_url || body.audio)) {
        body.ref_audio = body.audio_url || body.audio;
      }
      if (!body.ref_video && (body.video_url || body.video)) {
        body.ref_video = body.video_url || body.video;
      }
      forwardBuf = Buffer.from(JSON.stringify(body), "utf8");
    } catch {}
  }

  const modelId = urlPath === "/v1/async/videos/image-to-video"
    ? "InfiniteTalk"
    : extractModel(req.url || "", forwardBuf, req.headers["content-type"]);
  if (!modelId || !modelMap[modelId]) {
    return json(res, 400, {
      error: {
        message: `Unknown or missing model: ${modelId || "(empty)"}`,
        type: "invalid_request_error",
      },
    });
  }

  const priceUsd = priceUsdForModel(modelId);
  if (priceUsd == null) {
    return json(res, 400, {
      error: {
        message: `No price for model ${modelId}`,
        type: "invalid_request_error",
      },
    });
  }

  const usageBill = urlPath === "/v1/systemone" && !!sellUsdPerM(modelId);
  // InfiniteTalk: bill only after upstream returns a pollable task_id (avoids
  // 504 submission_status_unknown keeping a precharge with nothing to poll).
  const billAfterTaskId = modelId === "InfiniteTalk";
  const infinitetalkTimeoutMs = Number(
    process.env.INFINITETALK_SUBMIT_TIMEOUT_MS || 600000
  );

  let precharged = null;
  if (!token.skipBill && !usageBill && !billAfterTaskId) {
    precharged = deductQuota(token.userId, token.tokenId, modelId, priceUsd);
    if (!precharged.ok) {
      return json(res, 403, {
        error: {
          message:
            precharged.error === "insufficient_quota" ? "额度不足" : precharged.error,
          type: "billing_error",
        },
      });
    }
  } else if (!token.skipBill && (usageBill || billAfterTaskId)) {
    const minQuota = billAfterTaskId
      ? Math.max(1, Math.round(priceUsd * QUOTA_PER_USD))
      : 1;
    const soft = softCheckQuota(token.userId, minQuota);
    if (!soft.ok) {
      return json(res, 403, {
        error: { message: "额度不足", type: "billing_error" },
      });
    }
  }

  try {
    if (billAfterTaskId) {
      const captured = await proxyToGitee(req, res, forwardBuf, {
        capture: true,
        deferWrite: true,
        timeoutMs: infinitetalkTimeoutMs,
        modelId,
      });
      if (captured.status >= 400) {
        res.writeHead(captured.status, captured.headers);
        res.end(captured.buf);
        return;
      }
      const tid = extractTaskId(captured.body);
      if (!tid) {
        return json(res, 502, {
          error: {
            message:
              "upstream accepted submit but returned no task_id; retry or contact support",
            type: "server_error",
            code: "missing_task_id",
          },
        });
      }
      if (!token.skipBill) {
        const bill = deductQuota(
          token.userId,
          token.tokenId,
          modelId,
          priceUsd
        );
        if (!bill.ok) {
          console.warn(
            "[gitee-passthrough] InfiniteTalk post-task_id bill failed",
            bill.error,
            "task_id",
            tid
          );
        }
      }
      res.writeHead(captured.status, captured.headers);
      res.end(captured.buf);
      return;
    }

    const captured = await proxyToGitee(req, res, forwardBuf, {
      capture: usageBill,
      timeoutMs: 0,
      modelId,
    });
    if (precharged?.quota > 0 && captured?.status >= 400) {
      refundQuota(token.userId, token.tokenId, precharged);
    }
    if (usageBill && !token.skipBill && captured && captured.status < 400) {
      const usd =
        priceUsdFromUsage(modelId, captured.body?.usage) ?? priceUsd;
      if (usd > 0) {
        const bill = deductQuota(token.userId, token.tokenId, modelId, usd);
        if (!bill.ok) {
          console.warn(
            "[gitee-passthrough] post-usage bill failed",
            modelId,
            bill.error
          );
        }
      }
    }
  } catch (e) {
    if (precharged?.quota > 0) {
      refundQuota(token.userId, token.tokenId, precharged);
    }
    const timedOut = e?.name === "TimeoutError";
    json(res, timedOut ? 504 : 502, {
      error: {
        message: timedOut
          ? "Task submission timed out; creation status is unknown. Do not resubmit blindly. Contact support with the request time."
          : String(e.message || e),
        type: "server_error",
        code: timedOut ? "submission_status_unknown" : "upstream_error",
      },
    });
  }
});

function runMarketplaceFixOnBoot() {
  if (!fs.existsSync(DB_PATH)) return;
  try {
    const r = fixMarketplaceMeta(DB_PATH);
    console.log("marketplace meta fix on boot:", JSON.stringify(r.tagCounts));
    if (r.multiTag.length) console.warn("multi-tag still:", r.multiTag);
  } catch (e) {
    console.warn("marketplace meta fix skipped:", e.message);
  }
}

runMarketplaceFixOnBoot();

server.listen(PORT, HOST, () => {
  console.log(`Gitee passthrough on http://${HOST}:${PORT}`);
  console.log(`  models: ${catalog.models.length}`);
  console.log(`  gitee: ${GITEE_ORIGIN}`);
  console.log(`  new-api: ${NEW_API_BASE}`);
  console.log(`  db: ${DB_PATH} exists=${fs.existsSync(DB_PATH)}`);
});
