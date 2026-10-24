/** Public GET-only acceptance. Never submits credentials, jobs, or model requests. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = 'https://www.keyoapi.xyz';
const contracts = JSON.parse(fs.readFileSync(new URL('../services/creem-moderation-proxy/model-contracts.json', import.meta.url)));
const checks = [];

async function get(path) {
  assert.ok(['/api/pricing', '/pricing', '/sign-in', '/sign-up'].includes(path));
  const response = await fetch(base + path, {
    headers: { 'cache-control': 'no-cache', 'user-agent': 'Keyo-Public-Release-Acceptance' },
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, `Public GET failed: ${path}`);
  return response.text();
}

async function verify() {
  const pricing = JSON.parse(await get('/api/pricing'));
  assert.equal(pricing.supported_endpoint?.openai?.path, '/v1/chat/completions', 'Wrong shared Chat Completions endpoint');
  assert.equal(pricing.supported_endpoint?.['openai-response']?.path, '/v1/responses', 'Wrong Responses endpoint');
  assert.equal(pricing.supported_endpoint?.gemini?.path, '/v1beta/models/{model}:generateContent', 'Wrong Gemini endpoint');
  assert.ok(Array.isArray(pricing.data) && pricing.data.length > 0, 'Empty model catalog');
  for (const model of pricing.data) {
    const contract = contracts[model.model_name];
    assert.ok(contract, `Missing catalog contract: ${model.model_name}`);
    assert.equal(model.capability, contract.kind, `Incorrect capability: ${model.model_name}`);
    assert.ok(['documented', 'pending'].includes(model.contract_status), `Missing contract status: ${model.model_name}`);
    if (contract.kind !== 'unknown') assert.ok(model.billing_unit, `Missing billing unit: ${model.model_name}`);
    for (const type of model.supported_endpoint_types || []) {
      assert.ok(pricing.supported_endpoint[type]?.path, `Undefined endpoint: ${type}`);
    }
    if (contract.kind !== 'chat') {
      assert.ok(!model.supported_endpoint_types.includes('openai'), `Dedicated model uses chat endpoint: ${model.model_name}`);
      for (const request of contract.requests || []) {
        const endpoint = pricing.supported_endpoint[`${contract.kind}:${request.path}`];
        assert.equal(endpoint?.path, request.path, `Incorrect creation path: ${model.model_name}`);
        assert.equal(endpoint?.poll_path, request.pollPath, `Incorrect polling path: ${model.model_name}`);
        assert.equal(endpoint?.content_type, request.files ? 'multipart/form-data' : 'application/json', `Incorrect request format: ${model.model_name}`);
      }
    }
  }
  checks.push({ path: '/api/pricing', models: pricing.data.length });
  for (const path of ['/sign-in', '/sign-up']) {
    const body = await get(path);
    assert.ok(!/keyo-oauth-enable|keyo-model-icons-v\d+/.test(body), `Old marketing/auth injection: ${path}`);
    assert.ok(/<script[^>]+src=["'][^"']+\.js/.test(body), `Missing application script: ${path}`);
    checks.push({ path, status: 'pass' });
  }
  assert.ok((await get('/pricing')).includes('keyo-model-icons-v6'), 'Old pricing injection is serving public traffic');
  checks.push({ path: '/pricing', status: 'pass' });
}

let failure;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  checks.length = 0;
  try {
    await verify();
    console.log(JSON.stringify({ result: 'PUBLIC_PROXY_RELEASE_OK', checks, modelCalls: 0 }, null, 2));
    process.exit(0);
  } catch (error) {
    failure = error;
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1_000));
  }
}
console.error(`PUBLIC_PROXY_RELEASE_FAILED: ${failure.message}`);
process.exitCode = 1;
