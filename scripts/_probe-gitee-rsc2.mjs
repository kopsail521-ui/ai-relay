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
};

// OpenAI-compatible models list often includes pricing metadata on Gitee
for (const u of [
  "https://ai.gitee.com/v1/models",
  "https://api.gitee.com/v1/models",
  "https://ai.gitee.com/api/openai/v1/models",
]) {
  try {
    const r = await fetch(u, { headers });
    const t = await r.text();
    console.log(u, r.status, t.slice(0, 300).replace(/\s+/g, " "));
    if (r.ok) {
      const j = JSON.parse(t);
      const data = j.data || j;
      if (Array.isArray(data)) {
        for (const n of names) {
          const hit = data.find(
            (x) => x.id === n || x.id?.includes(n) || x.name === n
          );
          if (hit) console.log("FOUND", n, JSON.stringify(hit).slice(0, 500));
        }
        console.log(
          "sample ids",
          data
            .map((x) => x.id)
            .filter((id) =>
              /WeMM|Qwen3-VL|Atria|Prover|Embedding|Rerank/i.test(id || "")
            )
            .slice(0, 40)
        );
      }
    }
  } catch (e) {
    console.log(u, e.message);
  }
}

// Try fetch flight data from next flight / RSC with different accept
for (const n of names) {
  const u = "https://ai.gitee.com/serverless-api/" + encodeURIComponent(n);
  const r = await fetch(u, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/x-component",
      RSC: "1",
      "Next-Url": "/serverless-api/" + n,
    },
  });
  const t = await r.text();
  const free = /免费|free/i.test(t);
  const prices = [...t.matchAll(/([0-9]+\.[0-9]+|[0-9]+)\s*元/g)].map((m) => m[0]);
  const tok = [
    ...t.matchAll(/input_million_tokens_price[^0-9]*([0-9.]+)/g),
  ].map((m) => m[1]);
  const out = [
    ...t.matchAll(/output_million_tokens_price[^0-9]*([0-9.]+)/g),
  ].map((m) => m[1]);
  const path = [...t.matchAll(/v1\/[a-zA-Z0-9_\/-]+/g)].map((m) => m[0]);
  console.log(
    n,
    "rsc",
    r.status,
    "len",
    t.length,
    "free?",
    free,
    "元",
    prices.slice(0, 8),
    "in",
    tok.slice(0, 3),
    "out",
    out.slice(0, 3),
    "paths",
    [...new Set(path)].slice(0, 8)
  );
  fs.writeFileSync(
    path.join(root, "scripts/_gitee_rsc_" + n + ".txt"),
    t.slice(0, 200000)
  );
}
