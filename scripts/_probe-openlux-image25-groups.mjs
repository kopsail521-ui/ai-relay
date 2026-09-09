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

const r = await fetch(`${base}/api/pricing_new`, {
  headers: { Authorization: `Bearer ${key}` },
});
const j = await r.json();
const names = ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2"];
const models = j.data.filter((m) => names.includes(m.model_name));
console.log(JSON.stringify(models, null, 2));

// find group ratio map
const groupKeys = Object.keys(j).filter((k) => /group/i.test(k));
console.log("topKeys", Object.keys(j));
console.log("groupKeys", groupKeys);
for (const k of groupKeys) {
  const v = j[k];
  console.log(k, typeof v, Array.isArray(v) ? v.length : Object.keys(v || {}).slice(0, 20));
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const g of ["Openai-Gpt-1", "Azure-Gpt-6", "Azure-Gpt-5", "Openai-Gpt-2", "default"]) {
      if (v[g] != null) console.log(" ", g, JSON.stringify(v[g]).slice(0, 200));
    }
  }
  if (Array.isArray(v) && v[0]) {
    console.log(" sample", JSON.stringify(v[0]).slice(0, 300));
    const hits = v.filter((x) =>
      ["Openai-Gpt-1", "Azure-Gpt-6"].includes(x.name || x.group || x.id)
    );
    console.log(" hits", JSON.stringify(hits).slice(0, 800));
  }
}
