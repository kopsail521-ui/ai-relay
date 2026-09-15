import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function walk(o, out = []) {
  if (!o || typeof o !== "object") return out;
  if (Array.isArray(o)) {
    for (const x of o) walk(x, out);
    return out;
  }
  const keys = Object.keys(o);
  if (
    keys.some((k) =>
      /price|unit_tag|input_million|output_million|operations/i.test(k)
    )
  ) {
    const slim = {};
    for (const [k, v] of Object.entries(o)) {
      if (
        /price|unit|token|free|task|path|type|name|id|repo|billing|in_|out_|cover|task_type|remark/i.test(
          k
        ) &&
        typeof v !== "object"
      ) {
        slim[k] = v;
      } else if (k === "operations" && Array.isArray(v)) {
        slim.operations = v.map((op) => ({
          name: op.name,
          type: op.type,
          path: op.path || op.api_path,
          price: op.price,
          unit_tag: op.unit_tag,
          input_million_tokens_price: op.input_million_tokens_price,
          output_million_tokens_price: op.output_million_tokens_price,
        }));
      }
    }
    if (Object.keys(slim).length) out.push(slim);
  }
  for (const v of Object.values(o)) walk(v, out);
  return out;
}

const result = {};
for (const n of names) {
  const u = "https://ai.gitee.com/serverless-api/" + encodeURIComponent(n);
  const html = await (
    await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    })
  ).text();
  const build = html.match(/"buildId":"([^"]+)"/)?.[1];
  console.log("===", n, "build", build, "len", html.length);
  let jj = null;
  if (build) {
    const ju =
      "https://ai.gitee.com/_next/data/" +
      build +
      "/serverless-api/" +
      encodeURIComponent(n) +
      ".json";
    const jr = await fetch(ju, { headers: { "User-Agent": "Mozilla/5.0" } });
    const text = await jr.text();
    console.log("json", jr.status, text.slice(0, 100));
    if (jr.ok) jj = JSON.parse(text);
  }
  if (!jj) {
    // scrape escaped JSON fragments from RSC HTML
    const priceHits = [...html.matchAll(/input_million_tokens_price\\?":([0-9.]+)/g)].map(
      (m) => m[1]
    );
    const outHits = [...html.matchAll(/output_million_tokens_price\\?":([0-9.]+)/g)].map(
      (m) => m[1]
    );
    const unitHits = [...html.matchAll(/"price\\?":([0-9.]+)/g)].map((m) => m[1]);
    const pathHits = [
      ...html.matchAll(
        /v1\\?\/(?:embeddings|rerank|chat\\?\/completions|reranker)[a-zA-Z0-9_\\\/-]*/g
      ),
    ].map((m) => m[0].replace(/\\/g, ""));
    console.log({ priceHits: priceHits.slice(0, 5), outHits: outHits.slice(0, 5), unitHits: unitHits.slice(0, 8), pathHits: [...new Set(pathHits)].slice(0, 10) });
    result[n] = { priceHits, outHits, unitHits, pathHits };
    continue;
  }
  const hits = walk(jj).slice(0, 10);
  for (const h of hits) console.log(JSON.stringify(h).slice(0, 1000));
  result[n] = hits;
}

fs.writeFileSync(
  path.join(root, "scripts/_gitee-new-models-probe.json"),
  JSON.stringify(result, null, 2)
);
console.log("wrote scripts/_gitee-new-models-probe.json");
