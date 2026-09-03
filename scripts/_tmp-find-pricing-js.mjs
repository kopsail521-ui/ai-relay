const res = await fetch("https://www.keyoapi.xyz/");
const html = await res.text();
const assets = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
console.log("js count", assets.length);
console.log(assets.slice(0, 40).join("\n"));

// also try /pricing
const res2 = await fetch("https://www.keyoapi.xyz/pricing");
const html2 = await res2.text();
console.log("\n/pricing status", res2.status, "len", html2.length);
console.log("pricing title snippet", html2.slice(0, 200).replace(/\s+/g, " "));
const assets2 = [...html2.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
console.log("pricing js", assets2.slice(0, 20).join("\n"));
