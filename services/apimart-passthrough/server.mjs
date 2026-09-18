/**
 * APIMart 瑙嗛閫忎紶锛圞eyoAPI锛? *
 * 瀹㈡埛锛歅OST /v1/videos/generations锛堜篃鎺ュ彈 POST /v1/videos锛? *       GET /v1/tasks/{id}锛堜篃鎺ュ彈 GET /v1/videos/{id}锛? * 閴存潈锛歂ew API 浠ょ墝锛涗笂娓革細APIMart Key锛沢rok-imagine 鈫?OpenLux
 * 鎵ｈ垂锛氶鎵ｄ及绠椾环锛涘嚭鐗囧悗鎸?upstream cost(USD) 脳 markup 澶氶€€灏戣ˉ
 *
 * Env:
 *   PORT=3011
 *   LISTEN_HOST=127.0.0.1
 *   APIMART_API_KEY=sk-...
 *   APIMART_BASE_URL=https://api.apimart.ai
 *   OPENLUX_API_KEY=sk-...
 *   OPENLUX_BASE_URL=https://api.openlux.ai
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
const OPENLUX_KEY = process.env.OPENLUX_API_KEY || "";
const OPENLUX_ORIGIN = (
  process.env.OPENLUX_BASE_URL || "https://api.openlux.ai"
).replace(/\/v1\/?$/, "");
const GRSAI_KEY = process.env.GRSAI_API_KEY || "";
const GRSAI_ORIGIN = (
  process.env.GRSAI_BASE_URL || "https://grsaiapi.com"
).replace(/\/$/, "");
const AIONE_KEY = process.env.AIONE_API_KEY || "";
const AIONE_ORIGIN = (
  process.env.AIONE_BASE_URL || "https://api.aione.help"
).replace(/\/$/, "");
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
  // Node DatabaseSync requires options to be an object (not undefined)
  try {
    return new DatabaseSync(dbPath, readonly ? { readOnly: true } : {});
  } catch (e) {
    console.error("[apimart] openDb failed:", e.message || e);
    return null;
  }
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
      console.warn("[apimart] token lookup:", e.message || e);
    }
  }
  return null;
}

async function probeNewApiToken(apiKey) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  try {
    const usage = await fetch(`${NEW_API_BASE}/api/usage/token/`, { headers });
    if (usage.status !== 404 && usage.status !== 405) return usage.ok;
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch(`${NEW_API_BASE}/v1/models`, { headers });
    return r.ok;
  } catch {
    return false;
  }
}

async function validateToken(apiKey) {
  const authed = await probeNewApiToken(apiKey);
  if (!authed) {
    console.warn("[apimart] token probe failed (usage/models)");
    return null;
  }
  const db = openDb(DB_PATH, true);
  if (!db) {
    console.warn("[apimart] DB missing at", DB_PATH, "鈥?skipBill");
    return { userId: 0, tokenId: 0, skipBill: true };
  }
  try {
    const row = lookupTokenRow(db, apiKey);
    if (!row) {
      console.warn(
        "[apimart] token not in DB; db=",
        DB_PATH,
        "prefix=",
        String(apiKey).replace(/^sk-/i, "").trim().slice(0, 12)
      );
      return null;
    }
    if (Number(row.status) !== 1) {
      console.warn("[apimart] token disabled status=", row.status, "id=", row.id);
      return null;
    }
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
        `SELECT id FROM channels WHERE name LIKE '%Keyo Video%' OR name LIKE '%APIMart%' OR base_url LIKE '%apimart%' LIMIT 1`
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

  // Seedance: ref video => (ref+gen seconds) * input rate; else gen seconds * output rate
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

  // FLUX锛氭寜 DRAFT/HD/FHD/V2V-* 妗ｄ綅鎸夌
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

  // Omni Ext: ref video per-second; else resolution-duration pack
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

function sellUsd(costUsd, meta) {
  const m = Number(meta?.markup || MARKUP);
  return Number((Math.max(0, costUsd) * m).toFixed(6));
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
        note || `video model=${modelId} delta_usd=${deltaUsd}`,
        modelId,
        Math.abs(quota),
        channelId,
        tokenId,
        `video_${now}_${Math.random().toString(36).slice(2, 10)}`,
        JSON.stringify({ source: "relay", delta_usd: deltaUsd })
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
    finalSell = sellUsd(Number(upstreamCostUsd), modelMap[row.model]);
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
    `video settle task=${taskId}`
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
  return p === "/v1/videos/generations" || p === "/v1/videos";
}

function isPollPath(p) {
  if (p === "/v1/videos" || p === "/v1/videos/generations") return false;
  return (
    /^\/v1\/tasks\/[^/]+$/.test(p) ||
    /^\/v1\/videos\/generations\/[^/]+$/.test(p) ||
    /^\/v1\/videos\/[^/]+$/.test(p) ||
    /^\/v1\/videos\/[^/]+\/content$/.test(p)
  );
}

function qsOf(url) {
  const s = String(url || "");
  const i = s.indexOf("?");
  return i >= 0 ? s.slice(i) : "";
}

function pollId(p) {
  const parts = String(p || "").split("/").filter(Boolean);
  if (parts[parts.length - 1] === "content") return parts[parts.length - 2] || "";
  return parts[parts.length - 1] || "";
}

function isOpenluxMeta(meta) {
  return String(meta?.upstream || "").toLowerCase() === "openlux";
}

function isGrsaiMeta(meta) {
  return String(meta?.upstream || "").toLowerCase() === "grsai";
}

function isAioneMeta(meta) {
  return String(meta?.upstream || "").toLowerCase() === "aione";
}

function firstHttpsUrl(v) {
  if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  if (v && typeof v === "object" && v.url && /^https?:\/\//i.test(String(v.url))) {
    return String(v.url);
  }
  return "";
}

function aioneDefaultSize(meta, body) {
  if (body.size) return String(body.size);
  const res = String(
    body.resolution || meta?.estimate?.default_resolution || ""
  ).toLowerCase();
  if (res.includes("1080")) return "1920x1080";
  if (res.includes("720")) return "1280x720";
  if (res.includes("480")) return "854x480";
  return "";
}

/** Keyo Path B JSON 鈫?aione POST /v1/videos */
function buildAioneVideoBody(meta, body) {
  const out = {
    model: String(meta.upstream_model || ""),
    prompt: String(body.prompt || body.text || ""),
  };
  const seconds = body.seconds ?? body.duration;
  if (seconds != null && seconds !== "") out.seconds = seconds;
  else out.seconds = Number(meta?.estimate?.default_seconds || 5);
  const size = aioneDefaultSize(meta, body);
  if (size) out.size = size;
  const extra = {};
  if (body.aspect_ratio || body.aspectRatio) {
    extra.aspect_ratio = body.aspect_ratio || body.aspectRatio;
  }
  const resolution = body.resolution || meta?.estimate?.default_resolution;
  if (resolution) extra.resolution = resolution;

  const images = [];
  const push = (u, role) => {
    const url = firstHttpsUrl(u);
    if (!url) return;
    images.push(role ? { url, role } : { url });
  };
  if (Array.isArray(body.image_with_roles)) {
    for (const it of body.image_with_roles) {
      push(it, it?.role || "reference_image");
    }
  }
  if (Array.isArray(body.image_urls)) for (const u of body.image_urls) push(u, "reference_image");
  if (Array.isArray(body.images)) for (const u of body.images) push(u, "reference_image");
  const first =
    firstHttpsUrl(body.input_reference) ||
    firstHttpsUrl(body.first_frame_image) ||
    firstHttpsUrl(body.image) ||
    firstHttpsUrl(body.image_url);
  if (first && !images.some((x) => x.url === first)) {
    images.unshift({ url: first, role: "first_frame" });
  }
  if (body.last_frame_image) push(body.last_frame_image, "last_frame");
  if (images.length === 1) out.input_reference = { url: images[0].url };
  else if (images.length > 1) extra.reference_images = images;

  const videos = [];
  if (Array.isArray(body.video_urls)) {
    for (const u of body.video_urls) {
      const url = firstHttpsUrl(u);
      if (url) videos.push({ url });
    }
  }
  if (videos.length) extra.reference_videos = videos;
  const audios = [];
  if (Array.isArray(body.audio_urls)) {
    for (const u of body.audio_urls) {
      const url = firstHttpsUrl(u);
      if (url) audios.push({ url });
    }
  }
  if (Array.isArray(body.audios)) {
    for (const u of body.audios) {
      const url = firstHttpsUrl(u);
      if (url) audios.push({ url });
    }
  }
  if (audios.length) extra.reference_audios = audios;
  if (Object.keys(extra).length) out.extra = extra;
  return out;
}

