import fs from "fs";

const base = "E:/01来粉来粉/中转/ai-relay";
const html = fs.readFileSync(`${base}/static/brand/keyo-docs.html`, "utf8");
const one = fs.readFileSync(`${base}/docs/客户接入一页纸.md`, "utf8");
const gitee = JSON.parse(
  fs.readFileSync(`${base}/config/gitee-selected-models.json`, "utf8")
);
const apimart = JSON.parse(
  fs.readFileSync(`${base}/config/apimart-selected-models.json`, "utf8")
);
const openluxV = JSON.parse(
  fs.readFileSync(`${base}/config/openlux-selected-models.json`, "utf8")
);
const grsai = JSON.parse(fs.readFileSync(`${base}/config/grsai.json`, "utf8"));
const free = JSON.parse(
  fs.readFileSync(`${base}/config/sensenova-free-models.json`, "utf8")
);
const mp = JSON.parse(
  fs.readFileSync(`${base}/config/marketplace-model-copy.json`, "utf8")
);
const chatCat = JSON.parse(
  fs.readFileSync(`${base}/config/openlux-chat-catalog.json`, "utf8")
);

const docsIds = new Set(
  [...html.matchAll(/data-copy="([^"]+)"/g)]
    .map((m) => m[1])
    .filter(
      (s) =>
        !s.startsWith("http") &&
        !s.includes(" ") &&
        s.length > 2 &&
        !/^(Bearer|copy)$/i.test(s)
    )
);

const oneIds = new Set();
for (const m of one.matchAll(/`([a-zA-Z0-9][a-zA-Z0-9._-]{2,80})`/g))
  oneIds.add(m[1]);
for (const m of one.matchAll(/\|\s*([a-zA-Z0-9][a-zA-Z0-9._-]{2,80})\s*\|/g))
  oneIds.add(m[1]);

const freeModels = Array.isArray(free)
  ? free
  : free.models || [];
const curated = new Set([
  ...gitee.models.map((m) => m.id),
  ...(apimart.models || []).map((m) => m.id),
  ...(openluxV.models || []).map((m) => m.id),
  ...(grsai.models || []).map((m) => m.id),
  ...freeModels.map((m) => m.id || m),
]);

const mpIds = Object.keys(mp).filter((k) => !k.startsWith("__"));

console.log("=== docs data-copy IDs (" + docsIds.size + ") ===");
console.log([...docsIds].sort().join("\n"));

console.log("\n=== curated NOT in keyo-docs data-copy ===");
for (const id of [...curated].sort()) {
  if (!docsIds.has(id)) console.log(id + (oneIds.has(id) ? " (in one-pager)" : ""));
}

console.log("\n=== marketplace keys not in curated catalogs ===");
for (const id of mpIds.sort()) {
  if (!curated.has(id)) console.log(id);
}

console.log("\n=== path coverage checks ===");
for (const needle of [
  "embeddings",
  "rerank",
  "WeMM",
  "Atria",
  "Prover",
  "Qwen3-VL",
  "gpt-6-astra",
  "deepseek-v4-pro",
  "glm-5.2",
  "Atria-dawn",
  "DeepSeek-Prover",
]) {
  console.log(needle, "docs=", html.includes(needle), "one=", one.includes(needle));
}

const chatIds = (chatCat.models || []).map((m) => m.id || m);
console.log("\nopenlux-chat-catalog count", chatIds.length);
console.log("note", chatCat.note || chatCat.source);

const featuredChat = mpIds.filter(
  (id) =>
    !curated.has(id) ||
    id.includes("gpt-") ||
    id.includes("claude") ||
    id.includes("gemini") ||
    id.includes("deepseek") ||
    id.includes("kimi") ||
    id.includes("glm") ||
    id.includes("grok") ||
    id.includes("MiniMax") ||
    id.includes("qwen")
);
console.log("\n=== marketplace chat-ish (may be live pricing) ===");
console.log(
  featuredChat
    .filter(
      (id) =>
        ![
          ...gitee.models.map((m) => m.id),
          ...(apimart.models || []).map((m) => m.id),
          ...(openluxV.models || []).map((m) => m.id),
          ...(grsai.models || []).map((m) => m.id),
        ].includes(id)
    )
    .join("\n")
);
