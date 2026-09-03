const html = await (await fetch("https://www.keyoapi.xyz/pricing")).text();
const indexJs = await (
  await fetch("https://www.keyoapi.xyz/static/js/index.ddeeeaa75e.js")
).text();

// Find chunk filename mapping for ids used by pricing route
const ids = [8984, 9110, 9086, 1727, 9645, 4645, 9243, 7124, 1402, 2574, 7378, 1424, 88371];
for (const id of ids) {
  const re = new RegExp(String(id) + '[^\\n]{0,80}?\\.js');
  // webpack style: {1424:"hash"
  const re2 = new RegExp(String(id) + ':"([a-f0-9]+)"');
  const m2 = indexJs.match(re2);
  if (m2) console.log("map", id, m2[1]);
}

// Also search pattern like 1424:"xxxx"
let idx = indexJs.indexOf('1424:"');
console.log("1424 sample", indexJs.slice(idx, idx + 40));
idx = indexJs.indexOf("1424:");
console.log("1424 colon", indexJs.slice(idx, idx + 50));

// Find mini-css / chunk map start
const mapIdx = indexJs.indexOf("{141:");
console.log("map141", mapIdx);
// try find "1424:"
const all = [...indexJs.matchAll(/(\d{3,5}):"([a-f0-9]{8,16})"/g)].slice(0, 5);
console.log("sample maps", all.map((m) => m[0]));
const hit = [...indexJs.matchAll(/1424:"([a-f0-9]+)"/g)];
console.log("1424 hits", hit.map((h) => h[1]));
const hit2 = [...indexJs.matchAll(/7378:"([a-f0-9]+)"/g)];
console.log("7378 hits", hit2.map((h) => h[1]));
