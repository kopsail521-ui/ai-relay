import fs from "fs";

const html = await (await fetch("https://www.keyoapi.xyz/pricing")).text();
fs.writeFileSync("tmp-pricing.html", html);
const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
console.log(scripts.slice(0, 30));

// also try console pricing path
const html2 = await (await fetch("https://www.keyoapi.xyz/console/models")).text().catch(() => "");
const scripts2 = [...(html2 || "").matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
console.log("console", scripts2.slice(0, 10));
