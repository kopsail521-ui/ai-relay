import fs from "fs";

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

function findOps(html, name) {
  // RSC payloads sometimes embed JSON with escaped quotes
  const markers = [
    "input_million_tokens_price",
    "output_million_tokens_price",
    "unit_tag",
    '"price":',
    "operations",
  ];
  const out = [];
  for (const m of markers) {
    let i = 0;
    let c = 0;
    while ((i = html.indexOf(m, i)) >= 0 && c < 3) {
      out.push({ m, ctx: html.slice(Math.max(0, i - 120), i + 180).replace(/\s+/g, " ") });
      i += m.length;
      c++;
    }
  }
  return out;
}

for (const n of names) {
  const html = await (
    await fetch("https://ai.gitee.com/serverless-api/" + encodeURIComponent(n), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    })
  ).text();
  const hits = findOps(html, n);
  console.log("\n===", n, "hits", hits.length, "html", html.length);
  for (const h of hits.slice(0, 6)) console.log(h.m, "=>", h.ctx);
}

// try internal gateway hosts sometimes used by Gitee AI
const hosts = [
  "https://ai.gitee.com",
  "https://api.gitee.com",
];
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
for (const host of hosts) {
  for (const path of [
    "/api/v1/ai/serverless/services?keyword=WeMM",
    "/api/v1/ai/services?type=serverless&keyword=WeMM",
    "/enterprises/ai/serverless/services?keyword=WeMM",
  ]) {
    try {
      const r = await fetch(host + path, {
        headers: { Authorization: "Bearer " + key, Accept: "application/json" },
      });
      console.log(host + path, r.status, (await r.text()).slice(0, 160).replace(/\s+/g, " "));
    } catch (e) {
      console.log(host + path, e.message);
    }
  }
}