function mapAspectToGrsai(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "landscape";
  if (s === "16:9" || s === "landscape" || s === "horizontal") return "landscape";
  if (s === "9:16" || s === "portrait" || s === "vertical") return "portrait";
  if (s === "1:1" || s === "square") return "square";
  return "landscape";
}

function buildGrsaiVideoBody(meta, body) {
  const est = meta.estimate || {};
  let duration = Number(body.duration ?? body.seconds ?? est.default_seconds ?? 5);
  if (!Number.isFinite(duration) || duration <= 0) duration = 5;
  let resolution = String(
    body.resolution || body.size || est.default_resolution || "768p"
  ).toLowerCase();
  if (resolution === "2k") resolution = "1080p";
  // 1080p max 10s (inventory rule)
  if (resolution === "1080p" && duration > 10) duration = 10;
  if (duration > 15) duration = 15;

  const out = {
    model: String(meta.upstream_model || "minimax-h3"),
    prompt: String(body.prompt || body.text || ""),
    duration,
    resolution,
    aspectRatio: mapAspectToGrsai(
      body.aspectRatio || body.aspect_ratio || body.ratio
    ),
    // Keyo async poll style (customer still uses /v1/tasks/{id})
    webHook: "-1",
    shutProgress: true,
  };

  // images: prefer native `images`, else common aliases (https URLs)
  const images = [];
  const pushImg = (u) => {
    if (typeof u === "string" && u) images.push(u);
    else if (u && typeof u === "object" && u.url) images.push(String(u.url));
  };
  if (Array.isArray(body.images)) for (const u of body.images) pushImg(u);
  if (Array.isArray(body.image_urls)) for (const u of body.image_urls) pushImg(u);
  if (typeof body.image_url === "string") pushImg(body.image_url);
  if (typeof body.first_frame_image === "string") pushImg(body.first_frame_image);
  if (typeof body.last_frame_image === "string") pushImg(body.last_frame_image);
  if (Array.isArray(body.image_with_roles)) {
    for (const it of body.image_with_roles) pushImg(it);
  }
  if (images.length) out.images = images.slice(0, 9);

  // audios: prefer native `audios`
  const audios = [];
  const pushAud = (u) => {
    if (typeof u === "string" && u) audios.push(u);
    else if (u && typeof u === "object" && u.url) audios.push(String(u.url));
  };
  if (Array.isArray(body.audios)) for (const u of body.audios) pushAud(u);
  if (Array.isArray(body.audio_urls)) for (const u of body.audio_urls) pushAud(u);
  if (typeof body.audio_url === "string") pushAud(body.audio_url);
  if (audios.length) out.audios = audios.slice(0, 3);

  if (body.seed != null && Number.isFinite(Number(body.seed))) {
    out.seed = Number(body.seed);
  }
  return out;
}

