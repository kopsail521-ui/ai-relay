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
const H = { Authorization: `Bearer ${key}` };

async function usage() {
  const r = await fetch(`${base}/v1/dashboard/billing/usage`, { headers: H, signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  return j.total_usage;
}
console.log("usage_now(cents):", await usage());

for (const p of ["/api/user/self", "/api/user/groups", "/api/log/self?p=1&page_size=5&timestamp0=0"]) {
  try {
    const r = await fetch(`${base}${p}`, { headers: H, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    console.log(p, "=>", r.status, t.slice(0, 600));
  } catch (e) {
    console.log(p, "=> ERR", String(e).slice(0, 120));
  }
}
