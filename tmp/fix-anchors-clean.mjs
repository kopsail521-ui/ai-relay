import fs from 'node:fs';

// Replace path-style anchor texts with natural words in the 5 clean bodies.
// Each entry: { file, items: [{ find, replace }] } — find must be unique.

const replacements = {
  'tmp/geo-bodies-clean/lfmh7jgs.html': [
    {
      find: '<a href="/ai-avatar-video-generator">/ai-avatar-video-generator</a>, then confirm',
      replace: '<a href="/ai-avatar-video-generator">the AI avatar video generator hub</a>, then confirm',
    },
    {
      find: '<a href="/model/Duix-Avatar">/model/Duix-Avatar</a>',
      replace: '<a href="/model/Duix-Avatar">the Duix-Avatar model page</a>',
    },
    {
      find: '<a href="/model/InfiniteTalk">/model/InfiniteTalk</a>',
      replace: '<a href="/model/InfiniteTalk">the InfiniteTalk model page</a>',
    },
    {
      find: 'and the full <a href="/pricing-list">/pricing-list</a>',
      replace: 'and <a href="/pricing-list">the full pricing list</a>',
    },
  ],

  'tmp/geo-bodies-clean/pb2y5qxm.html': [
    {
      find: '<a href="/pricing/RMBG-2.0">/pricing/RMBG-2.0</a>',
      replace: '<a href="/pricing/RMBG-2.0">the RMBG-2.0 pricing page</a>',
    },
    {
      find: '<a href="/model/RMBG-2.0">/model/RMBG-2.0</a>',
      replace: '<a href="/model/RMBG-2.0">the RMBG-2.0 model page</a>',
    },
    {
      find: '<a href="/pricing-list">/pricing-list</a>',
      replace: '<a href="/pricing-list">the full pricing list</a>',
    },
  ],

  'tmp/geo-bodies-clean/c896hb32.html': [
    {
      find: 'Start from <a href="/ai-avatar-video-generator">/ai-avatar-video-generator</a>, then confirm',
      replace: 'Start from <a href="/ai-avatar-video-generator">the AI avatar video generator API</a>, then confirm',
    },
    {
      find: '<a href="/model/Duix-Avatar">/model/Duix-Avatar</a>, <a href="/model/InfiniteTalk">',
      replace: '<a href="/model/Duix-Avatar">the Duix-Avatar model page</a>, <a href="/model/InfiniteTalk">',
    },
    {
      find: '<a href="/model/InfiniteTalk">/model/InfiniteTalk</a>, and the full',
      replace: '<a href="/model/InfiniteTalk">the InfiniteTalk model page</a>, and the full',
    },
    {
      find: 'and the full <a href="/pricing-list">/pricing-list</a>',
      replace: 'and <a href="/pricing-list">the full pricing list</a>',
    },
    {
      find: 'The official KeyoAPI documentation lives at <a href="https://www.keyoapi.xyz/brand/keyo-docs.html">keyoapi.xyz/brand/keyo-docs.html</a>',
      replace: 'The official KeyoAPI documentation lives at <a href="/brand/keyo-docs.html">the KeyoAPI documentation</a>',
    },
    {
      find: 'confirm avatar-video rates on <a href="/ai-avatar-video-generator">/ai-avatar-video-generator</a> and',
      replace: 'confirm avatar-video rates on <a href="/ai-avatar-video-generator">the avatar video generator page</a> and',
    },
    {
      find: 'and <a href="/pricing-list">/pricing-list</a> before production',
      replace: 'and <a href="/pricing-list">current pricing</a> before production',
    },
    {
      find: 'start from <a href="/ai-avatar-video-generator">/ai-avatar-video-generator</a>, pick a live avatar ID on',
      replace: 'start from <a href="/ai-avatar-video-generator">the AI avatar video generator page</a>, pick a live avatar ID on',
    },
    {
      find: 'pick a live avatar ID on <a href="/pricing-list">/pricing-list</a>, then verify',
      replace: 'pick a live avatar ID on <a href="/pricing-list">the pricing list</a>, then verify',
    },
  ],

  'tmp/geo-bodies-clean/exq994v0.html': [
    {
      find: 'and <a href="/ai-avatar-video-generator">/ai-avatar-video-generator</a> before production',
      replace: 'and <a href="/ai-avatar-video-generator">the avatar video generator page</a> before production',
    },
    {
      find: 'confirm the request contract, limits, and rates on <a href="/model/InfiniteTalk">/model/InfiniteTalk</a> and',
      replace: 'confirm the request contract, limits, and rates on <a href="/model/InfiniteTalk">the InfiniteTalk model page</a> and',
    },
    {
      find: 'start from <a href="/ai-avatar-video-generator">/ai-avatar-video-generator</a> and confirm InfiniteTalk request fields',
      replace: 'start from <a href="/ai-avatar-video-generator">the AI avatar video generator hub</a> and confirm InfiniteTalk request fields',
    },
    {
      find: 'and confirm InfiniteTalk request fields on <a href="/model/InfiniteTalk">/model/InfiniteTalk</a>. Do not infer',
      replace: 'and confirm InfiniteTalk request fields on <a href="/model/InfiniteTalk">InfiniteTalk&rsquo;s model page</a>. Do not infer',
    },
    {
      find: '<a href="/ai-avatar-video-generator">/ai-avatar-video-generator</a>, then confirm guides at',
      replace: '<a href="/ai-avatar-video-generator">the AI avatar video generator page</a>, then confirm guides at',
    },
    {
      find: ', <a href="/model/InfiniteTalk">/model/InfiniteTalk</a>, and the full',
      replace: ', <a href="/model/InfiniteTalk">the InfiniteTalk model guide</a>, and the full',
    },
    {
      find: 'confirm guides at <a href="/model/Duix-Avatar">/model/Duix-Avatar</a>',
      replace: 'confirm guides at <a href="/model/Duix-Avatar">the Duix-Avatar model page</a>',
    },
    {
      find: 'and the full <a href="/pricing-list">/pricing-list</a>',
      replace: 'and <a href="/pricing-list">the full pricing list</a>',
    },
    {
      find: 'and <a href="/pricing-list">/pricing-list</a> before writing client code',
      replace: 'and <a href="/pricing-list">the pricing list</a> before writing client code',
    },
    {
      find: 'stop and confirm availability on <a href="/model/InfiniteTalk">/model/InfiniteTalk</a> and',
      replace: 'stop and confirm availability on <a href="/model/InfiniteTalk">the live InfiniteTalk model page</a> and',
    },
    {
      find: '<p> <a href="/pricing-list">/pricing-list</a> </p>',
      replace: '<p> <a href="/pricing-list">KeyoAPI&rsquo;s pricing page</a> </p>',
    },
    {
      find: 'Confirm live fields on <a href="/model/InfiniteTalk">/model/InfiniteTalk</a> before production',
      replace: 'Confirm live fields on <a href="/model/InfiniteTalk">the model page for InfiniteTalk</a> before production',
    },
    {
      find: 'Hub: <a href="/ai-avatar-video-generator">/ai-avatar-video-generator</a> · rates:',
      replace: 'Hub: <a href="/ai-avatar-video-generator">the avatar video generator hub</a> · rates:',
    },
    {
      find: 'rates: <a href="/pricing-list">/pricing-list</a>',
      replace: 'rates: <a href="/pricing-list">current pricing</a>',
    },
  ],
};

let total = 0;
for (const [file, items] of Object.entries(replacements)) {
  if (!fs.existsSync(file)) {
    console.error('MISSING FILE:', file);
    process.exit(1);
  }
  let html = fs.readFileSync(file, 'utf8');
  for (const { find, replace } of items) {
    const idx = html.indexOf(find);
    if (idx === -1) {
      console.error('FIND NOT FOUND in', file, '->', find.slice(0, 80));
      process.exit(1);
    }
    // ensure it's unique
    const second = html.indexOf(find, idx + find.length);
    if (second !== -1) {
      console.error('FIND NOT UNIQUE in', file, '->', find.slice(0, 80));
      process.exit(1);
    }
    html = html.slice(0, idx) + replace + html.slice(idx + find.length);
    total++;
  }
  fs.writeFileSync(file, html);
}
console.log('Anchor replacements:', total);