import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { normalizeImageRequest } from '../services/apimart-passthrough/image-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const quick = read('static/brand/keyo-docs.html');
const viewer = read('static/brand/keyo-api-ref.html');
const decode = text => text.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
const i18n = vm.runInNewContext(quick.slice(quick.indexOf('const I18N = '), quick.indexOf('const LANG_LABELS = ')) + '\nI18N;');
const bodies = text => [...text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map(match => match[1]);

test('all seven languages produce valid copied JSON and distinct task URLs', () => {
  const source = quick.slice(quick.indexOf('function renderSamples('), quick.indexOf('function applyLang('));
  for (const [language, dictionary] of Object.entries(i18n)) {
    const nodes = new Map();
    const context = vm.createContext({ document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } } });
    vm.runInContext(source + '\nthis.renderSamples = renderSamples;', context);
    context.renderSamples(dictionary);
    for (const id of ['curl-chat', 'curl-image', 'curl-video', 'curl-messages']) {
      const sample = nodes.get(id).textContent;
      assert.ok(!sample.includes('\\n'), `${language} ${id} has literal newline escapes`);
      const json = sample.match(/-d '([\s\S]+)'$/)?.[1].replaceAll("'\\''", "'");
      assert.ok(json, `${language} ${id} missing request body`);
      const body = JSON.parse(json);
      assert.ok(body.model);
      if (id === 'curl-image') assert.equal(normalizeImageRequest(body.model, body).replyType, 'async');
    }
    assert.match(nodes.get('curl-video-task').textContent, /\/v1\/tasks\/TASK_ID/);
    assert.match(nodes.get('curl-video-tool-task').textContent, /\/v1\/task\/TASK_ID/);
    assert.match(nodes.get('curl-image-task').textContent, /\/v1\/images\/tasks\/img_TASK_ID/);
    assert.ok(nodes.get('py-sdk').textContent.includes('\nclient = OpenAI('));
    assert.ok(dictionary.clientSetupBody.includes('https://www.keyoapi.xyz/v1'));
    assert.ok(dictionary.clientSetupBody.includes('Chat Completions'));
  }
});

test('Nano examples pass the actual pure request validator', () => {
  const models = JSON.parse(read('config/seo/model-pages.json')).models;
  for (const id of ['nano-banana-2', 'nano-banana-2.1', 'nano-banana-pro']) {
    const model = models.find(model => model.id === id);
    const curl = model.curlExample;
    assert.ok(curl, `Missing curlExample for ${id}`);
    const body = JSON.parse(curl.match(/-d '([\s\S]+)'/)[1]);
    assert.equal(body.model, id);
    assert.equal(body.size, undefined);
    assert.equal(normalizeImageRequest(id, body).replyType, 'async');
    assert.match(JSON.stringify(model), /\/v1\/images\/tasks\/\{task_id\}/);
  }
});

test('handbook JSON is valid and every capability anchor exists in both editions', () => {
  const renderer = viewer.slice(viewer.indexOf('function escapeHtml('), viewer.indexOf('async function loadHandbook('));
  const render = vm.runInNewContext(renderer + '\nrenderMarkdown;');
  const anchors = [...quick.matchAll(/class="cap-card" href="\/brand\/keyo-api-ref\.html#(section-[^"]+)"/g)].map(match => match[1]);
  assert.equal(anchors.length, 10);
  for (const file of ['static/brand/keyo-api-ref.md', 'static/brand/keyo-api-ref.en.md']) {
    const markdown = read(file);
    for (const json of bodies(markdown)) JSON.parse(json);
    const rendered = render(markdown);
    for (const id of anchors) assert.ok(rendered.includes(`id="${id}"`), `Missing ${id} in ${file}`);
    assert.match(markdown, /cond_video/);
    assert.match(markdown, /cond_audio/);
    assert.match(markdown, /15/);
    assert.match(markdown, /ZCode/);
    assert.match(markdown, /submission|未知|不明确/i);
  }
  const prefill = decode(viewer.match(/<!--NOSCRIPT-PREFILL--><noscript><pre>([\s\S]*?)<\/pre><\/noscript>/)[1]);
  assert.equal(prefill.replaceAll('\r\n', '\n'), read('static/brand/keyo-api-ref.md').replaceAll('\r\n', '\n'));
});

