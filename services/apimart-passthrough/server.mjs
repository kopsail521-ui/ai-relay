/**
 * APIMart 视频透传（KeyoAPI）
 *
 * 客户：POST /v1/videos/generations + GET /v1/tasks/{id}
 * 鉴权：New API 令牌；上游：APIMart Key
 * 扣费：预扣估算价；出片后按 upstream cost(USD) × MARKUP 多退少补
 *
 * Env:
 *   PORT=3011
 *   LISTEN_HOST=127.0.0.1
 *   APIMART_API_KEY=sk-...
 *   APIMART_BASE_URL=https://api.apimart.ai
 *   NEW_API_BASE=http://127.0.0.1:3000
 *   NEW_API_DB=/data/one-api.db
 *   CATALOG=/app/catalog.json
 *   QUOTA_PER_USD=500000
 *   MARKUP=1.2
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  for (const p of [
    path.resolve(__dirname, "../../.env.apimart"),
    path.resolve(__dirname, "../../.env"),
    "/opt/ai-relay/.env.apimart",
    "/opt/ai-relay/.env",
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

const PORT = Number(process.env.PORT || 3011);
const HOST = process.env.LISTEN_HOST || "127.0.0.1";
const APIMART_KEY = process.env.APIMART_API_KEY || "";
const APIMART_ORIGIN = (
  process.env.APIMART_BASE_URL || "https://api.apimart.ai"
).replace(/\/v1\/?$/, "");
const NEW_API_BASE = (process.env.NEW_API_BASE || "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);
const DB_PATH = process.env.NEW_API_DB || "/data/one-api.db";
const CATALOG_PATH =
  process.env.CATALOG || path.join(__dirname, "catalog.json");
const QUOTA_PER_USD = Number(process.env.QUOTA_PER_USD || 500000);
const MARKUP = Number(process.env.MARKUP || 1.2);
const PENDING_PATH =
  process.env.APIMART_PENDING_DB ||
  path.join(path.dirname(DB_PATH), "apimart-pending.db");

if (!fs.existsSync(CATALOG_PATH)) {
  console.error("Missing catalog:", CATALOG_PATH);
  process.exit(1);
}
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const FX = Number(catalog.fx_cny_usd || 7.3);
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

function openDb(dbPath, readonly = false) {
  if (!fs.existsSync(dbPath) && readonly) return null;
  return new DatabaseSync(dbPath, readonly ? { readOnly: true } : undefined);
}

function initPending() {
  const dir = path.dirname(PENDING_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = openDb(PENDING_PATH, false);
  db.exec(`CREATE TABLE IF NOT EXISTS pending (
    task_id TEXT PRIMARY KEY,
    user_id INTEGER,
    token_id INTEGER,
    model TEXT,
    precharge_usd REAL,
    settled INTEGER DEFAULT 0,
    created_at INTEGER
  )`);
  db.close();
}
initPending();

function extractBearer(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function validateToken(apiKey) {
  try {
    const r = await fetch(`${NEW_API_BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) return null;
  } catch {
    return null;
  }
  const db = openDb(DB_PATH, true);
  if (!db) return { userId: 0, tokenId: 0, skipBill: true };
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
      remainQuota: row.remain_quota,
      unlimited: !!row.unlimited_quota,
      skipBill: false,
    };
  } finally {
    db.close();
  }
}

function findChannelId(db) {
  try {
    const row = db
      .prepare(
        `SELECT id FROM channels WHERE name LIKE '%APIMart%' OR base_url LIKE '%apimart%' LIMIT 1`
      )
      .get();
    return row?.id || 0;
  } catch {
    return 0;
  }
}

function normRes(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function pickRate(map, ...keys) {
  if (!map) return 0;
  for (const k of keys) {
    if (k == null || k === "") continue;
    if (map[k] != null) return Number(map[k]);
    const nk = normRes(k);
    for (const [mk, mv] of Object.entries(map)) {
      if (normRes(mk) === nk) return Number(mv);
    }
  }
  const vals = Object.values(map);
  return vals.length ? Number(vals[0]) : 0;
}

function hasRefVideo(body) {
  return !!(
    body.video_url ||
    body.reference_video ||
    body.ref_video ||
    (Array.isArray(body.video_urls) && body.video_urls.length) ||
    body.uploaded_video
  );
}

function estimateCostUsd(modelMeta, body) {
  const est = modelMeta.estimate || {};
  if (est.mode === "fixed") return Number(est.cost_usd || 0);

  let seconds = Number(body.duration ?? body.seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    seconds = Number(est.default_seconds || 5);
  }
  if (seconds === -1) seconds = Number(est.default_seconds || 30);

  if (est.mode === "per_second") {
    return seconds * Number(est.cost_usd_per_second || 0);
  }

  const resRaw = body.resolution || body.size || est.default_resolution || "";
  const resKey = normRes(resRaw);

  if (est.mode === "per_second_resolution_cny") {
    const map = est.cost_cny_per_second || {};
    const cny = pickRate(map, body.resolution, resKey, est.default_resolution);
    let cost = (seconds * Number(cny)) / FX;
    if (body.draft === true && est.draft_factor) cost *= Number(est.draft_factor);
    return cost;
  }

  if (est.mode === "per_second_resolution") {
    const map = est.cost_usd_per_second || {};
    const rate = pickRate(map, body.resolution, resKey, est.default_resolution);
    let cost = seconds * Number(rate);
    if (body.draft === true && est.draft_factor) cost *= Number(est.draft_factor);
    if (est.extra_image_over_5_usd && Array.isArray(body.image_urls)) {
      const over = Math.max(0, body.image_urls.length - 5);
      cost += over * Number(est.extra_image_over_5_usd);
    }
    return cost;
  }

  // Seedance: 有参考视频 → (参考秒+生成秒)×input 单价；否则 生成秒×输出单价
  if (est.mode === "per_second_resolution_input") {
    const withInput = hasRefVideo(body);
    const map = withInput
      ? est.cost_usd_per_second_with_input || est.cost_usd_per_second
      : est.cost_usd_per_second || {};
    const rate = pickRate(map, body.resolution, resKey, est.default_resolution);
    let billSeconds = seconds;
    if (withInput) {
      const refSec = Number(
        body.reference_duration ?? body.ref_duration ?? body.video_duration ?? 0
      );
      if (Number.isFinite(refSec) && refSec > 0) billSeconds += refSec;
    }
    return billSeconds * Number(rate);
  }

  // FLUX：按 DRAFT/HD/FHD/V2V-* 档位按秒
  if (est.mode === "flux_tiers") {
    const tier =
      body.tier ||
      body.mode ||
      body.quality ||
      body.resolution ||
      est.default_tier ||
      "HD";
    const map = est.cost_usd_per_second || {};
    const rate = pickRate(map, tier, normRes(tier), est.default_tier);
    return seconds * Number(rate);
  }

  // Omni Ext：有参考视频按秒；否则按 分辨率-时长 档位包
  if (est.mode === "ext_pack_or_ref") {
    if (hasRefVideo(body)) {
      const map = est.ref_video_cost_usd_per_second || {};
      const rate = pickRate(map, body.resolution, resKey, "720P");
      let billSeconds = seconds;
      const refSec = Number(
        body.reference_duration ?? body.ref_duration ?? body.video_duration ?? 0
      );
      if (Number.isFinite(refSec) && refSec > 0) billSeconds += refSec;
      return billSeconds * Number(rate);
    }
    const packs = est.pack_cost_usd || {};
    const packKey =
      body.pack ||
      body.spec ||
      `${String(body.resolution || est.default_resolution || "720P").toUpperCase().replace(/P$/, "P")}-${Math.round(seconds)}s`;
    // normalize 720p -> 720P
    const resLabel = String(body.resolution || est.default_resolution || "720P")
      .toUpperCase()
      .replace(/P$/, "P");
    const altKey = `${resLabel}-${Math.round(seconds)}s`;
    if (packs[packKey] != null) return Number(packs[packKey]);
    if (packs[altKey] != null) return Number(packs[altKey]);
    // fuzzy match
    for (const [k, v] of Object.entries(packs)) {
      if (normRes(k) === normRes(packKey) || normRes(k) === normRes(altKey)) {
        return Number(v);
      }
    }
    return Number(est.pack_cost_usd?.["720P-8s"] || 0.35);
  }

  return 0;
}

function sellUsd(costUsd) {
  return Number((Math.max(0, costUsd) * MARKUP).toFixed(6));
}

function adjustQuota(userId, tokenId, modelId, deltaUsd, note) {
  if (!userId || !deltaUsd) return { ok: true, quota: 0 };
  const quota = Math.round(deltaUsd * QUOTA_PER_USD);
  if (quota === 0) return { ok: true, quota: 0 };
  const db = openDb(DB_PATH, false);
  if (!db) return { ok: true, quota: 0, skipped: true };
  try {
    db.exec("BEGIN");
    if (quota > 0) {
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
    } else {
      const refund = -quota;
      db.prepare(
        `UPDATE users SET quota = quota + ?, used_quota = CASE WHEN used_quota >= ? THEN used_quota - ? ELSE 0 END WHERE id = ?`
      ).run(refund, refund, refund, userId);
      const tok = db
        .prepare(`SELECT unlimited_quota FROM tokens WHERE id = ?`)
        .get(tokenId);
      if (tok && !tok.unlimited_quota) {
        db.prepare(
          `UPDATE tokens SET remain_quota = remain_quota + ?, used_quota = CASE WHEN used_quota >= ? THEN used_quota - ? ELSE 0 END WHERE id = ?`
        ).run(refund, refund, refund, tokenId);
      }
    }

    const channelId = findChannelId(db);
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
        note || `apimart model=${modelId} delta_usd=${deltaUsd}`,
        modelId,
        Math.abs(quota),
        channelId,
        tokenId,
        `apimart_${now}_${Math.random().toString(36).slice(2, 10)}`,
        JSON.stringify({ source: "apimart", delta_usd: deltaUsd, markup: MARKUP })
      );
    } catch (e) {
      console.warn("log insert skipped:", e.message);
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

function savePending(taskId, userId, tokenId, model, prechargeUsd) {
  const db = openDb(PENDING_PATH, false);
  try {
    db.prepare(
      `INSERT OR REPLACE INTO pending(task_id,user_id,token_id,model,precharge_usd,settled,created_at)
       VALUES(?,?,?,?,?,0,?)`
    ).run(
      taskId,
      userId,
      tokenId,
      model,
      prechargeUsd,
      Math.floor(Date.now() / 1000)
    );
  } finally {
    db.close();
  }
}

function settleTask(taskId, upstreamCostUsd, status) {
  const db = openDb(PENDING_PATH, false);
  let row;
  try {
    row = db
      .prepare(`SELECT * FROM pending WHERE task_id=? AND settled=0`)
      .get(taskId);
    if (!row) return;
  } finally {
    db.close();
  }

  let finalSell = 0;
  if (status === "failed" || status === "cancelled") {
    finalSell = 0;
  } else if (upstreamCostUsd != null && Number.isFinite(Number(upstreamCostUsd))) {
    finalSell = sellUsd(Number(upstreamCostUsd));
  } else {
    // keep precharge
    const pdb = openDb(PENDING_PATH, false);
    try {
      pdb.prepare(`UPDATE pending SET settled=1 WHERE task_id=?`).run(taskId);
    } finally {
      pdb.close();
    }
    return;
  }

  const delta = finalSell - Number(row.precharge_usd || 0);
  const bill = adjustQuota(
    row.user_id,
    row.token_id,
    row.model,
    delta,
    `apimart settle task=${taskId} final_sell=${finalSell} pre=${row.precharge_usd} up_cost=${upstreamCostUsd}`
  );
  if (!bill.ok && delta > 0) {
    console.warn("settle charge failed", taskId, bill.error);
    return;
  }
  const pdb = openDb(PENDING_PATH, false);
  try {
    pdb.prepare(`UPDATE pending SET settled=1 WHERE task_id=?`).run(taskId);
  } finally {
    pdb.close();
  }
}

function isSubmitPath(p) {
  return p === "/v1/videos/generations";
}

function isPollPath(p) {
  return (
    /^\/v1\/tasks\/[^/]+$/.test(p) ||
    /^\/v1\/videos\/generations\/[^/]+$/.test(p)
  );
}

async function proxyApimart(req, bodyBuf, rewritePath) {
  const urlPath = rewritePath || req.url;
  const target = `${APIMART_ORIGIN}${urlPath}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  headers.authorization = `Bearer ${APIMART_KEY}`;
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method || "") ? undefined : bodyBuf,
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  const ct = upstream.headers.get("content-type") || "application/json";
  return { status: upstream.status, buf, ct };
}

function extractTaskId(payload) {
  try {
    const j = JSON.parse(payload);
    if (Array.isArray(j.data) && j.data[0]?.task_id) return j.data[0].task_id;
    if (j.data?.task_id) return j.data.task_id;
    if (j.data?.id) return j.data.id;
    if (j.task_id) return j.task_id;
  } catch {}
  return "";
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
    });
    return res.end();
  }

  const urlPath = (req.url || "/").split("?")[0];

  if (urlPath === "/healthz") {
    return json(res, 200, {
      ok: true,
      models: catalog.models.length,
      markup: MARKUP,
      db: fs.existsSync(DB_PATH),
      key: !!APIMART_KEY,
    });
  }

  if (!isSubmitPath(urlPath) && !isPollPath(urlPath)) {
    return json(res, 404, {
      error: {
        message: "Use POST /v1/videos/generations or GET /v1/tasks/{id}",
        type: "invalid_request_error",
      },
    });
  }

  if (!APIMART_KEY) {
    return json(res, 500, {
      error: { message: "APIMART_API_KEY not configured", type: "server_error" },
    });
  }

  const apiKey = extractBearer(req);
  if (!apiKey) {
    return json(res, 401, {
      error: { message: "Missing Authorization Bearer token", type: "auth_error" },
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

  try {
    if (isPollPath(urlPath)) {
      // normalize generations/{id} → tasks/{id} for upstream if needed
      let upstreamPath = req.url;
      const m = /^\/v1\/videos\/generations\/([^/?]+)/.exec(urlPath);
      if (m) upstreamPath = `/v1/tasks/${m[1]}${(req.url || "").includes("?") ? "?" + (req.url || "").split("?")[1] : ""}`;

      const up = await proxyApimart(req, bodyBuf, upstreamPath);
      const text = up.buf.toString("utf8");
      try {
        const j = JSON.parse(text);
        const st = String(j.data?.status || j.status || "").toLowerCase();
        const cost = j.data?.cost ?? j.cost;
        const tid =
          j.data?.id ||
          j.data?.task_id ||
          (m ? m[1] : urlPath.split("/").pop());
        if (tid && (st === "completed" || st === "failed" || st === "cancelled" || st === "success")) {
          settleTask(tid, cost, st === "success" ? "completed" : st);
        }
      } catch {}
      res.writeHead(up.status, {
        "Content-Type": up.ct,
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(up.buf);
    }

    // submit
    let body = {};
    try {
      body = JSON.parse(bodyBuf.toString("utf8") || "{}");
    } catch {
      return json(res, 400, {
        error: { message: "Invalid JSON body", type: "invalid_request_error" },
      });
    }
    const modelId = String(body.model || "");
    const meta = modelMap[modelId];
    if (!meta) {
      return json(res, 400, {
        error: {
          message: `Unknown model: ${modelId || "(empty)"}. Allowed: ${Object.keys(modelMap).join(", ")}`,
          type: "invalid_request_error",
        },
      });
    }

    const costEst = estimateCostUsd(meta, body);
    const preSell = sellUsd(costEst);
    if (!token.skipBill) {
      const bill = adjustQuota(
        token.userId,
        token.tokenId,
        modelId,
        preSell,
        `apimart precharge model=${modelId} est_cost=${costEst} sell=${preSell}`
      );
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

    const up = await proxyApimart(req, bodyBuf, req.url);
    const text = up.buf.toString("utf8");
    if (up.status >= 200 && up.status < 300) {
      const tid = extractTaskId(text);
      if (tid && !token.skipBill) {
        savePending(tid, token.userId, token.tokenId, modelId, preSell);
      }
    } else if (!token.skipBill && preSell > 0) {
      // refund precharge on upstream reject
      adjustQuota(
        token.userId,
        token.tokenId,
        modelId,
        -preSell,
        `apimart refund precharge model=${modelId} upstream_status=${up.status}`
      );
    }

    res.writeHead(up.status, {
      "Content-Type": up.ct,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(up.buf);
  } catch (e) {
    json(res, 502, {
      error: { message: String(e.message || e), type: "upstream_error" },
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`APIMart passthrough on http://${HOST}:${PORT}`);
  console.log(`  models: ${catalog.models.map((m) => m.id).join(", ")}`);
  console.log(`  markup: ×${MARKUP}`);
  console.log(`  apimart: ${APIMART_ORIGIN}`);
  console.log(`  new-api: ${NEW_API_BASE}`);
  console.log(`  db: ${DB_PATH}`);
});
