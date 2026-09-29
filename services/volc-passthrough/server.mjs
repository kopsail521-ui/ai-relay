/**
 * Keyo Media Tools (:3012)
 *
 * Public IDs: subtitle-erase-pro, video-enhance-pro
 * Client responses must never name suppliers or "upstream".
 *
 * Auth (required for real submits):
 *   MEDIAKIT_API_KEY=...   from MediaKit console settings
 *
 * Optional (reserved, not used for HTTP tools API):
 *   VOLC_ACCESS_KEY=
 *   VOLC_SECRET_KEY=
 *
 * Env:
 *   PORT=3012
 *   LISTEN_HOST=127.0.0.1
 *   MEDIAKIT_BASE=https://mediakit.cn-beijing.volces.com
 *   NEW_API_BASE=http://127.0.0.1:3000
 *   NEW_API_DB=/data/one-api.db
 */
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  for (const p of [
    path.resolve(__dirname, "../../.env"),
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

const PORT = Number(process.env.PORT || 3012);
const HOST = process.env.LISTEN_HOST || "127.0.0.1";
const MEDIAKIT_BASE = (
  process.env.MEDIAKIT_BASE || "https://mediakit.cn-beijing.volces.com"
).replace(/\/+$/, "");
const MEDIAKIT_KEY = (process.env.MEDIAKIT_API_KEY || "").trim();
const HAS_CREDS = Boolean(MEDIAKIT_KEY);

/** @type {Map<string, object>} */
const tasks = new Map();

const MODELS = {
  "subtitle-erase-pro": {
    tool: "erase-video-subtitle-pro",
    pricePerSec: 0.018265,
  },
  "video-enhance-pro": {
    tool: "enhance-video-generative",
    pricePerSecByRes: {
      "720p": 0.034247,
      "1080p": 0.068493,
      "2k": 0.136986,
      "2K": 0.136986,
    },
    defaultRes: "1080p",
  },
};

function json(res, code, body) {
  const raw = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function authOk(req) {
  const h = req.headers.authorization || "";
  return /^Bearer\s+sk-/i.test(h);
}

function mapStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (["success", "succeeded", "completed", "done"].includes(s)) return "completed";
  if (["failure", "failed", "error"].includes(s)) return "failed";
  if (["canceled", "cancelled"].includes(s)) return "cancelled";
  if (
    ["queued", "pending", "submitted", "waiting", "running", "in_progress", "processing"].includes(
      s
    )
  ) {
    return "processing";
  }
  return s || "processing";
}

function publicError(message, code = "media_tools_error") {
  return {
    message: message || "Media tool request failed. Please try again later.",
    type: "service_unavailable",
    code,
  };
}

function scrubProviderText(text) {
  return String(text || "")
    .replace(/volc(?:engine)?|mediakit|火山(?:引擎)?|byteplus|bytedance/gi, "service")
    .replace(/upstream/gi, "service")
    .slice(0, 400);
}

function httpJson(method, urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const payload = bodyObj == null ? null : Buffer.from(JSON.stringify(bodyObj));
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          Authorization: `Bearer ${MEDIAKIT_KEY}`,
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": payload.length,
              }
            : {}),
        },
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = { raw };
          }
          resolve({ status: res.statusCode || 0, data, raw });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function mkSubmit(tool, body) {
  return httpJson("POST", `${MEDIAKIT_BASE}/api/v1/tools/${tool}`, body);
}

async function mkPoll(taskId) {
  return httpJson("GET", `${MEDIAKIT_BASE}/api/v1/tasks/${encodeURIComponent(taskId)}`, null);
}

function normalizeSubmit(mid, mk) {
  const d = mk.data || {};
  const tid = String(d.task_id || d.id || "").trim();
  if (!tid) {
    const msg =
      scrubProviderText(d.error?.message || d.message || d.error) ||
      "Media tool rejected the request.";
    return {
      ok: false,
      status: mk.status >= 400 ? mk.status : 502,
      body: { error: publicError(msg, "submit_failed") },
    };
  }
  const localId = "mt_" + randomUUID().replace(/-/g, "").slice(0, 24);
  tasks.set(localId, {
    id: localId,
    remote_id: tid,
    model: mid,
    status: "processing",
    created_at: Math.floor(Date.now() / 1000),
  });
  // Also index by remote id so clients can poll either.
  tasks.set(tid, tasks.get(localId));
  return {
    ok: true,
    status: 200,
    body: {
      id: localId,
      task_id: localId,
      status: "processing",
      model: mid,
    },
  };
}

