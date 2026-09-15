import fs from "fs";

const pricing = JSON.parse(
  fs.readFileSync(
    "C:/Users/rsfqq/.cursor/projects/e-01-ai-relay/agent-tools/246c7d8a-e89d-45ed-9844-72edf99299cc.txt",
    "utf8"
  )
);
const html = fs.readFileSync(
  "E:/01来粉来粉/中转/ai-relay/static/brand/keyo-docs.html",
  "utf8"
);
const gitee = JSON.parse(
  fs.readFileSync(
    "E:/01来粉来粉/中转/ai-relay/config/gitee-selected-models.json",
    "utf8"
  )
);
const apimartCat = JSON.parse(
  fs.readFileSync(
    "E:/01来粉来粉/中转/ai-relay/services/apimart-passthrough/catalog.json",
    "utf8"
  )
);
const openluxVid = JSON.parse(
  fs.readFileSync(
    "E:/01来粉来粉/中转/ai-relay/config/openlux-selected-models.json",
    "utf8"
  )
);
const grsai = JSON.parse(
  fs.readFileSync("E:/01来粉来粉/中转/ai-relay/config/grsai.json", "utf8")
);

const endpointMap = pricing.supported_endpoint || {};
const rows = pricing.data || [];

const docsIds = new Set(
  [...html.matchAll(/data-copy="([^"]+)"/g)]
    .map((m) => m[1])
    .filter(
      (s) =>
        !s.startsWith("http") &&
        !s.includes(" ") &&
        s.length > 2 &&
        !["copy", "Bearer"].includes(s)
    )
);
// also model-btn text / table models
for (const m of html.matchAll(/data-copy="([a-zA-Z0-9][a-zA-Z0-9._-]{1,80})"/g)) {
  docsIds.add(m[1]);
}

const pricingIds = new Set(rows.map((r) => r.model_name));

const giteeById = Object.fromEntries(gitee.models.map((m) => [m.id, m]));
const apimartById = Object.fromEntries(
  (apimartCat.models || []).map((m) => [m.id, m])
);
const openluxVidById = Object.fromEntries(
  (openluxVid.models || []).map((m) => [m.id, m])
);
const grsaiIds = new Set((grsai.models || []).map((m) => m.id));

const VIDEO_CREEM = new Set([
  "gemini-omni-1.1-flash",
  "gemini-omni-1.1-flash-ext",
  "seedance-2.5",
  "seedance-2.0",
  "flux-3-video",
  "MiniMax-H3",
  "wan3.0-video",
  "grok-imagine-video-1.5-preview",
]);

function resolvePath(id, row) {
  const types = row.supported_endpoint_types || [];
  const g = giteeById[id];
  if (g?.paths?.length) {
    return g.paths.map((p) => `POST /${p.replace(/^\//, "")}`).join(" | ");
  }
  if (apimartById[id] || openluxVidById[id] || VIDEO_CREEM.has(id)) {
    return "POST /v1/videos/generations (also POST /v1/videos via creem rewrite); poll GET /v1/tasks/{id} or GET /v1/videos/{id}";
  }
  if (grsaiIds.has(id) || types.includes("image-generation")) {
    return "POST /v1/images/generations";
  }
  if (types.includes("openai-video")) {
    return "POST /v1/videos/generations";
  }
  if (types.includes("openai") || types.length === 0) {
    // default chat for LLM-looking
    return "POST /v1/chat/completions";
  }
  // map endpoint type keys
  const mapped = types
    .map((t) => {
      const e = endpointMap[t];
      return e ? `${e.method} ${e.path}` : t;
    })
    .join(" | ");
  return mapped || "UNCLEAR";
}

function probeNotes(id, row, path) {
  const g = giteeById[id];
  if (g) {
    const ops = (g.operations || []).map((o) => o.path).join(", ");
    const bill = g.billing?.mode;
    if (g.category === "vision_cv")
      return `JSON+image URL/base64; path-specific (detection/seg/pose). bill=${bill}`;
    if (g.category === "image_process")
      return `image input on ${g.paths?.[0]}; bill=${bill}`;
    if (g.category === "document_ocr")
      return `async parse or chat; paths=${ops || g.paths}; bill=${bill}`;
    if (g.category === "digital_human")
      return `async video; media URLs; bill=${bill}`;
    if (g.category === "asr") return `multipart audio file; bill=${bill}`;
    if (g.category === "tts")
      return `text(+voice); sync and/or async speech; bill=${bill}`;
    if (g.category === "moderation")
      return `input text or image per model; bill=${bill}`;
    if (g.category === "rag") {
      if ((g.paths || []).some((p) => p.includes("rerank")))
        return `query+documents; POST /v1/rerank`;
      return `input texts[]; POST /v1/embeddings`;
    }
    if (g.category?.startsWith("chat"))
      return `messages[]; max_tokens optional`;
    return `see gitee catalog; bill=${bill}`;
  }
  if (apimartById[id] || openluxVidById[id]) {
    const meta = apimartById[id] || openluxVidById[id];
    const mode = meta.estimate?.mode || meta.billing;
    return `prompt + optional image/video refs; duration/resolution fields; billing=${mode}`;
  }
  if (grsaiIds.has(id)) return `prompt (+size/n); OpenAI images shape`;
  if (path.includes("chat/completions"))
    return `{"model","messages":[{"role","content"}]}`;
  if (path.includes("images/generations")) return `{"model","prompt"} (+size)`;
  if (path.includes("moderations")) return `{"model","input"}`;
  return "UNCLEAR";
}

