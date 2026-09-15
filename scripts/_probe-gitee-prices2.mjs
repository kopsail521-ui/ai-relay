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

const candidates = [
  "https://ai.gitee.com/api/v1/serverless/services",
  "https://ai.gitee.com/api/v1/serverless",
  "https://ai.gitee.com/api/v1/ai_models",
  "https://ai.gitee.com/api/v1/repos",
  "https://ai.gitee.com/v1/models?detail=1",
  "https://ai.gitee.com/api/base/model_square/list",
  "https://ai.gitee.com/api/base/serverless/list",
  "https://ai.gitee.com/api/base/serverless/detail?repo_path=WeMM-Embedding-9B",
  "https://ai.gitee.com/api/base/serverless/detail?name=WeMM-Embedding-9B",
  "https://ai.gitee.com/api/v1/enterprise/serverless/models",
];

for (const u of candidates) {
  try {
    const r = await fetch(u, {
      headers: {
        Authorization: "Bearer " + key,
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });
    const t = await r.text();
    console.log(u, r.status, t.slice(0, 160).replace(/\s+/g, " "));
  } catch (e) {
    console.log(u, e.message);
  }
}

// parse full html for price snippets for all models
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
for (const n of names) {
  const html = await (
    await fetch("https://ai.gitee.com/serverless-api/" + encodeURIComponent(n), {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
  ).text();
  const re =
    /([0-9]+(?:\.[0-9]+)?)\s*元\s*\/\s*(?:百万|百万Token|M|1M)?\s*(?:Token|Tokens|tokens)?|(免费)|¥\s*([0-9.]+)|([0-9.]+)\s*元\/千/gi;
  const hits = [];
  let m;
  while ((m = re.exec(html)) && hits.length < 12) hits.push(m[0]);
  // broader: look near 价格
  const i = html.search(/价格|计费|Price|Token/);
  const ctx = i >= 0 ? html.slice(i, i + 400).replace(/\s+/g, " ") : "";
  console.log("\n", n, hits, "ctx:", ctx.slice(0, 250));
}
