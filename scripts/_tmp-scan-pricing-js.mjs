const urls = ["https://www.keyoapi.xyz/pricing", "https://www.keyoapi.xyz/", "https://www.keyoapi.xyz/console/pricing"];
for (const u of urls) {
  try {
    const r = await fetch(u);
    const html = await r.text();
    console.log("\n==", u, r.status, html.length);
    const srcs = [...html.matchAll(/src=["']([^"']+)["']/g)].map((m) => m[1]);
    console.log("srcs", srcs.slice(0, 40));
  } catch (e) {
    console.log(u, e.message);
  }
}
