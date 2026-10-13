import fs from 'node:fs';

const SLUGS = [
  '1gger7hd','1y1kuuoj','2o2w88ar','45717fli','62c44nq0','7tw9n0ql',
  '9lvxpssw','axc6qmip','cu1coapk','dxp8cdop','jnv30sj3','jnyu9un7',
  'n7allrtc','ooy10bjn','oyu8kdbq','qbfzdawk','tvdqdo7z','ur3fw22w','vv4t8krr',
];

const BASE = 'https://www.keyoapi.xyz/brand/blog/article';

const results = [];
for (const slug of SLUGS) {
  const file = `blog-inbox/${slug}.html`;
  let header = fs.readFileSync(file, 'utf8').split('\n');
  // locate TITLE line and EXCERPT line among the leading comment lines
  let title = '';
  let excerpt = '';
  let bodyStart = -1;
  for (let i = 0; i < header.length; i++) {
    const m = header[i].match(/^<!--\s*TITLE:\s*(.*?)\s*-->$/);
    if (m) { title = m[1]; continue; }
    const e = header[i].match(/^<!--\s*EXCERPT:\s*(.*?)\s*-->$/);
    if (e) { excerpt = e[1]; continue; }
    // first non-comment line starts the body
    if (!/^<!--/.test(header[i])) { bodyStart = i; break; }
  }
  if (!title || bodyStart < 0) {
    results.push({ slug, ok: false, reason: 'header malformed' });
    continue;
  }

  // fetch live meta description
  let desc = '';
  try {
    const res = await fetch(`${BASE}/${slug}/`);
    const html = await res.text();
    const m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
            || html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
    if (m) desc = m[1];
  } catch (err) {
    results.push({ slug, ok: false, reason: `fetch error: ${err.message}` });
    continue;
  }

  if (!desc) {
    results.push({ slug, ok: false, reason: 'no meta description found' });
    continue;
  }

  const body = header.slice(bodyStart).join('\n');
  const out = `<!-- TITLE: ${title} -->\n<!-- EXCERPT: ${desc} -->\n<!-- DESC: ${desc} -->\n${body}`;
  fs.writeFileSync(file, out);
  results.push({ slug, ok: true, title, desc });
}

fs.writeFileSync('tmp/live-descs.json', JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`done: ${results.length - failed.length}/${results.length} ok`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log(JSON.stringify(f));
}