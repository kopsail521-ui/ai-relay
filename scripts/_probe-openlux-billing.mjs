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

async function probe(p) {
  try {
    const r = await fetch(`${base}${p}`, { headers: H, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    console.log(p, "=>", r.status, t.slice(0, 400));
  } catch (e) {
    console.log(p, "=> ERR", String(e).slice(0, 200));
  }
}

await probe("/dashboard/billing/subscription");
await probe("/dashboard/billing/usage");
await probe("/v1/dashboard/billing/subscription");
await probe("/v1/dashboard/billing/usage");