function grsaiCostUsd(j) {
  if (!j || typeof j !== "object") return null;
  if (j.price_cny != null && Number.isFinite(Number(j.price_cny))) {
    return Number(j.price_cny) / FX;
  }
  if (j.data?.price_cny != null && Number.isFinite(Number(j.data.price_cny))) {
    return Number(j.data.price_cny) / FX;
  }
  if (j.credits != null && Number.isFinite(Number(j.credits))) {
    // 1 CNY ≈ 20000 credits on this inventory
    return Number(j.credits) / 20000 / FX;
  }
  const raw = j.cost ?? j.data?.cost;
  if (raw != null && Number.isFinite(Number(raw))) {
    // This inventory reports cost in CNY
    return Number(raw) / FX;
  }
  return null;
}

/** aione / aicopy New-API style: cost fields are CNY */
function aioneCostUsd(j) {
  if (!j || typeof j !== "object") return null;
  const raw =
    j.price_cny ??
    j.data?.price_cny ??
    j.cost ??
    j.usage?.cost ??
    j.data?.cost;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Number(raw) / FX;
  }
  return null;
}

function normalizeGrsaiSubmitJson(raw) {
  let j = {};
  try {
    j = JSON.parse(raw || "{}");
  } catch {
    return raw;
  }
  const id =
    j.id ||
    j.task_id ||
    j.data?.id ||
    j.data?.task_id ||
    (Array.isArray(j.data) && j.data[0]?.task_id) ||
    "";
  const errMsg =
    j.error?.message ||
    j.message ||
    j.msg ||
    (typeof j.error === "string" ? j.error : "");
  if (!id) {
    return JSON.stringify({
      error: {
        message: errMsg || "video submit failed",
        type: "server_error",
      },
    });
  }
  return JSON.stringify({
    code: 200,
    id: String(id),
    task_id: String(id),
    data: [{ id: String(id), task_id: String(id), status: "submitted" }],
  });
}

