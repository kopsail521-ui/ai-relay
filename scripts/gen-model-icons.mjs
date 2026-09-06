/**
 * Generate missing marketplace icons via KeyoAPI gpt-image-2.
 * Usage: node scripts/gen-model-icons.mjs
 * Needs: NEW_API_BASE + admin login, or KEYO_API_KEY / NEW_API_TOKEN
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "static", "brand", "model-icons");
const mapPath = path.join(root, "config", "model-icon-map.json");

function loadEnv() {
  const env = {};
  const p = path.join(root, ".env");
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const BASE = (env.NEW_API_BASE || process.env.NEW_API_BASE || "https://www.keyoapi.xyz").replace(
  /\/$/,
  ""
);

const PROMPTS = {
  VajraV1:
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, cyan geometric crosshair and eye symbol for computer vision detection, no text, no letters, clean edges, 512 style",
  AnimeSharp:
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, magenta sparkle and crystal shard symbol for image upscaling, no text, no letters, clean edges",
  UVDoc:
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, teal curved paper document unwarping symbol, no text, no letters, clean edges",
  "MinerU2.5-Pro":
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, amber stacked documents and parse lines symbol for OCR PDF, no text, no letters, clean edges",
  "Duix-Avatar":
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, soft purple stylized human face silhouette digital avatar, no text, no letters, clean edges",
  InfiniteTalk:
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, pink face silhouette with sound waves for talking avatar, no text, no letters, clean edges",
  "MOSS-Audio-8B-Thinking":
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, green audio waveform with small brain node for speech AI, no text, no letters, clean edges",
  "nonescape-v0":
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, slate blue shield with check mark for content safety, no text, no letters, clean edges",
  "moark-text-moderation":
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, indigo shield with text lines for moderation, no text, no letters, clean edges",
  "Security-semantic-filtering":
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, steel blue lock and filter funnel security symbol, no text, no letters, clean edges",
  "nsfw-classifier":
    "App icon, rounded square, flat minimal vector, dark navy background #0f172a, violet shield with eye slash for NSFW filter, no text, no letters, clean edges",
};

async function getToken() {
  const direct =
    process.env.KEYO_API_KEY ||
    process.env.NEW_API_TOKEN ||
    env.KEYO_API_KEY ||
    env.NEW_API_TOKEN;
  if (direct) return { token: direct.replace(/^Bearer\s+/i, ""), base: BASE };

  // Prefer Grsai upstream (same model as Keyo gpt-image-2) when admin session is limited
  if (env.GRSAI_API_KEY) {
    const gbase = (env.GRSAI_BASE_URL || "https://grsaiapi.com").replace(/\/$/, "");
    return { token: env.GRSAI_API_KEY, base: gbase, via: "grsai" };
  }

  const user = env.NEW_API_ADMIN_USER || "root";
  const pass = env.NEW_API_ADMIN_PASSWORD;
  if (!pass) throw new Error("Need KEYO_API_KEY / GRSAI_API_KEY or NEW_API_ADMIN_PASSWORD");

  const login = await fetch(`${BASE}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const lj = await login.json();
  if (!lj.success) throw new Error("login failed: " + JSON.stringify(lj));
  const access = lj?.data?.access_token;
  const cookies = (login.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");

  const tokRes = await fetch(`${BASE}/api/token/?p=0&page_size=20`, {
    headers: {
      Authorization: `Bearer ${access}`,
      Cookie: cookies,
    },
  });
  const tj = await tokRes.json();
  const items = tj?.data?.items || tj?.data || [];
  const list = Array.isArray(items) ? items : [];
  const existing = list.find((t) => t.status === 1 && t.key);
  if (existing?.key) return { token: existing.key, base: BASE };

  const create = await fetch(`${BASE}/api/token/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      Cookie: cookies,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "icon-gen",
      remain_quota: 500000000,
      unlimited_quota: true,
      model_limits_enabled: false,
    }),
  });
  const cj = await create.json();
  if (!cj.success) throw new Error("create token failed: " + JSON.stringify(cj));
  const key = cj?.data?.key || cj?.data?.token || cj?.data;
  if (typeof key === "string") return { token: key, base: BASE };
  if (key?.key) return { token: key.key, base: BASE };
  throw new Error("no token key in create response: " + JSON.stringify(cj));
}

async function genOne(auth, modelName, prompt, fileBase) {
  const outFile = path.join(outDir, `${fileBase}.png`);
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
    console.log("skip existing", fileBase);
    return outFile;
  }
  console.log("generating", modelName, "via", auth.base, "...");
  const payloads = [
    {
      model: "gpt-image-2",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    },
    {
      model: "gpt-image-2",
      prompt,
      n: 1,
      size: "1024x1024",
    },
  ];
  let lastErr = "";
  for (const body of payloads) {
    const res = await fetch(`${auth.base}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      lastErr = `HTTP ${res.status}: ${text.slice(0, 400)}`;
      continue;
    }
    const j = JSON.parse(text);
    const item = (Array.isArray(j?.data) ? j.data[0] : j?.data) || {};
    let buf;
    if (item.b64_json) {
      buf = Buffer.from(item.b64_json, "base64");
    } else if (item.url) {
      const img = await fetch(item.url);
      buf = Buffer.from(await img.arrayBuffer());
    } else {
      lastErr = "unexpected: " + text.slice(0, 400);
      continue;
    }
    fs.writeFileSync(outFile, buf);
    console.log("wrote", outFile, buf.length);
    return outFile;
  }
  throw new Error(`${modelName} ${lastErr}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const auth = await getToken();
  console.log("auth ok", auth.via || "keyo", auth.base);

  const jobs = Object.entries(map.icons || {}).map(([modelName, urlPath]) => {
    const fileBase = path.basename(urlPath, ".png");
    const prompt = PROMPTS[modelName];
    if (!prompt) {
      console.warn("no prompt for", modelName);
      return Promise.resolve(null);
    }
    return genOne(auth, modelName, prompt, fileBase)
      .then((f) => ({ modelName, ok: true, file: f }))
      .catch((e) => {
        console.error("FAIL", modelName, e.message || e);
        return { modelName, ok: false, error: String(e.message || e) };
      });
  });

  console.log("batch parallel", jobs.length);
  const results = await Promise.all(jobs);
  const ok = results.filter((r) => r && r.ok).length;
  const fail = results.filter((r) => r && !r.ok).length;
  console.log("DONE_GEN_ICONS", { ok, fail });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
