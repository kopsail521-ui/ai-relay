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
fs.writeFileSync(
  path.join(root, "scripts/_openlux-pricing-sample.json"),
  JSON.stringify(
    {
      keys: Object.keys(j),
      dataType: typeof j.data,
      dataKeys: j.data && typeof j.data === "object" ? Object.keys(j.data).slice(0, 30) : null,
      sample0:
        Array.isArray(j.data)
          ? j.data[0]
          : Array.isArray(j.data?.data)
            ? j.data.data[0]
            : Array.isArray(j.data?.models)
              ? j.data.models[0]
              : j.data,
    },
    null,
    2
  )
);

const text = JSON.stringify(j);
for (const needle of [
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
  "gpt-image-2",
  "sunburst",
  "flare",
]) {
  const i = text.indexOf(needle);
  console.log(needle, i);
  if (i >= 0) {
    console.log(text.slice(Math.max(0, i - 200), i + 600));
    console.log("---");
  }
}

// try find array of models
function findArrays(obj, path = "", depth = 0, out = []) {
  if (!obj || depth > 5) return out;
  if (Array.isArray(obj)) {
    if (obj.length && typeof obj[0] === "object") out.push({ path, len: obj.length, firstKeys: Object.keys(obj[0] || {}) });
    return out;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) findArrays(v, path + "/" + k, depth + 1, out);
  }
  return out;
}
console.log("arrays", JSON.stringify(findArrays(j), null, 2));