/**
 * APIMart / Path B submit: keep upstream body, but always expose top-level
 * `id` + `task_id` so OpenAI-style adapters (HyperFrames / Cursor) that only
 * read id|task_id|job_id|video_id do not get HTTP 200 with an empty task id.
 */
function enrichSubmitTaskIdAliases(raw) {
  const tid = extractTaskId(raw);
  if (!tid) return { text: raw, tid: "" };
  try {
    const j = JSON.parse(raw || "{}");
    if (j.id == null || j.id === "") j.id = tid;
    if (j.task_id == null || j.task_id === "") j.task_id = tid;
    if (Array.isArray(j.data) && j.data[0] && typeof j.data[0] === "object") {
      if (j.data[0].id == null || j.data[0].id === "") j.data[0].id = tid;
      if (j.data[0].task_id == null || j.data[0].task_id === "") {
        j.data[0].task_id = tid;
      }
    } else if (j.data && typeof j.data === "object" && !Array.isArray(j.data)) {
      if (j.data.id == null || j.data.id === "") j.data.id = tid;
      if (j.data.task_id == null || j.data.task_id === "") j.data.task_id = tid;
    }
    return { text: JSON.stringify(j), tid };
  } catch {
    return { text: raw, tid };
  }
}

function normalizeGrsaiPollJson(raw, taskId) {
  let j = {};
  try {
    j = JSON.parse(raw || "{}");
  } catch {
    return raw;
  }
  const st = String(j.status || j.data?.status || "").toLowerCase();
  const mapped =
    st === "succeeded" || st === "success" || st === "completed" || st === "done"
      ? "completed"
      : st === "failed" || st === "error" || st === "cancelled"
        ? "failed"
        : st === "pending" || st === "queued" || st === "running" || st === "processing"
          ? "processing"
          : st || "processing";
  const url =
    j.url ||
    j.video_url ||
    j.data?.url ||
    j.data?.video_url ||
    (Array.isArray(j.results) && j.results[0]?.url) ||
    (Array.isArray(j.data?.results) && j.data.results[0]?.url) ||
    "";
  const out = {
    code: 200,
    id: taskId,
    task_id: taskId,
    status: mapped,
    data: {
      id: taskId,
      task_id: taskId,
      status: mapped,
      progress:
        j.progress ?? j.data?.progress ?? (mapped === "completed" ? 100 : 0),
      result: url
        ? { videos: [{ url: [url] }] }
        : j.data?.result || j.result || null,
    },
  };
  if (url) out.url = url;
  return JSON.stringify(out);
}

/** Map vendor status words 鈫?processing|completed|failed|cancelled */
function mapAsyncStatus(raw) {
  const st = String(raw || "").toLowerCase();
  if (["succeeded", "success", "completed", "done"].includes(st)) return "completed";
  if (["failed", "failure", "error"].includes(st)) return "failed";
  if (["cancelled", "canceled"].includes(st)) return "cancelled";
  if (
    [
      "pending",
      "queued",
      "submitted",
      "running",
      "processing",
      "waiting",
      "in_progress",
    ].includes(st)
  ) {
    return "processing";
  }
  return st || "processing";
}

function firstVideoUrlFromPoll(j) {
  const videos = j?.data?.result?.videos || j?.result?.videos;
  if (Array.isArray(videos) && videos[0]) {
    const u = videos[0].url;
    if (Array.isArray(u) && u[0]) return String(u[0]);
    if (typeof u === "string" && u) return u;
  }
  return (
    j?.url ||
    j?.video_url ||
    j?.data?.url ||
    j?.data?.video_url ||
    ""
  );
}

/**
 * APIMart / Openlux Path B poll: keep vendor fields, but make AI-friendly:
 * - top-level id / task_id / status / url
 * - data.status normalized to completed|failed|processing
 * - data.result.videos[0].url always an array when present
 */
