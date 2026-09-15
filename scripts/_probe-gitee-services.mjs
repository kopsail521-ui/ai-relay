import fs from "fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const key = env.GITEE_API_KEY;
const headers = {
  Authorization: "Bearer " + key,
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0",
  Referer: "https://ai.gitee.com/serverless-api",
};

const want = [
  "Atria-dawn-v2",
  "DeepSeek-Prover-V2-7B",
  "WeMM-Embedding-9B",
  "WeMM-Embedding-4B",
  "WeMM-Embedding-2B",
  "Qwen3-VL-Reranker-2B",
  "Qwen3-VL-Reranker-8B",
  "Qwen3-VL-Embedding-8B",
];

const urls = [];
for (const n of want) {
  urls.push(
    `https://ai.gitee.com/api/v1/serverless/services?ident=${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/serverless/services?ident=${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/v1/services?ident=${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/services?ident=${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/v1/serverless/services/${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/services/serverless/${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/v1/ai/serverless/${encodeURIComponent(n)}`,
    `https://ai.gitee.com/api/ai/serverless/services?name=${encodeURIComponent(n)}`
  );
}
urls.push(
  "https://ai.gitee.com/api/v1/serverless/services?page=1&page_size=20",
  "https://ai.gitee.com/api/services?type=serverless&page=1&page_size=20",
  "https://ai.gitee.com/api/v1/services?type=serverless&page=1",
  "https://ai.gitee.com/api/serverless/list?page=1",
  "https://ai.gitee.com/api/v1/serverless/list?page=1",
  "https://ai.gitee.com/api/v1/serverless_api/list",
  "https://ai.gitee.com/api/base/v1/serverless/list"
);

const seen = new Set();
for (const u of urls) {
  if (seen.has(u)) continue;
  seen.add(u);
  try {
    const r = await fetch(u, { headers });
    const t = await r.text();
    if (r.status === 404 && t.includes("Resource not found")) continue;
    if (r.status === 404 && t.includes("不存在")) continue;
    console.log(u, r.status, t.slice(0, 220).replace(/\s+/g, " "));
  } catch (e) {
    console.log(u, e.message);
  }
}

// try service id from known gemma
const gemma = JSON.parse(fs.readFileSync("_tmp_gitee_prices.json", "utf8"))[
  "gemma-4-26B-A4B-it"
][0];
console.log("gemma service id", gemma.service.id, "model", gemma.service.model);
for (const u of [
  `https://ai.gitee.com/api/v1/serverless/services/${gemma.service.id}`,
  `https://ai.gitee.com/api/services/${gemma.service.id}`,
  `https://ai.gitee.com/api/v1/services/${gemma.service.id}`,
  `https://ai.gitee.com/api/v1/services/${gemma.service.id}/operations`,
  `https://ai.gitee.com/api/services/${gemma.service.id}/operations`,
  `https://ai.gitee.com/api/v1/models/${gemma.service.model}`,
  `https://ai.gitee.com/api/models/id/${gemma.service.model}`,
]) {
  const r = await fetch(u, { headers });
  const t = await r.text();
  console.log("KNOWN", u, r.status, t.slice(0, 250).replace(/\s+/g, " "));
}