test('public page inline scripts parse and payment copy avoids unsupported promises', () => {
  for (const name of ['keyo-docs', 'keyo-api-ref', 'faq', 'status']) {
    const html = read(`static/brand/${name}.html`);
    for (const [, attributes, source] of html.matchAll(/<script(\s[^>]*|)>([\s\S]*?)<\/script>/g)) {
      if (!source.trim()) continue;
      if (/type=["']application\/ld\+json["']/i.test(attributes)) JSON.parse(source);
      else new vm.Script(source);
    }
  }
  for (const name of ['keyo-docs', 'faq', 'terms', 'privacy']) assert.doesNotMatch(read(`static/brand/${name}.html`), /Waffo|Credits are available immediately|额度即时到账/);
  assert.ok(!read('static/brand/status.html').includes('All systems operational'));
});

test('status endpoint reports only observed reachability and handles a failed envelope', async () => {
  const source = read('static/brand/status.html').match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const success of [true, false]) {
    const elements = new Map();
    const element = () => ({ children: [], append(...children) { this.children.push(...children); }, replaceChildren() { this.children=[]; } });
    const document = { createElement: element, getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } };
    const fetch = async url => { assert.equal(url, '/api/status'); return { ok: true, json: async () => ({ success, data: { system_name: '<b>untrusted</b>' } }) }; };
    await vm.runInNewContext(source, { document, fetch, AbortController, setTimeout: () => 1, clearTimeout: () => {}, Date });
    assert.equal(elements.get('headline').textContent, success ? 'Public status endpoint reachable' : 'Unable to reach API status');
    if (success) assert.ok(elements.get('meta').children.some(row => row.children[1].textContent === 'Not tested'));
  }
});

function avatarExample() {
  const html = read('static/brand/blog/article/c896hb32/index.html');
  const block = [...html.matchAll(/<pre><code class="language-js">([\s\S]*?)<\/code><\/pre>/g)].map(match=>decode(match[1])).find(text=>text.includes('async function renderAvatar('));
  assert.ok(block);
  return vm.runInNewContext(block + '\nrenderAvatar;', { setTimeout: resolve=>{ resolve(); return 1; }, Math, Error });
}

test('avatar blog submits once on ambiguous failure and preserves actionable client errors', async () => {
  const renderAvatar = avatarExample();
  for (const status of [502, 401]) {
    let submissions = 0;
    const cause = new Error('fixture'); cause.status = status;
    const provider = { uploadAsset: async () => ({ id:'asset' }), createJob: async () => { submissions++; throw cause; } };
    await assert.rejects(renderAvatar({ provider, sourceImage:'image', speechAudio:'audio', script:'script' }), error => status === 401 ? error === cause : error.code === 'submission_unknown' && error.retryable === false);
    assert.equal(submissions, 1);
  }
});

test('avatar polling timeout retains its task ID for recovery', async () => {
  const renderAvatar = avatarExample();
  const provider = { uploadAsset: async () => ({ id:'asset' }), createJob: async () => ({ id:'saved-id' }), getJob: async () => ({ status:'processing' }) };
  await assert.rejects(renderAvatar({ provider, maxPolls:1, pollIntervalMs:0 }), error => error.jobId === 'saved-id' && error.retryable === false);
});

test('live blog corrections keep contracts and retry boundaries explicit', () => {
  const infinite = read('static/brand/blog/article/exq994v0/index.html');
  assert.match(infinite, /-F cond_video=@/);
  assert.match(infinite, /-F cond_audio=@/);
  assert.match(infinite, /\/v1\/task\/TASK_ID/);
  for (const id of ['zxeywzwx', 'opus55-vs-fable51', 'haiku55-vs-luna6']) {
    const html = read(`static/brand/blog/article/${id}/index.html`);
    assert.doesNotMatch(html, /[Ff]ixed \$0 (?:catalog )?IDs?/);
    assert.match(html, /gift.credit/i);
  }
  const retry = read('static/brand/blog/article/ooy10bjn/index.html');
  assert.doesNotMatch(retry, /min\(provider_retry_delay, maximum_delay\)/);
  assert.match(retry, /Retry-After/);
  assert.match(retry, /deadline/i);
});

test('gift-credit guides do not equate gift billing with a zero rate', () => {
  for (const file of ['static/seo/model/deepseek-v4-flash.html', 'static/seo/model/claude-haiku-5-5.html', 'static/seo/free-models.html']) {
    const html = read(file);
    assert.doesNotMatch(html, /fixed\s+\$0|\$0 free catalog|\$0\s*\/\s*call/i);
    assert.match(html, /gift.credit/i);
    assert.match(html, /recharge balance/i);
  }
  for (const model of JSON.parse(read('config/seo/free-models-extra.json')).models) {
    assert.doesNotMatch(model.rateLabel || '', /^\$0\s*\/\s*call/);
  }
});
