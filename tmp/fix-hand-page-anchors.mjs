import fs from 'node:fs';

// Fix hand-maintained / orphan pages not covered by gen-seo-pages.mjs:
// 4 orphan model pages (removed from config, kept + hand-edited) and
// 3 hand-written tutorial pages under static/brand/blog/.

const fixes = [];

for (const id of ['gemini-3.1-flash-tts-preview', 'gemini-3.8-flash-tts', 'gemini-embedding-2-preview', 'suno_music_open']) {
  fixes.push({
    file: `static/seo/model/${id}.html`,
    pairs: [
      [
        `confirm live on <a href="/pricing/${id}">/pricing/${id}</a>`,
        `confirm live on <a href="/pricing/${id}">the ${id} Model Square page</a>`,
      ],
      [
        `Try/buy: <a href="/pricing/${id}">/pricing/${id}</a> · Catalog: <a href="/pricing">/pricing</a>.`,
        `Try/buy: <a href="/pricing/${id}">the ${id} Model Square page</a> · Catalog: <a href="/pricing">the pricing page</a>.`,
      ],
    ],
  });
}

const tutorialNew = `Use exact catalog IDs from <a href="/pricing-list">the full pricing list</a> or the interactive <a href="/pricing">pricing page</a>. Free $0 IDs (covered by your $10 welcome credit, fair-use) are on <a href="/free-models">the free models page</a>.`;
const tutorialFixes = [
  {
    file: 'static/brand/blog/openai-compatible-api-python.html',
    pairs: [
      [
        `Use exact catalog IDs from the static list <a href="/pricing-list">/pricing-list</a> or interactive <a href="/pricing">/pricing</a>. Free $0 IDs (covered by your $10 welcome credit, fair-use) are on <a href="/free-models">/free-models</a>.`,
        tutorialNew,
      ],
    ],
  },
  {
    file: 'static/brand/blog/openai-compatible-api-nodejs.html',
    pairs: [
      [
        `Copy IDs from <a href="/pricing-list">/pricing-list</a> or <a href="/pricing">/pricing</a>. $0 IDs covered by your $10 welcome credit: <a href="/free-models">/free-models</a>.`,
        `Copy IDs from <a href="/pricing-list">the full pricing list</a> or the <a href="/pricing">pricing page</a>. $0 IDs covered by your $10 welcome credit: <a href="/free-models">the free models page</a>.`,
      ],
    ],
  },
  {
    file: 'static/brand/blog/openai-compatible-api-cursor.html',
    pairs: [
      [
        `Confirm IDs on <a href="/pricing-list">/pricing-list</a> or <a href="/pricing">/pricing</a>.`,
        `Confirm IDs on <a href="/pricing-list">the full pricing list</a> or the <a href="/pricing">pricing page</a>.`,
      ],
      [
        `start with a $0 ID from <a href="/free-models">/free-models</a> — covered`,
        `start with a $0 ID from <a href="/free-models">the free models page</a> — covered`,
      ],
    ],
  },
];
fixes.push(...tutorialFixes);

let total = 0;
let skipped = 0;
for (const { file, pairs } of fixes) {
  if (!fs.existsSync(file)) {
    console.error('MISSING FILE:', file);
    process.exit(1);
  }
  let html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const [find, replace] of pairs) {
    if (!html.includes(find)) {
      if (html.includes(replace)) { skipped++; continue; } // already fixed
      console.error('NOT FOUND in', file, '->', find.slice(0, 70));
      process.exit(1);
    }
    html = html.split(find).join(replace);
    total++;
  }
  fs.writeFileSync(file, html);
}
console.log('hand-page anchor fixes applied:', total, '| skipped (already fixed):', skipped);