import fs from "fs";

const n = "WeMM-Embedding-9B";
const html = await (
  await fetch("https://ai.gitee.com/serverless-api/" + n, {
    headers: { "User-Agent": "Mozilla/5.0" },
  })
).text();
fs.writeFileSync("_tmp_wemm_full.html", html);

// find script srcs
const scripts = [...html.matchAll(/src="(https:\/\/[^"]+_next\/static\/[^"]+\.js)"/g)].map(
  (m) => m[1]
);
console.log("scripts", scripts.length);
const apiHints = new Set();
for (const src of scripts.slice(0, 40)) {
  try {
    const js = await (await fetch(src)).text();
    for (const m of js.matchAll(/\/api\/[a-zA-Z0-9_\/\-?=&%.]+/g)) {
      if (/serverless|model|price|operation|square|repo/i.test(m[0])) apiHints.add(m[0]);
    }
  } catch {}
}
console.log([...apiHints].slice(0, 80).join("\n"));

// extract any numeric price-looking from html near 元
const idxs = [];
let i = 0;
while ((i = html.indexOf("元", i)) >= 0 && idxs.length < 20) {
  idxs.push(i);
  i++;
}
for (const x of idxs) {
  console.log("YUAN", html.slice(x - 80, x + 40).replace(/\s+/g, " "));
}
