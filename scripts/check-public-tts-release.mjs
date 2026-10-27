/** GET-only release verification. Never authenticates or submits model jobs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const base = 'https://www.keyoapi.xyz';
const files = [
  ['static/brand/keyo-api-ref.md', '/brand/keyo-api-ref.md'],
  ['static/brand/keyo-api-ref.en.md', '/brand/keyo-api-ref.en.md'],
  ['static/brand/keyo-docs.html', '/brand/keyo-docs.html'],
  ['static/seo/tts-api.html', '/tts-api'],
  ['static/seo/voice-cloning-api.html', '/voice-cloning-api'],
  ['static/seo/openai-api-alternative.html', '/openai-api-alternative'],
  ...['Qwen3-TTS', 'CosyVoice3', 'IndexTTS-2', 'gemini-3.8-flash-tts', 'eleven-v4', 'eleven-v4-turbo']
    .map(model => [`static/seo/model/${model}.html`, `/model/${model}`]),
];
const normalize = source => source.replaceAll('\r\n', '\n');
const hash = source => createHash('sha256').update(normalize(source)).digest('hex');

async function checkFile([file, path]) {
  const local = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const response = await fetch(base + path, {
    method: 'GET',
    headers: { 'cache-control': 'no-cache', 'user-agent': 'Keyo-TTS-Release-Acceptance' },
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `${path}: public page unavailable`);
  const published = await response.text();
  const sha256 = hash(local);
  assert.equal(hash(published), sha256, `${path}: public document differs from reviewed release`);
  return { path, sha256 };
}

const results = await Promise.allSettled(files.map(checkFile));
const checks = [];
const failures = [];
for (const [index, result] of results.entries()) {
  if (result.status === 'fulfilled') checks.push(result.value);
  else failures.push({ path: files[index][1], error: result.reason.message });
}
console.log(JSON.stringify({
  result: failures.length ? 'PUBLIC_TTS_RELEASE_FAILED' : 'PUBLIC_TTS_RELEASE_OK',
  modelCalls: 0,
  checks,
  failures,
}, null, 2));
if (failures.length) process.exitCode = 1;
