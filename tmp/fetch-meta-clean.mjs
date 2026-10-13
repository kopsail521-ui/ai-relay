import fs from 'node:fs';

const SLUGS = ['ncx234u2', 'lfmh7jgs', 'pb2y5qxm', 'c896hb32', 'exq994v0'];
const BASE = 'https://www.keyoapi.xyz/brand/blog/article';

const out = {};
for (const slug of SLUGS) {
  try {
    const res = await fetch(`${BASE}/${slug}/`);
    const html = await res.text();
    const title =
      (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim() ||
      (html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i)?.[1] || '').trim();
    const desc =
      (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] ||
        html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i)?.[1] ||
        '').trim();
    out[slug] = { ok: Boolean(title && desc), title, desc };
    console.log(slug, out[slug].ok ? 'OK' : 'MISSING', '| title:', title.slice(0, 70), '| desc:', desc.slice(0, 70));
  } catch (err) {
    out[slug] = { ok: false, error: err.message };
    console.log(slug, 'FETCH ERROR:', err.message);
  }
}
fs.writeFileSync('tmp/live-meta-clean.json', JSON.stringify(out, null, 2));
const bad = Object.entries(out).filter(([, v]) => !v.ok);
console.log(bad.length ? `FAILED: ${bad.map(([k]) => k).join(', ')}` : 'all 5 ok');
