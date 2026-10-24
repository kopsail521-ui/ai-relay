import fs from "node:fs";

const contracts = JSON.parse(fs.readFileSync(new URL("./model-contracts.json", import.meta.url), "utf8"));
const canonical = {
  openai: { path: "/v1/chat/completions", method: "POST" },
  "openai-response": { path: "/v1/responses", method: "POST" },
  anthropic: { path: "/v1/messages", method: "POST" },
  gemini: { path: "/v1beta/models/{model}:generateContent", method: "POST" },
};
const tags = {
  chat: "大语言模型", transcription: "语音识别", speech: "语音合成", "async-tts": "语音合成",
  "image-generation": "图片模型", video: "视频模型", "video-processing": "视频处理",
  "image-processing": "图像处理", ocr: "OCR", document: "文档解析", "digital-human": "数字人",
  embedding: "嵌入模型", decision: "决策模型", moderation: "内容风控", music: "音乐",
};

// Public metadata describes the documented request contract. It never changes
// billing amounts, group ratios, routing, or the underlying API response data.
export function normalizePublicModelMetadata(payload, copy = {}) {
  if (!payload || !Array.isArray(payload.data)) return payload;
  const endpoints = { ...(payload.supported_endpoint || {}), ...canonical };
  const data = payload.data.map((model) => {
    const name = model.model_name || model.model;
    const contract = contracts[name];
    const kind = contract?.kind || "unknown";
    const entry = copy[name] || copy[String(name || "").replace(/:free$/, "")] || {};
    const next = {
      ...model,
      capability: kind,
      billing_unit: entry.unit || (kind === "chat" ? "token" : null),
      has_price_tiers: Boolean(entry.price_table?.rows?.length),
      contract_status: kind === "chat" || contract?.requests?.length ? "documented" : "pending",
    };
    if (tags[kind]) {
      const extra = kind === "chat" ? String(model.tags || "").split(/[,，]/).filter((tag) => ["工具", "识图", "思考"].includes(tag.trim())) : [];
      next.tags = [...new Set([tags[kind], ...extra])].join(",");
    }
    if (kind === "chat") {
      // All chat models expose Chat Completions. Preserve other explicitly
      // advertised chat protocols, using the gateway's canonical paths.
      next.supported_endpoint_types = [...new Set(["openai", ...(Array.isArray(model.supported_endpoint_types) ? model.supported_endpoint_types : [])])]
        .filter((type) => Object.hasOwn(canonical, type));
    } else {
      next.supported_endpoint_types = [];
      for (const request of contract?.requests || []) {
        const type = `${kind}:${request.path}`;
        endpoints[type] = {
          path: request.path,
          method: "POST",
          content_type: request.files ? "multipart/form-data" : "application/json",
          ...(request.pollPath ? { poll_path: request.pollPath } : {}),
        };
        if (!next.supported_endpoint_types.includes(type)) next.supported_endpoint_types.push(type);
      }
    }
    return next;
  });
  return { ...payload, data, supported_endpoint: endpoints };
}
