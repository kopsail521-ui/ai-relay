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

function pickPrices(obj, out = []) {
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    for (const x of obj) pickPrices(x, out);
    return out;
  }
  const keys = Object.keys(obj);
  const interesting = keys.filter((k) =>
    /price|unit_tag|token|free|task|path|type|billing|operation/i.test(k)
  );
  if (interesting.length && (obj.repo_name || obj.name || obj.model_name || obj.id)) {
    out.push(obj);
  }
  for (const v of Object.values(obj)) pickPrices(v, out);
  return out;
}

for (const n of names) {
  const u = "https://ai.gitee.com/serverless-api/" + encodeURIComponent(n);
  const html = await (
    await fetch(u, {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
    })
  ).text();
  const build = html.match(/"buildId":"([^"]+)"/)?.[1];
  console.log("\n===", n, "build", build);
  if (!build) continue;
  const ju =
    "https://ai.gitee.com/_next/data/" +
    build +
    "/serverless-api/" +
    encodeURIComponent(n) +
    ".json";
  const jr = await fetch(ju, { headers: { "User-Agent": "Mozilla/5.0" } });
  const text = await jr.text();
  console.log("nextjson", jr.status, text.slice(0, 200));
  if (!jr.ok) continue;
  const jj = JSON.parse(text);
  const hits = pickPrices(jj).slice(0, 5);
  for (const h of hits) {
    const slim = {};
    for (const [k, v] of Object.entries(h)) {
      if (
        /price|unit|token|free|task|path|type|name|id|repo|operation|billing|in_|out_/i.test(
          k
        )
      ) {
        slim[k] = v;
      }
    }
    console.log(JSON.stringify(slim).slice(0, 1000));
  }
  // also dump all price numbers near model name
  const s = JSON.stringify(jj);
  const idx = s.indexOf(n);
  if (idx >= 0) console.log("context", s.slice(Math.max(0, idx - 200), idx + 800));
}

fs.writeFileSync("scripts/_gitee-price-probe-done.txt", "ok");
