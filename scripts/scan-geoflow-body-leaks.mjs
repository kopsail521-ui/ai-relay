/**
 * Scan live Keyo blog articles for GEOFlow scaffolding / self-hedge.
 * Run: node scripts/scan-geoflow-body-leaks.mjs
 */
import https from "https";

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "user-agent": "keyo-scan/1" } }, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve(b));
      })
      .on("error", reject);
  });
}

const patterns = [
  /product materials/gi,
  /provided materials/gi,
  /supplied materials/gi,
  /available materials/gi,
  /the documented /gi,
  /does not assume that KeyoAPI/gi,
  /do not establish/gi,
  /does not establish/gi,
  /unverified integration/gi,
  /drop-in Claude/gi,
  /not as a drop-in/gi,
  /candidate gateway to evaluate/gi,
  /materials indicate/gi,
  /materials describe/gi,
  /materials show/gi,
  /treat KeyoAPI as a candidate/gi,
];

const index = await get("https://www.keyoapi.xyz/brand/blog/");
const slugs = [...index.matchAll(/\/brand\/blog\/article\/([a-z0-9_-]+)\//gi)].map(
  (m) => m[1]
);
const uniq = [...new Set(slugs)];
console.log("SLUGS", uniq.length);

const rows = [];
for (const slug of uniq) {
  const html = await get(`https://www.keyoapi.xyz/brand/blog/article/${slug}/`);
  const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ""])[1]
    .replace(/<[^>]+>/g, "")
    .trim();
  const found = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    const n = (html.match(re) || []).length;
    if (n) found.push(`${re.source}=${n}`);
  }
  if (found.length) {
    rows.push({ slug, title, found: found.join("; ") });
    console.log(slug, "|", title.slice(0, 60));
    console.log(" ", found.join("; "));
  }
}
console.log("HIT_SLUGS", rows.length + "/" + uniq.length);
