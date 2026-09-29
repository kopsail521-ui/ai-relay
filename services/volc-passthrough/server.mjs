/**
 * Keyo Media Tools passthrough (:3012)
 *
 * Public IDs: subtitle-erase-pro, video-enhance-pro
 * Do NOT expose supplier names in client errors.
 *
 * Env:
 *   PORT=3012
 *   LISTEN_HOST=127.0.0.1
 *   VOLC_ACCESS_KEY=
 *   VOLC_SECRET_KEY=
 *   NEW_API_BASE=http://127.0.0.1:3000
 *   NEW_API_DB=/data/one-api.db
 *
 * Upstream Volc MediaKit wiring is gated on AK/SK; without keys, submit returns 503.
 */
import http from "http";
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
const AK = (process.env.VOLC_ACCESS_KEY || "").trim();
const SK = (process.env.VOLC_SECRET_KEY || "").trim();
const HAS_UPSTREAM = Boolean(AK && SK);

/** @type {Map<string, object>} */
const tasks = new Map();

const MODELS = {
  "subtitle-erase-pro": {
    path: "/v1/async/videos/subtitle-erase",
    pricePerSec: 0.018265,
  },
  "video-enhance-pro": {
    path: "/v1/async/videos/enhance",
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

async function handleSubmit(req, res, modelId) {
  if (!authOk(req)) {
    return json(res, 401, { error: { message: "Unauthorized", type: "auth_error" } });
  }
  if (!HAS_UPSTREAM) {
    return json(res, 503, {
      error: {
        message:
          "Media tool temporarily unavailable. Contact support if this persists.",
        type: "upstream_unavailable",
        code: "media_tools_not_configured",
      },
    });
  }

  let body = {};
  try {
    const raw = await readBody(req);
    if (raw.length) body = JSON.parse(raw.toString("utf8"));
  } catch {
    return json(res, 400, { error: { message: "Invalid JSON body", type: "invalid_request_error" } });
  }

  const mid = body.model || modelId;
  if (!MODELS[mid]) {
    return json(res, 400, {
      error: { message: `Unknown model: ${mid}`, type: "invalid_request_error" },
    });
  }
  const videoUrl = body.video_url || body.url || body.input_url || "";
  if (!videoUrl || typeof videoUrl !== "string") {
    return json(res, 400, {
      error: {
        message: "video_url is required",
        type: "invalid_request_error",
      },
    });
  }

  // Placeholder: real Volc MediaKit OpenAPI submit goes here once AK/SK verified.
  const id = "mt_" + randomUUID().replace(/-/g, "").slice(0, 24);
  const task = {
    id,
    model: mid,
    status: "failed",
    error: {
      message:
        "Upstream media pipeline not fully wired yet. Listing is live; submit will be enabled after provider keys + MediaKit submit/poll are connected.",
      type: "not_implemented",
    },
    created_at: Math.floor(Date.now() / 1000),
    video_url: videoUrl,
    resolution: body.resolution || body.output_resolution || "1080p",
  };
  tasks.set(id, task);
  return json(res, 501, {
    id,
    status: "failed",
    error: task.error,
  });
}

function handlePoll(req, res, id) {
  if (!authOk(req)) {
    return json(res, 401, { error: { message: "Unauthorized", type: "auth_error" } });
  }
  const t = tasks.get(id);
  if (!t) {
    return json(res, 404, {
      error: { message: "Task not found", type: "not_found" },
    });
  }
  return json(res, 200, {
    id: t.id,
    status: t.status,
    model: t.model,
    error: t.error || undefined,
    url: t.url || undefined,
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const p = u.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "GET" && (p === "/healthz" || p === "/health")) {
    return json(res, 200, {
      ok: true,
      service: "keyo-media-tools",
      upstream_configured: HAS_UPSTREAM,
      models: Object.keys(MODELS),
    });
  }

  if (req.method === "POST" && p === "/v1/async/videos/subtitle-erase") {
    return handleSubmit(req, res, "subtitle-erase-pro");
  }
  if (req.method === "POST" && p === "/v1/async/videos/enhance") {
    return handleSubmit(req, res, "video-enhance-pro");
  }
  if (req.method === "GET" && p.startsWith("/v1/task/")) {
    return handlePoll(req, res, p.slice("/v1/task/".length));
  }

  return json(res, 404, { error: { message: "Not found", type: "not_found" } });
});

server.listen(PORT, HOST, () => {
  console.log(
    `keyo-media-tools listening on ${HOST}:${PORT} upstream=${HAS_UPSTREAM ? "yes" : "no"}`
  );
});
