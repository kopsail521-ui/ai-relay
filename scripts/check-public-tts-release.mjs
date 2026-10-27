/** GET-only release verification. Never authenticates or submits model jobs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const base = 'https://www.keyoapi.xyz';
const files = [
  ['static/brand/keyo-api-ref.html', '/brand/keyo-api-ref.html'],
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
const contracts = JSON.parse(fs.readFileSync(new URL('../services/creem-moderation-proxy/model-contracts.json', import.meta.url), 'utf8'));
const requiredModels = ['GLM-TTS', 'Step-Audio-TTS-3B', 'IndexTTS-2', 'eleven-v4', 'eleven-v4-turbo', 'Qwen3-TTS', 'CosyVoice3', 'Spark-TTS-0.5B', 'gemini-3.8-flash-tts'];

async function get(path) {
  return fetch(base + path, {
    method: 'GET',
    headers: { 'cache-control': 'no-cache', 'user-agent': 'Keyo-TTS-Release-Acceptance' },
    signal: AbortSignal.timeout(20_000),
  });
}

async function checkFile([file, path]) {
  const local = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const response = await get(path);
  assert.equal(response.status, 200, `${path}: public page unavailable`);
  const published = await response.text();
  const sha256 = hash(local);
  assert.equal(hash(published), sha256, `${path}: public document differs from reviewed release`);
  return { path, sha256 };
}

async function checkPricing() {
  const response = await get('/api/pricing');
  assert.equal(response.status, 200, '/api/pricing: public catalog unavailable');
  const pricing = await response.json();
  assert.ok(Array.isArray(pricing.data), '/api/pricing: missing model catalog');
  const models = new Map(pricing.data.map(model => [model.model_name || model.model, model]));
  for (const id of requiredModels) assert.ok(models.has(id), `/api/pricing: required TTS model missing: ${id}`);
  const checked = [];
  // Pending models need not be listed, but a listed pending model must not
  // advertise an invented callable endpoint. Check an optional gift twin too.
  for (const id of [...requiredModels, 'Spark-TTS-0.5B:free', 'keyo-tts', 'gemini-3.1-flash-tts-preview']) {
    if (!models.has(id)) continue;
    const model = models.get(id);
    const contract = contracts[id];
    assert.ok(contract, `${id}: missing reviewed local contract`);
    const requests = contract.requests || [];
    assert.equal(model.capability, contract.kind, `${id}: incorrect capability`);
    assert.equal(model.contract_status, requests.length ? 'documented' : 'pending', `${id}: incorrect contract status`);
    const expectedTypes = [...new Set(requests.map(request => `${contract.kind}:${request.path}`))].sort();
    assert.deepEqual([...(model.supported_endpoint_types || [])].sort(), expectedTypes, `${id}: incorrect endpoint set`);
    for (const request of requests) {
      const endpoint = pricing.supported_endpoint?.[`${contract.kind}:${request.path}`];
      assert.equal(endpoint?.path, request.path, `${id}: incorrect creation path`);
      assert.equal(endpoint?.method, 'POST', `${id}: incorrect documented method`);
      assert.equal(endpoint?.poll_path, request.pollPath, `${id}: incorrect polling path`);
      assert.equal(endpoint?.content_type, request.files ? 'multipart/form-data' : 'application/json', `${id}: incorrect documented content type`);
    }
    checked.push({ id, contract_status: model.contract_status, endpoint_types: expectedTypes });
  }
  return { path: '/api/pricing', models: checked, scope: 'presence, capability, status and endpoint metadata; generation and frontend copy bodies are not exercised' };
}

const jobs = [...files.map(file => ({ path: file[1], run: () => checkFile(file) })), { path:'/api/pricing', run:checkPricing }];
// Keep the acceptance pass small while the host is recovering. These are
// static/public GETs only; no model submission or authentication is performed.
const results = new Array(jobs.length);
let cursor = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (cursor < jobs.length) {
    const index = cursor++;
    try { results[index] = { status:'fulfilled', value:await jobs[index].run() }; }
    catch (reason) { results[index] = { status:'rejected', reason }; }
  }
}));
const checks = [];
const failures = [];
for (const [index, result] of results.entries()) {
  if (result.status === 'fulfilled') checks.push(result.value);
  else failures.push({ path: jobs[index].path, error: result.reason.message });
}
console.log(JSON.stringify({
  result: failures.length ? 'PUBLIC_TTS_RELEASE_FAILED' : 'PUBLIC_TTS_RELEASE_OK',
  modelCalls: 0,
  checks,
  failures,
}, null, 2));
if (failures.length) process.exitCode = 1;