function normalizeApimartPollJson(raw, taskId) {
  let j = {};
  try {
    j = JSON.parse(raw || "{}");
  } catch {
    return raw;
  }
  const data =
    j.data && typeof j.data === "object" && !Array.isArray(j.data) ? { ...j.data } : {};
  const rawSt = data.status || j.status || "";
  const mapped = mapAsyncStatus(rawSt);
  let url = firstVideoUrlFromPoll({ ...j, data });
  if (url) {
    if (!data.result || typeof data.result !== "object") data.result = {};
    const videos = Array.isArray(data.result.videos) ? data.result.videos : [];
    if (!videos[0]) {
      data.result.videos = [{ url: [url] }];
    } else {
      const u0 = videos[0].url;
      if (typeof u0 === "string") videos[0] = { ...videos[0], url: [u0] };
      else if (!Array.isArray(u0) || !u0[0]) videos[0] = { ...videos[0], url: [url] };
      data.result.videos = videos;
    }
  }
  data.id = data.id || taskId;
  data.task_id = data.task_id || taskId;
  if (rawSt && String(rawSt).toLowerCase() !== mapped) data.status_raw = rawSt;
  data.status = mapped;
  if (mapped === "completed" && data.progress == null) data.progress = 100;

  j.code = j.code ?? 200;
  j.id = j.id || taskId;
  j.task_id = j.task_id || taskId;
  j.status = mapped;
  j.data = data;
  if (url) j.url = url;
  return JSON.stringify(j);
}