function normalizePoll(local, mk) {
  const d = mk.data || {};
  const status = mapStatus(d.status);
  const url =
    d.result?.video_url ||
    d.video_url ||
    d.result?.url ||
    d.url ||
    undefined;
  const duration =
    d.result?.duration != null
      ? Number(d.result.duration)
      : d.duration != null
        ? Number(d.duration)
        : undefined;
  const out = {
    id: local.id,
    task_id: local.id,
    status,
    model: local.model,
  };
  if (status === "completed" && url) out.url = url;
  if (duration != null && Number.isFinite(duration)) out.duration = duration;
  if (status === "failed") {
    out.error = publicError(
      scrubProviderText(d.error?.message || d.message || d.error?.code),
      "task_failed"
    );
  }
  local.status = status;
  if (url) local.url = url;
  if (duration != null) local.duration = duration;
  return out;
}

async function handleSubmit(req, res, modelId) {
  if (!authOk(req)) {
    return json(res, 401, { error: { message: "Unauthorized", type: "auth_error" } });
  }
  if (!HAS_CREDS) {
    return json(res, 503, {
      error: publicError(
        "Media tool temporarily unavailable. Contact support if this persists.",
        "media_tools_not_configured"
      ),
    });
  }

  let body = {};
  try {
    const raw = await readBody(req);
    if (raw.length) body = JSON.parse(raw.toString("utf8"));
  } catch {
    return json(res, 400, {
      error: { message: "Invalid JSON body", type: "invalid_request_error" },
    });
  }

  const mid = body.model || modelId;
  const spec = MODELS[mid];
  if (!spec) {
    return json(res, 400, {
      error: { message: `Unknown model: ${mid}`, type: "invalid_request_error" },
    });
  }
  const videoUrl = body.video_url || body.url || body.input_url || "";
  if (!videoUrl || typeof videoUrl !== "string") {
    return json(res, 400, {
      error: { message: "video_url is required", type: "invalid_request_error" },
    });
  }

  const payload = { video_url: videoUrl };
  if (mid === "video-enhance-pro") {
    let resName = String(
      body.resolution || body.output_resolution || spec.defaultRes || "1080p"
    ).toLowerCase();
    if (resName === "2k") resName = "2k";
    if (!["720p", "1080p", "2k"].includes(resName)) resName = "1080p";
    payload.resolution = resName;
  }
  if (mid === "subtitle-erase-pro") {
    if (body.mode) payload.mode = body.mode;
    if (body.model_version) payload.model_version = body.model_version;
    if (body.erase_ratio_location) payload.erase_ratio_location = body.erase_ratio_location;
  }

  let mk;
  try {
    mk = await mkSubmit(spec.tool, payload);
  } catch {
    return json(res, 502, {
      error: publicError("Media tool request failed. Please retry.", "submit_transport"),
    });
  }

  const norm = normalizeSubmit(mid, mk);
  return json(res, norm.status, norm.body);
}

async function handlePoll(req, res, id) {
  if (!authOk(req)) {
    return json(res, 401, { error: { message: "Unauthorized", type: "auth_error" } });
  }
  if (!HAS_CREDS) {
    return json(res, 503, {
      error: publicError(
        "Media tool temporarily unavailable. Contact support if this persists.",
        "media_tools_not_configured"
      ),
    });
  }

  let local = tasks.get(id);
  const remoteId = local?.remote_id || id;

  let mk;
  try {
    mk = await mkPoll(remoteId);
  } catch {
    return json(res, 502, {
      error: publicError("Media tool poll failed. Please retry.", "poll_transport"),
    });
  }

  if (mk.status === 404) {
    return json(res, 404, {
      error: { message: "Task not found", type: "not_found" },
    });
  }

  if (!local) {
    local = {
      id: id.startsWith("mt_") ? id : "mt_" + id.slice(0, 24),
      remote_id: remoteId,
      model: "unknown",
      status: "processing",
    };
    tasks.set(local.id, local);
  }

  if (mk.status >= 400 && !mk.data?.status) {
    return json(res, 502, {
      error: publicError(
        scrubProviderText(mk.data?.error?.message || mk.data?.message) ||
          "Media tool poll failed.",
        "poll_failed"
      ),
    });
  }

  return json(res, 200, normalizePoll(local, mk));
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const p = u.pathname.replace(/\/+$/, "") || "/";

  try {
    if (req.method === "GET" && (p === "/healthz" || p === "/health")) {
      return json(res, 200, {
        ok: true,
        service: "keyo-media-tools",
        ready: HAS_CREDS,
        models: Object.keys(MODELS),
      });
    }

    if (req.method === "POST" && p === "/v1/async/videos/subtitle-erase") {
      return await handleSubmit(req, res, "subtitle-erase-pro");
    }
    if (req.method === "POST" && p === "/v1/async/videos/enhance") {
      return await handleSubmit(req, res, "video-enhance-pro");
    }
    if (req.method === "GET" && p.startsWith("/v1/task/")) {
      return await handlePoll(req, res, p.slice("/v1/task/".length));
    }

    return json(res, 404, { error: { message: "Not found", type: "not_found" } });
  } catch {
    return json(res, 500, {
      error: publicError("Internal error", "internal_error"),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `keyo-media-tools listening on ${HOST}:${PORT} ready=${HAS_CREDS ? "yes" : "no"}`
  );
});
