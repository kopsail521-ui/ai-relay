import fs from 'node:fs';

// Build blog-inbox fragments for the 5 clean articles from their fixed
// bodies (tmp/geo-bodies-clean) + live metadata.
//
// Metadata source, tried in order:
//   1. tmp/clean-meta.json  -> { slug: { title, desc } }
//   2. tmp/clean-meta.tsv   -> lines of: slug \t title \t desc
//      (direct output of the VPS catalog dump one-liner)

const SLUGS = ['ncx234u2', 'lfmh7jgs', 'pb2y5qxm', 'c896hb32', 'exq994v0'];

let meta = null;
if (fs.existsSync('tmp/clean-meta.json')) {
  meta = JSON.parse(fs.readFileSync('tmp/clean-meta.json', 'utf8'));
} else if (fs.existsSync('tmp/clean-meta.tsv')) {
  meta = {};
  for (const line of fs.readFileSync('tmp/clean-meta.tsv', 'utf8').split('\n')) {
    const parts = line.split('\t').map((s) => s.trim());
    if (parts.length >= 3 && SLUGS.includes(parts[0])) {
      meta[parts[0]] = { title: parts[1], desc: parts[2] };
    }
  }
}
if (!meta) {
  console.error('No metadata source: create tmp/clean-meta.tsv (slug\\ttitle\\tdesc) or tmp/clean-meta.json');
  process.exit(1);
}

const missing = SLUGS.filter((s) => !meta[s] || !meta[s].title || !meta[s].desc);
if (missing.length) {
  console.error('Missing metadata for:', missing.join(', '));
  process.exit(1);
}

for (const slug of SLUGS) {
  const body = fs.readFileSync(`tmp/geo-bodies-clean/${slug}.html`, 'utf8').replace(/^\n+/, '');
  const { title, desc } = meta[slug];
  const out = `<!-- TITLE: ${title} -->\n<!-- EXCERPT: ${desc} -->\n<!-- DESC: ${desc} -->\n${body}`;
  fs.writeFileSync(`blog-inbox/${slug}.html`, out);
  console.log(slug, '->', `blog-inbox/${slug}.html`, `(${body.length} bytes body)`);
}
console.log('done: 5 fragments generated');