function getPending(taskId) {
  if (!taskId || !fs.existsSync(PENDING_PATH)) return null;
  const db = openDb(PENDING_PATH, true);
  if (!db) return null;
  try {
    return db.prepare(`SELECT * FROM pending WHERE task_id=?`).get(taskId) || null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function scrubClientErrorBuf(buf, ct) {
  const type = String(ct || "").toLowerCase();
  if (!type.includes("json") && !type.includes("text") && type !== "") {
    return buf;
  }
  let t = buf.toString("utf8");
  const before = t;
  t = t
    .replace(/https?:\/\/(?:[\w.-]+\.)?apimart\.ai[^\s"'\\]*/gi, "[redacted]")
    .replace(/https?:\/\/(?:[\w.-]+\.)?openlux\.ai[^\s"'\\]*/gi, "[redacted]")
    .replace(/https?:\/\/(?:[\w.-]+\.)?openlux\.apifox\.cn[^\s"'\\]*/gi, "[redacted]")
    .replace(/https?:\/\/ai\.gitee\.com[^\s"'\\]*/gi, "[redacted]")
    .replace(/https?:\/\/(?:[\w.-]+\.)?grsai(?:api)?\.(?:com|ai|dakka\.com\.cn)[^\s"'\\]*/gi, "[redacted]")
    .replace(/https?:\/\/(?:[\w.-]+\.)?dakka\.com\.cn[^\s"'\\]*/gi, "[redacted]")
    .replace(/\bAPIMart\b/gi, "provider")
    .replace(/\bOpenLux\b/gi, "provider")
    .replace(/妯″姏鏂硅垷/g, "provider")
    .replace(/\bMoArk\b/gi, "provider")
    .replace(/\bGitee(?:\s*AI)?\b/gi, "provider")
    .replace(/\bGrsai\b/gi, "provider")
    .replace(/\bgrsaiapi\b/gi, "provider")
    .replace(/\bgrsai\b/gi, "provider")
    .replace(/\bdakka\b/gi, "provider")
    .replace(/\bSenseNova\b/gi, "provider")
    .replace(/\bSorux\b/gi, "provider");
  if (t === before) return buf;
  return Buffer.from(t, "utf8");
}

function clientUp(up) {
  if (!up || up.status < 400) return up;
  return { ...up, buf: scrubClientErrorBuf(up.buf, up.ct) };
}

async function proxyOrigin(origin, key, req, bodyBuf, rewritePath) {
  const urlPath = rewritePath || req.url;
  const target = `${origin}${urlPath}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  headers.authorization = `Bearer ${key}`;
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method || "") ? undefined : bodyBuf,
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  const ct = upstream.headers.get("content-type") || "application/json";
  return { status: upstream.status, buf, ct };
}

function looksLikeMiss(up) {
  if (!up) return true;
  if (up.status === 401 || up.status === 403) return false;
  if (up.status === 404 || up.status === 405) return true;
  const t = up.buf.toString("utf8");
  const low = t.toLowerCase();
  if (low.includes("invalid url") || low.includes("not found")) return true;
  return false;
}

function extractTaskId(payload) {
  try {
    const j = JSON.parse(payload);
    if (Array.isArray(j.data) && j.data[0]?.task_id) return j.data[0].task_id;
    if (j.data?.task_id) return j.data.task_id;
    if (j.data?.id) return j.data.id;
    if (j.task_id) return j.task_id;
    if (j.id) return j.id;
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
      db: fs.existsSync(DB_PATH),
      db_path: DB_PATH,
      inventory_a: !!APIMART_KEY,
      inventory_b: !!OPENLUX_KEY,
      inventory_c: !!GRSAI_KEY,
      inventory_d: !!AIONE_KEY,
      new_api: NEW_API_BASE,
    });
  }

  if (!isSubmitPath(urlPath) && !isPollPath(urlPath)) {
    return json(res, 404, {
      error: {
        message:
          "Use POST /v1/videos or /v1/videos/generations, then GET /v1/videos/{id} or /v1/tasks/{id}",
        type: "invalid_request_error",
      },
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
      error: { message: "Invalid API token", type: "auth_error" },
    });
  }

  let bodyBuf = ["GET", "HEAD"].includes(req.method || "")
    ? Buffer.alloc(0)
    : await readBody(req);

  try {
    if (isPollPath(urlPath)) {
      const tid = pollId(urlPath);
      const pending = getPending(tid);
      const pendingMeta = pending ? modelMap[pending.model] : null;

      // Inventory-C video poll 鈫?POST /v1/api/result {id}
      if (isGrsaiMeta(pendingMeta)) {
        if (!GRSAI_KEY) {
          return json(res, 500, {
            error: { message: "Service temporarily unavailable", type: "server_error" },
          });
        }
        const pollBody = Buffer.from(JSON.stringify({ id: tid }), "utf8");
        const up = await proxyOrigin(
          GRSAI_ORIGIN,
          GRSAI_KEY,
          {
            ...req,
            method: "POST",
            headers: { ...req.headers, "content-type": "application/json" },
          },
          pollBody,
          "/v1/api/result"
        );
        const text = up.buf.toString("utf8");
        try {
          const j = JSON.parse(text);
          const st = String(j.status || j.data?.status || "").toLowerCase();
          const costUsd = grsaiCostUsd(j);
          const done = [
            "completed",
            "failed",
            "cancelled",
            "success",
            "succeeded",
            "done",
          ].includes(st);
          if (tid && done) {
            settleTask(
              tid,
              costUsd,
              st === "failed" || st === "cancelled" || st === "error"
                ? st === "error"
                  ? "failed"
                  : st
                : "completed"
            );
          }
        } catch {}
        const normalized = Buffer.from(normalizeGrsaiPollJson(text, tid), "utf8");
        const out = clientUp({
          status: up.status,
          buf: normalized,
          ct: "application/json",
        });
        res.writeHead(out.status >= 200 && out.status < 600 ? out.status : 200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(out.buf);
      }

      if (isAioneMeta(pendingMeta)) {
        if (!AIONE_KEY) {
          return json(res, 500, {
            error: { message: "Service temporarily unavailable", type: "server_error" },
          });
        }
        const wantContent = urlPath.endsWith("/content");
        const path = wantContent
          ? `/v1/videos/${tid}/content${qsOf(req.url)}`
          : `/v1/videos/${tid}${qsOf(req.url)}`;
        const up = await proxyOrigin(AIONE_ORIGIN, AIONE_KEY, req, bodyBuf, path);
        if (wantContent) {
          const out = clientUp(up);
          res.writeHead(out.status, {
            "Content-Type": out.ct || "application/octet-stream",
            "Access-Control-Allow-Origin": "*",
          });
          return res.end(out.buf);
        }
        const text = up.buf.toString("utf8");
        let mapped = text;
        try {
          const j = JSON.parse(text);
          const st = String(j.status || "").toLowerCase();
          const url = j.video_url || j.url || "";
          const costUsd = aioneCostUsd(j);
          const done = ["completed", "failed", "cancelled", "success", "succeeded"].includes(st);
          if (tid && done) {
            settleTask(
              tid,
              costUsd,
              st === "failed" || st === "cancelled" ? st : st === "completed" || st === "success" || st === "succeeded" ? "completed" : st
            );
          }
          mapped = JSON.stringify({
            code: 200,
            id: tid,
            task_id: tid,
            status: st,
            video_url: url,
            data: {
              id: tid,
              task_id: tid,
              status: st,
              result: url ? { videos: [{ url: [url] }] } : null,
            },
          });
        } catch {}
        const normalized = Buffer.from(normalizeApimartPollJson(mapped, tid), "utf8");
        const out = clientUp({
          status: up.status,
          buf: normalized,
          ct: "application/json",
        });
        res.writeHead(out.status, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(out.buf);
      }

      let useOpenlux = isOpenluxMeta(pendingMeta);

      const tryPoll = async (openlux) => {
        const key = openlux ? OPENLUX_KEY : APIMART_KEY;
        const origin = openlux ? OPENLUX_ORIGIN : APIMART_ORIGIN;
        if (!key) return null;
        const path = openlux
          ? `/v1/videos/${tid}${qsOf(req.url)}`
          : `/v1/tasks/${tid}${qsOf(req.url)}`;
        return proxyOrigin(origin, key, req, bodyBuf, path);
      };

      let up = await tryPoll(useOpenlux);
      if (!pending && looksLikeMiss(up)) {
        const other = await tryPoll(!useOpenlux);
        if (other && !looksLikeMiss(other)) {
          up = other;
          useOpenlux = !useOpenlux;
        }
      }
      if (!up) {
        return json(res, 500, {
          error: { message: "Service temporarily unavailable", type: "server_error" },
        });
      }
      const text = up.buf.toString("utf8");
      try {
        const j = JSON.parse(text);
        const st = String(j.data?.status || j.status || "").toLowerCase();
        const cost = j.data?.cost ?? j.cost;
        const done = [
          "completed",
          "failed",
          "cancelled",
          "success",
          "succeeded",
          "done",
        ].includes(st);
        if (tid && done) {
          settleTask(tid, cost, st === "success" || st === "succeeded" || st === "done" ? "completed" : st);
        }
      } catch {}
      const normalized = Buffer.from(normalizeApimartPollJson(text, tid), "utf8");
      const out = clientUp({
        status: up.status,
        buf: normalized,
        ct: "application/json",
      });
      res.writeHead(out.status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(out.buf);
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

    const useGrsai = isGrsaiMeta(meta);
    const useOpenlux = isOpenluxMeta(meta);
    const useAione = isAioneMeta(meta);
    const upKey = useGrsai
      ? GRSAI_KEY
      : useAione
        ? AIONE_KEY
        : useOpenlux
          ? OPENLUX_KEY
          : APIMART_KEY;
    const upOrigin = useGrsai
      ? GRSAI_ORIGIN
      : useAione
        ? AIONE_ORIGIN
        : useOpenlux
          ? OPENLUX_ORIGIN
          : APIMART_ORIGIN;
    if (!upKey) {
      return json(res, 500, {
        error: { message: "Service temporarily unavailable", type: "server_error" },
      });
    }

    // Inventory-C: rewrite client body 鈫?generate shape (never forward public model id)
    if (useGrsai) {
      const gBody = buildGrsaiVideoBody(meta, body);
      if (!gBody.prompt) {
        return json(res, 400, {
          error: {
            message: "prompt is required",
            type: "invalid_request_error",
            param: "prompt",
          },
        });
      }
      bodyBuf = Buffer.from(JSON.stringify(gBody), "utf8");
    }

    if (useAione) {
      const aBody = buildAioneVideoBody(meta, body);
      if (!aBody.prompt) {
        return json(res, 400, {
          error: {
            message: "prompt is required",
            type: "invalid_request_error",
            param: "prompt",
          },
        });
      }
      bodyBuf = Buffer.from(JSON.stringify(aBody), "utf8");
    }

    // OpenLux grok-imagine: image-to-video only; need image:{url} + aspect/resolution/duration.
    if (modelId.includes("grok-imagine")) {
      const est = meta.estimate || {};
      if (!body.aspect_ratio) body.aspect_ratio = "16:9";
      if (!body.resolution) {
        body.resolution = String(est.default_resolution || "480p");
      }
      if (body.duration == null && body.seconds == null) {
        body.duration = Number(est.default_seconds || 5);
      }
      // Normalize common aliases 鈫?OpenLux shape: { image: { url } }
      const imgObj = body.image;
      let url = "";
      if (imgObj && typeof imgObj === "object" && imgObj.url) {
        url = String(imgObj.url);
      } else if (typeof imgObj === "string" && imgObj) {
        url = imgObj;
      } else if (typeof body.image_url === "string" && body.image_url) {
        url = body.image_url;
      } else if (Array.isArray(body.image_urls) && body.image_urls[0]) {
        const first = body.image_urls[0];
        url = typeof first === "string" ? first : String(first?.url || "");
      } else if (Array.isArray(body.images) && body.images[0]) {
        const first = body.images[0];
        url = typeof first === "string" ? first : String(first?.url || "");
      } else if (typeof body.input_reference === "string" && body.input_reference) {
        url = body.input_reference;
      }
      if (!url || !/^https?:\/\//i.test(url)) {
        return json(res, 400, {
          error: {
            message:
              'grok-imagine-video-1.5-preview is image-to-video only. Pass image:{"url":"https://..."} (aliases: image_url, image_urls[0]).',
            type: "invalid_request_error",
            param: "image",
          },
        });
      }
      body.image = { url };
      delete body.image_url;
      delete body.image_urls;
      delete body.images;
      delete body.input_reference;
      bodyBuf = Buffer.from(JSON.stringify(body), "utf8");
    }

    const costEst = estimateCostUsd(meta, body);
    const preSell = sellUsd(costEst, meta);
    if (!token.skipBill) {
      const bill = adjustQuota(
        token.userId,
        token.tokenId,
        modelId,
        preSell,
        `video precharge model=${modelId}`
      );
      if (!bill.ok) {
        return json(res, 403, {
          error: {
            message:
              bill.error === "insufficient_quota" ? "棰濆害涓嶈冻" : bill.error,
            type: "billing_error",
          },
        });
      }
    }

    const submitPath =
      (meta.upstream_submit_path
        ? String(meta.upstream_submit_path)
        : useGrsai
          ? "/v1/api/generate"
          : "/v1/videos/generations") + (useGrsai ? "" : qsOf(req.url));
    const submitReq = useGrsai
      ? {
          ...req,
          method: "POST",
          headers: { ...req.headers, "content-type": "application/json" },
        }
      : req;
    const up = await proxyOrigin(upOrigin, upKey, submitReq, bodyBuf, submitPath);
    let text = up.buf.toString("utf8");
    let outBuf = up.buf;
    let outCt = up.ct;
    let outStatus = up.status;

    if (useGrsai) {
      const normalized = normalizeGrsaiSubmitJson(text);
      outBuf = Buffer.from(normalized, "utf8");
      outCt = "application/json";
      // Treat successful id extraction as 200 even if vendor status is quirky
      if (extractTaskId(normalized) && outStatus >= 200 && outStatus < 500) {
        outStatus = 200;
      } else if (!extractTaskId(normalized) && outStatus >= 200 && outStatus < 300) {
        outStatus = 502;
      }
      text = normalized;
    } else if (outStatus >= 200 && outStatus < 300) {
      // Seedance / Wan / FLUX / Omni / Grok-imagine (APIMart): alias task id
      const enriched = enrichSubmitTaskIdAliases(text);
      if (enriched.tid) {
        text = enriched.text;
        outBuf = Buffer.from(text, "utf8");
        outCt = "application/json";
      } else {
        // Never return 200 without a pollable task id (breaks HyperFrames etc.)
        outStatus = 502;
        text = JSON.stringify({
          error: {
            message:
              "upstream accepted submit but returned no task_id; retry or contact support",
            type: "server_error",
            code: "missing_task_id",
          },
        });
        outBuf = Buffer.from(text, "utf8");
        outCt = "application/json";
      }
    }

    if (outStatus >= 200 && outStatus < 300) {
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
        `video refund model=${modelId}`
      );
    }

    const out = clientUp({ status: outStatus, buf: outBuf, ct: outCt });
    res.writeHead(out.status, {
      "Content-Type": out.ct,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(out.buf);
  } catch (e) {
    json(res, 502, {
      error: { message: String(e.message || e), type: "server_error" },
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`video passthrough on http://${HOST}:${PORT}`);
  console.log(`  models: ${catalog.models.map((m) => m.id).join(", ")}`);
  console.log(`  inventory_a: key=${!!APIMART_KEY}`);
  console.log(`  inventory_b: key=${!!OPENLUX_KEY}`);
  console.log(`  inventory_c: key=${!!GRSAI_KEY}`);
  console.log(`  inventory_d: key=${!!AIONE_KEY}`);
  console.log(`  new-api: ${NEW_API_BASE}`);
  console.log(`  db: ${DB_PATH}`);
});
