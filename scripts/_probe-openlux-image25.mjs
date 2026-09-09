import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const base = (env.OPENLUX_BASE_URL || "https://api.openlux.ai").replace(/\/$/, "");
const key = env.OPENLUX_API_KEY;
const want = /gpt-image-2\.5|sunburst|flare|gpt-image/;

async function get(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const t = await r.text();
  return { status: r.status, t };
}

function walk(x, out = []) {
  if (!x) return out;
  if (Array.isArray(x)) {
    for (const v of x) walk(v, out);
    return out;
  }
  if (typeof x === "object") {
    const id = x.model || x.id || x.name;
    if (id && want.test(String(id))) out.push(x);
    for (const v of Object.values(x)) if (v && typeof v === "object") walk(v, out);
  }
  return out;
}

const urls = [
  `${base}/api/pricing_new`,
  `${base}/v1/models`,
  `${base}/api/pricing`,
];

for (const u of urls) {
  try {
    const { status, t } = await get(u);
    console.log("URL", u, "status", status, "len", t.length);
    if (status >= 400) {
      console.log(t.slice(0, 400));
      continue;
    }
    const j = JSON.parse(t);
    const hits = walk(j);
    const ids = [...new Set(hits.map((h) => h.model || h.id || h.name))];
    console.log("ids", ids.join(", ") || "(none)");
    for (const m of hits) {
      const id = m.model || m.id || m.name;
      if (!/2\.5|sunburst|flare/.test(String(id)) && !want.test(String(id))) continue;
      if (!/image/.test(String(id))) continue;
      console.log("---", id);
      const slim = {
        model: m.model || m.id,
        endpoints: m.endpoints || m.endpoint,
        model_price: m.model_price,
        model_ratio: m.model_ratio,
        completion_ratio: m.completion_ratio,
        enable_groups: m.enable_groups,
        price: m.price,
        input: m.input,
        output: m.output,
        quota_type: m.quota_type,
      };
      // keep group price fields if present
      for (const k of Object.keys(m)) {
        if (/price|group|ratio|usd|cost/i.test(k) && slim[k] === undefined) {
          const v = m[k];
          if (typeof v !== "object" || v === null) slim[k] = v;
          else if (Array.isArray(v) && v.length && v.length < 8) slim[k] = v;
          else if (v && typeof v === "object" && Object.keys(v).length < 12) slim[k] = v;
        }
      }
      console.log(JSON.stringify(slim).slice(0, 1200));
    }
  } catch (e) {
    console.log("err", u, e.message);
  }
}
