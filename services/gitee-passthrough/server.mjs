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
  return new DatabaseSync(DB_PATH, readonly ? { readOnly: true } : undefined);
}

function findGiteeChannelId(db) {
  try {
    const row = db
      .prepare(
        `SELECT id FROM channels WHERE name LIKE '%Gitee%' OR base_url LIKE '%gitee%' LIMIT 1`
      )
      .get();
    return row?.id || 0;
  } catch {
    return 0;
  }
}

/** Validate New API token */
async function validateToken(apiKey) {
  try {
    const r = await fetch(`${NEW_API_BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) return null;
  } catch {
    return null;
  }

  const db = openDb(true);
  if (!db) {
    return { userId: 0, tokenId: 0, name: "unknown", skipBill: true };
  }
  try {
    const row = db
      .prepare(
        `SELECT id, user_id, name, status, remain_quota, unlimited_quota
         FROM tokens WHERE key = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(apiKey);
    if (!row || row.status !== 1) return null;
    return {
      userId: row.user_id,
      tokenId: row.id,
      name: row.name,
      remainQuota: row.remain_quota,
      unlimited: !!row.unlimited_quota,
      skipBill: false,
    };
  } finally {
    db.close();
  }
}

function priceUsdForModel(modelId) {
  const m = modelMap[modelId];
  if (!m) return null;
  if (m.billing?.mode === "token") {
    const sellInUsd = (m.billing.sell_in_cny_per_m || 0) / (catalog.fx || 7.3);
    return Number((sellInUsd * 0.001).toFixed(6));
  }
  return m.billing?.model_price_usd ?? null;
}

function deductQuota(userId, tokenId, modelId, priceUsd) {
  if (!userId || !priceUsd || priceUsd <= 0) return { ok: true, quota: 0 };
  const quota = Math.max(1, Math.round(priceUsd * QUOTA_PER_USD));
  const db = openDb(false);
  if (!db) return { ok: true, quota: 0, skipped: true };
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
        `gpt_${now}_${Math.random().toString(36).slice(2, 10)}`,
        JSON.stringify({ source: "relay", price_usd: priceUsd })
      );
    } catch (logErr) {
      console.warn("log insert skipped:", logErr.message);
    }

    db.exec("COMMIT");
    return { ok: true, quota };
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    return { ok: false, quota, error: String(e.message || e) };
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

async function proxyToGitee(req, res, bodyBuf) {
  const target = `${GITEE_ORIGIN}${req.url}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  headers.authorization = `Bearer ${GITEE_KEY}`;
  headers["x-failover-enabled"] = headers["x-failover-enabled"] || "true";

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method || "") ? undefined : bodyBuf,
  });

  // 只回传必要头，避免上游 gitee / 模力方舟 响应头暴露中转来源
  const outHeaders = { "Access-Control-Allow-Origin": "*" };
  const ct = upstream.headers.get("content-type");
  if (ct) outHeaders["Content-Type"] = ct;
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, outHeaders);
  res.end(buf);
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
      models: catalog.models.length,
      db: fs.existsSync(DB_PATH),
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
      error: { message: "Upstream not configured", type: "server_error" },
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
      error: { message: "Invalid New API token", type: "auth_error" },
    });
  }

  const bodyBuf = ["GET", "HEAD"].includes(req.method || "")
    ? Buffer.alloc(0)
    : await readBody(req);

  if (urlPath.startsWith("/v1/task/")) {
    return proxyToGitee(req, res, bodyBuf);
  }

  const modelId = extractModel(req.url || "", bodyBuf, req.headers["content-type"]);
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

  if (!token.skipBill) {
    const bill = deductQuota(token.userId, token.tokenId, modelId, priceUsd);
    if (!bill.ok) {
      return json(res, 403, {
        error: {
          message:
            bill.error === "insufficient_quota" ? "额度不足" : bill.error,
          type: "billing_error",
        },
      });
    }
  }

  try {
    await proxyToGitee(req, res, bodyBuf);
  } catch (e) {
    json(res, 502, {
      error: { message: String(e.message || e), type: "upstream_error" },
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
