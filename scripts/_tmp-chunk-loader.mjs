const t = await (
  await fetch("https://www.keyoapi.xyz/static/js/index.ddeeeaa75e.js")
).text();
// find chunk loading function
const idx = t.indexOf('.js"+');
console.log(t.slice(idx - 200, idx + 200));
const idx2 = t.indexOf("static/js/");
console.log("---", t.slice(idx2 - 100, idx2 + 200));
const idx3 = t.indexOf("chunkId");
console.log("chunkId", idx3, t.slice(idx3 - 50, idx3 + 150));
// look for u.u= or __webpack_require__.u
for (const n of ["u.u=", "u.miniCss", ".u=e=>", "function(e){return", '+"."+']) {
  let i = 0,
    c = 0;
  while ((i = t.indexOf(n, i)) >= 0 && c < 3) {
    console.log(n, JSON.stringify(t.slice(i, i + 180)));
    i += n.length;
    c++;
  }
}
