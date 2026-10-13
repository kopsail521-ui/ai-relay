import fs from 'node:fs';
import path from 'node:path';

function scan(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { scan(full, out); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const html = fs.readFileSync(full, 'utf8');
    const re = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    const items = [];
    while ((m = re.exec(html)) !== null) {
      const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (/^\/|keyoapi\.xyz\//i.test(text)) items.push({ href: m[1], text });
    }
    if (items.length) out.push({ file: full.replace(/\\/g, '/'), items });
  }
}

const out = [];
scan('static/seo', out);
scan('static/brand/blog', out);
let total = 0;
for (const { file, items } of out) {
  total += items.length;
  console.log(file + '  -> ' + items.length);
  const seen = {};
  for (const it of items) {
    const k = it.href + ' | ' + it.text;
    seen[k] = (seen[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(seen)) console.log('    ' + n + 'x  ' + k);
}
console.log('TOTAL path-style anchors in repo pages:', total);