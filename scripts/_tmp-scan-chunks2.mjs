const chunks = [
  "1424.d96a4e2e4c.js",
  "7378.68cad42651.js",
  "2574.8f591ab0d7.js",
  "7124.22b2aef38b.js",
  "9243.b5c19ac00c.js",
  "4645.dd9dcb4fb0.js",
  "9645.2b50f48850.js",
];
const base = "https://www.keyoapi.xyz/static/js/";
for (const c of chunks) {
  const r = await fetch(base + c);
  const t = await r.text();
  console.log("\n====", c, r.status, t.length);
  if (!r.ok) continue;
  for (const needle of [
    "price-low",
    "sort",
    "localeCompare",
    "model_name",
    "NAME",
    "filteredModels",
  ]) {
    if (t.includes(needle)) {
      let idx = t.indexOf(needle);
      let n = 0;
      while (idx >= 0 && n < 2) {
        if (/sort|price-low|localeCompare|model_name/.test(t.slice(Math.max(0, idx - 40), idx + 80))) {
          console.log(needle, JSON.stringify(t.slice(Math.max(0, idx - 100), idx + 160)));
          n++;
        }
        idx = t.indexOf(needle, idx + needle.length);
      }
    }
  }
}