function notes(id, row) {
  const parts = [];
  const types = row.supported_endpoint_types || [];
  parts.push(`tags=${row.tags || "-"}`);
  parts.push(`quota_type=${row.quota_type}`);
  if (giteeById[id])
    parts.push(`INTERNAL relay=${giteeById[id].relay || "gitee"}`);
  if (apimartById[id]) parts.push("INTERNAL relay=apimart-passthrough:3011");
  if (openluxVidById[id])
    parts.push("INTERNAL upstream=openlux via apimart-passthrough");
  if (VIDEO_CREEM.has(id))
    parts.push("INTERNAL creem POST /v1/videos → :3011 /v1/videos/generations");
  if (grsaiIds.has(id)) parts.push("INTERNAL image via grsai channel");
  if (id === "keyo-text-moderation")
    parts.push("INTERNAL replaces moark-text-moderation public id?");
  if (id.endsWith("-free")) parts.push("free tier twin");
  if (!giteeById[id] && !apimartById[id] && !openluxVidById[id] && !grsaiIds.has(id)) {
    if (types.includes("openai") || !types.length)
      parts.push("INTERNAL likely NewAPI→OpenLux chat");
  }
  // special missing from VIDEO_CREEM
  if (
    (id === "grok-1.5-video" || id === "veo_3_1-components") &&
    !VIDEO_CREEM.has(id)
  ) {
    parts.push(
      "INTERNAL in openlux-selected but NOT in creem VIDEO_GEN_MODELS — verify rewrite"
    );
  }
  return parts.join("; ");
}

console.log("=== PRICING COUNT", pricingIds.size);
console.log("=== MATRIX");
for (const row of [...rows].sort((a, b) =>
  a.model_name.localeCompare(b.model_name)
)) {
  const id = row.model_name;
  const path = resolvePath(id, row);
  const probe = probeNotes(id, row, path);
  const n = notes(id, row);
  console.log(`| ${id} | ${path} | ${probe} | ${n} |`);
}

const inDocsNotPricing = [...docsIds]
  .filter((id) => !pricingIds.has(id))
  .filter((id) => {
    // filter non-model noise
    return (
      /[a-zA-Z]/.test(id) &&
      !["zhCN", "en", "fr", "ru", "ja", "vi", "zhTW"].includes(id) &&
      id.length > 3
    );
  })
  .sort();

// tighten: only ids that look like models (appear as model-btn or known patterns)
const modelBtnIds = new Set(
  [...html.matchAll(/class="model-btn"[^>]*data-copy="([^"]+)"/g)].map(
    (m) => m[1]
  )
);
const docsNotPricing = [...modelBtnIds]
  .filter((id) => !pricingIds.has(id))
  .sort();
const pricingNotDocs = [...pricingIds]
  .filter((id) => !modelBtnIds.has(id) && !html.includes(id))
  .sort();
const pricingMentionedNotBtn = [...pricingIds]
  .filter((id) => !modelBtnIds.has(id) && html.includes(id))
  .sort();

console.log("\n=== DOCS model-btn NOT IN PRICING ===");
console.log(docsNotPricing.join("\n") || "(none)");
console.log("\n=== PRICING NOT MENTIONED IN DOCS HTML ===");
console.log(pricingNotDocs.join("\n") || "(none)");
console.log("\n=== PRICING mentioned but not model-btn ===");
console.log(pricingMentionedNotBtn.join("\n") || "(none)");
console.log("\n=== ALL model-btn count", modelBtnIds.size);
console.log([...modelBtnIds].sort().join("\n"));

// endpoint type distribution
console.log("\n=== endpoint types per model ===");
for (const row of rows) {
  console.log(
    row.model_name,
    (row.supported_endpoint_types || []).join(",") || "(none)"
  );
}
