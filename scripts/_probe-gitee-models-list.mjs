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

const found = {};
for (let page = 1; page <= 30; page++) {
  const u = `https://ai.gitee.com/api/models?page=${page}&page_size=100`;
  const j = await (await fetch(u, { headers })).json();
  const arr = j.data || [];
  if (!arr.length) break;
  for (const m of arr) {
    const path = `${m.namespace}/${m.path || m.name || m.repo_name || ""}`;
    const name = m.path || m.name || m.repo_name || "";
    if (want.includes(name) || want.some((w) => path.endsWith("/" + w))) {
      found[name] = m;
      console.log("HIT", name, m.id, path, m.namespace);
    }
  }
  process.stdout.write("page " + page + " +" + arr.length + "\r");
}
console.log("\nfound", Object.keys(found));

for (const [name, m] of Object.entries(found)) {
  const urls = [
    `https://ai.gitee.com/api/models/${m.namespace}/${name}`,
    `https://ai.gitee.com/api/models/${m.namespace}/${name}/serverless`,
    `https://ai.gitee.com/api/models/${m.namespace}/${name}/operations`,
    `https://ai.gitee.com/api/models/${m.namespace}/${name}/inference`,
    `https://ai.gitee.com/api/v1/serverless/${m.namespace}/${name}`,
  ];
  for (const u of urls) {
    const r = await fetch(u, { headers });
    const t = await r.text();
    if (r.status === 404) continue;
    console.log(name, u, r.status, t.slice(0, 500).replace(/\s+/g, " "));
  }
}

// also try serverless list endpoints found historically
for (const u of [
  "https://ai.gitee.com/api/v1/serverless_apis",
  "https://ai.gitee.com/api/serverless_apis",
  "https://ai.gitee.com/api/models/serverless",
  "https://ai.gitee.com/api/serverless/apis",
]) {
  const r = await fetch(u, { headers });
  console.log("SL", u, r.status, (await r.text()).slice(0, 200));
}
