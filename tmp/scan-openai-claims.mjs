import fs from 'node:fs';
import path from 'node:path';

const pages = [];
function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { scan(full); continue; }
    if (e.name.endsWith('.html')) pages.push(full);
  }
}
scan('static/seo');

const pat = /(OpenAI[- ]compatible|OpenAI 兼容|OpenAI-compatible|chat\/completions|OpenAI SDK|OpenAI 客户端|OpenAI (Python|Node|官方) (SDK|客户端)?)/gi;
for (const f of pages) {
  const h = fs.readFileSync(f, 'utf8');
  const text = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const hits = text.match(pat) || [];
  if (!hits.length) continue;
  console.log(f.split(path.sep).join('/').replace('static/seo/', '') + '  [' + hits.length + ']');
  const re = new RegExp('.{50}(?:OpenAI[- ]compatible|OpenAI 兼容|chat\\/completions|OpenAI SDK|OpenAI 客户端).{90}', 'gi');
  let m, n = 0;
  while ((m = re.exec(text)) !== null && n < 2) { console.log('    ' + m[0].trim().slice(0, 160)); n++; }
}