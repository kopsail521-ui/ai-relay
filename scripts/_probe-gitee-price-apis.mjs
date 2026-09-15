import fs from "fs";
import path from "node:path";
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
const key = env.GITEE_API_KEY;
const names = [
  "Atria-dawn-v2",
  "DeepSeek-Prover-V2-7B",
  "WeMM-Embedding-9B",
  "WeMM-Embedding-4B",
  "WeMM-Embedding-2B",
  "Qwen3-VL-Reranker-2B",
  "Qwen3-VL-Reranker-8B",
  "Qwen3-VL-Embedding-8B",
];
const headers = {
  Authorization: "Bearer " + key,
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0",
  Referer: "https://ai.gitee.com/",
};

const urls = [];
for (const n of names) {
  urls.push(
    `https://ai.gitee.com/api/base/model_square/detail?repo_path=${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/base/model_square/detail?name=${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/base/serverless/detail?ident=${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/base/serverless/detail?name=${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/v1/repos/${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/models/${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/v1/models/detail?id=${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/v1/billing/price?model=${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/v1/serverless_apis/${encodeURIComponent(n)}`
  );
}
urls.push(
  "https://ai.gitee.com/api/base/model_square/list?page=1&page_size=50&keyword=WeMM",
  "https://ai.gitee.com/api/base/model_square/list?page=1&page_size=50&keyword=Reranker",
  "https://ai.gitee.com/api/base/model_square/list?page=1&page_size=50&keyword=Atria",
  "https://ai.gitee.com/api/base/model_square/list?page=1&page_size=50&keyword=Prover",
  "https://ai.gitee.com/api/base/serverless/list?page=1&page_size=50&keyword=WeMM",
  "https://ai.gitee.com/api/v1/serverless_apis?page=1&page_size=50",
  "https://ai.gitee.com/api/v1/billing/models"
);

const out = {};
for (const u of urls) {
  try {
    const r = await fetch(u, { headers });
    const t = await r.text();
    const interesting =
      r.status !== 404 &&
      !t.includes("<!DOCTYPE html>") &&
      t.length > 2 &&
      !t.includes("Resource not found");
    if (interesting || /price|WeMM|Atria|Prover/i.test(t.slice(0, 500))) {
      console.log(u, r.status, t.slice(0, 280).replace(/\s+/g, " "));
      out[u] = { status: r.status, body: t.slice(0, 5000) };
    }
  } catch (e) {
    console.log(u, e.message);
  }
}
fs.writeFileSync(
  path.join(root, "scripts/_gitee-price-api-hits.json"),
  JSON.stringify(out, null, 2)
);

// Also try docs OpenAPI pages
for (const n of names) {
  for (const u of [
    `https://ai.gitee.com/docs/openapi/v1/embeddings?model=${n}`,
    `https://ai.gitee.com/docs/models/${n}`,
  ]) {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
    const t = await r.text();
    if (r.ok && /元|价格|Token|免费/.test(t)) {
      console.log("DOC", u, r.status, t.match(/[0-9.]+元[^<\n]{0,40}|免费[^<\n]{0,20}/g)?.slice(0, 8));
    }
  }
}
