/**
 * Validate canonical public docs, and optionally synchronize legacy mirrors.
 * static/brand/keyo-docs.html is the maintained source. The old independent
 * template predated task contracts and could overwrite newer documentation.
 *
 * node scripts/build-keyo-docs-i18n.mjs                  # validate only
 * node scripts/build-keyo-docs-i18n.mjs --sync-mirrors
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
assert.ok(args.every(arg => arg === '--sync-mirrors'), 'Unknown argument');
const html = fs.readFileSync(path.join(root, 'static/brand/keyo-docs.html'), 'utf8');
const dictionary = html.match(/const I18N = (\{[\s\S]*?\n\});/);
assert.ok(dictionary, 'Missing I18N dictionary');
const dictionaryStart = html.indexOf('const I18N = ');
const dictionaryEnd = html.indexOf('const LANG_LABELS = ', dictionaryStart);
assert.ok(dictionaryEnd > dictionaryStart, 'Missing dictionary boundary');
// This bounded source contains only the dictionary and its localized overrides.
const i18n = vm.runInNewContext(html.slice(dictionaryStart, dictionaryEnd) + '\nI18N;', Object.create(null), { timeout: 1000 });
const keys = [...html.matchAll(/data-(?:i18n(?:-html)?|copy-i18n)="([^"]+)"/g)].map(match => match[1]);
for (const lang of ['en', 'zhCN', 'zhTW', 'ja', 'fr', 'ru', 'vi']) {
  assert.ok(i18n[lang], `Missing language ${lang}`);
  for (const key of keys) assert.equal(typeof i18n[lang][key], 'string', `Missing ${lang}.${key}`);
}
for (const [, source] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (source.trim()) new vm.Script(source);
}
console.log(`Validated canonical docs: ${Object.keys(i18n).length} languages, ${new Set(keys).size} translation keys`);

if (args.includes('--sync-mirrors')) {
  for (const file of ['docs/keyoapi-接入文档.html', 'new-api/web/public/keyoapi-docs.html']) {
    fs.writeFileSync(path.join(root, file), html);
    console.log(`Synced ${file}`);
  }
}
