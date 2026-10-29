import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const decode = value => value.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
const contracts = JSON.parse(read('services/creem-moderation-proxy/model-contracts.json'));
const quick = read('static/brand/keyo-docs.html');
const dictionary = vm.runInNewContext(quick.slice(quick.indexOf('const I18N = '), quick.indexOf('const LANG_LABELS = ')) + '\nI18N;');
const speechSource = read('services/gitee-passthrough/server.mjs');
// Exercise copied requests against the actual production normalizer without
// starting the server, loading credentials, opening a wallet, or using fetch.
const prepare = vm.runInNewContext(
  speechSource.slice(speechSource.indexOf('function freeTwinBase('), speechSource.indexOf('function escapeRegExp(')) + '\nprepareAsyncSpeechRequest;',
  { Buffer },
);
const speechModels = new Set(['GLM-TTS', 'Step-Audio-TTS-3B', 'IndexTTS-2', 'eleven-v4', 'eleven-v4-turbo', 'Qwen3-TTS', 'CosyVoice3', 'Spark-TTS-0.5B']);

function checkBody(body, label) {
  assert.ok(speechModels.has(body.model), `${label}: unexpected speech model`);
  assert.equal(body.voice === 'alloy', false, `${label}: generic voice pasted into a model-specific contract`);
  if (body.inputs !== undefined) {
    const result = prepare(Buffer.from(JSON.stringify(body)), 'application/json');
    assert.equal(result.error, undefined, `${label}: ${result.error}`);
    assert.deepEqual(JSON.parse(result.body), body, `${label}: canonical docs need no compatibility normalization`);
  } else {
    assert.equal(typeof body.input, 'string', label);
    assert.ok(body.input.length, label);
  }
  if (body.model === 'Qwen3-TTS') {
    assert.ok(Array.isArray(body.inputs), label);
    for (const item of body.inputs) {
      assert.ok(item.prompt?.length, label);
      assert.ok(['Chinese', 'English'].includes(item.language), label);
    }
    assert.equal(body.voice, undefined, label);
  }
  if (['GLM-TTS', 'Step-Audio-TTS-3B', 'IndexTTS-2'].includes(body.model)) {
    assert.equal(body.prompt_audio_url, 'https://replace-me.invalid/your-reference.wav', label);
    assert.equal(body.voice, undefined, label);
  }
  if (['GLM-TTS', 'Step-Audio-TTS-3B', 'CosyVoice3'].includes(body.model)) assert.ok(body.prompt_text?.length, label);
  if (body.model === 'CosyVoice3') assert.equal(body.prompt_wav_url, 'https://replace-me.invalid/your-reference.wav', label);
  if (body.model === 'IndexTTS-2') assert.equal(body.use_emo_text, true, label);
  if (body.model === 'Spark-TTS-0.5B') {
    assert.ok(['male', 'female'].includes(body.gender), label);
    assert.ok(body.pitch >= 1 && body.pitch <= 5, label);
    assert.ok(body.speed >= 1 && body.speed <= 5, label);
  }
}

function curlBody(sample, label) {
  assert.match(sample, /https:\/\/www\.keyoapi\.xyz\/v1\/(?:async\/)?audio\/speech/, label);
  assert.match(sample, /Authorization: Bearer /, label);
  const json = sample.match(/-d '([\s\S]*?)'(?:\s*(?:\\|\n|$))/)?.[1];
  assert.ok(json, `${label}: missing copyable JSON`);
  const body = JSON.parse(json.replaceAll("'\\''", "'"));
  checkBody(body, label);
  return body;
}

function quickSamples(dict) {
  const nodes = new Map();
  const context = vm.createContext({ document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } } });
  vm.runInContext(quick.slice(quick.indexOf('function renderSamples('), quick.indexOf('function applyLang(')) + '\nthis.renderSamples = renderSamples;', context);
  context.renderSamples(dict);
  return nodes;
}

test('both handbooks publish complete model-specific sync and async speech bodies', () => {
  for (const file of ['static/brand/keyo-api-ref.md', 'static/brand/keyo-api-ref.en.md']) {
    const markdown = read(file);
    const section = markdown.slice(markdown.indexOf('### 7.1 '), markdown.indexOf('## 9. '));
    const bodies = [...section.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
    assert.equal(bodies.length, 8, file);
    for (const body of bodies) checkBody(body, `${file}: ${body.model}`);
    assert.equal(bodies.filter(body => body.model === 'IndexTTS-2').length, 2, file);
    assert.match(section, /prompt_wav_url/);
    assert.match(section, /30/);
    assert.match(section, /16 kHz/);
    assert.match(section, /Retry-After/);
    assert.match(section, /keyo-tts/);
    assert.match(section, /laya-multilingual/);
    assert.match(section, /output/);
  }
});

test('all seven localized quickstart copy buttons send valid distinct speech contracts', () => {
  const ids = ['glm', 'step', 'index', 'eleven', 'qwen', 'cosy', 'spark'];
  assert.equal(Object.keys(dictionary).length, 7);
  for (const [lang, dict] of Object.entries(dictionary)) {
    assert.ok(dict.ttsTitle?.length, lang);
    assert.match(dict.ttsHint, /GET \/v1\/task\/\{id\}/, lang);
    assert.match(dict.ttsRefsHint, /prompt_wav_url/);
    assert.match(dict.ttsRefsHint, /section-7-1/);
    assert.match(dict.ttsRefsHint, /section-8/);
    assert.equal(dict.ttsRefsHint.includes('\\'), false, `${lang}: runtime HTML must not contain escaped quote characters`);
    const links = [...dict.ttsRefsHint.matchAll(/<a href="([^"]+)">/g)].map(match => match[1]);
    assert.deepEqual(links, ['/brand/keyo-api-ref.html#section-7-1', '/brand/keyo-api-ref.html#section-8'], `${lang}: actual localized link values`);
    const samples = quickSamples(dict);
    for (const id of ids) {
      assert.ok(quick.includes(`data-copy-target="curl-tts-${id}"`));
      curlBody(samples.get(`curl-tts-${id}`).textContent, `${lang}/${id}`);
    }
    assert.match(samples.get('curl-tts-task').textContent, /\/v1\/task\/TASK_ID/);
    assert.doesNotMatch(samples.get('curl-tts-task').textContent, /\/v1\/tasks\//);
    assert.match(samples.get('curl-tts-index').textContent, /--output speech\.audio/);
  }
});

test('one-page guide copies the canonical Qwen array and explains reference requirements', () => {
  const guide = read('docs/客户接入一页纸.md');
  const section = guide.split('### 6.2 ')[1].split('### 6.3 ')[0];
  const body = curlBody(section.match(/```bash\n([\s\S]*?)\n```/)[1], 'one-page Qwen');
  assert.equal(body.model, 'Qwen3-TTS');
  assert.equal(body.inputs[0].language, 'Chinese');
  assert.match(section, /prompt_wav_url/);
  assert.match(section, /gender/);
  assert.match(section, /Retry-After/);
});

test('SEO source and rendered copy examples match current model-specific contracts', () => {
  const models = JSON.parse(read('config/seo/model-pages.json')).models;
  const hubs = JSON.parse(read('config/seo/pricing-landings.json')).pages;
  for (const [id, file] of [
    ['Qwen3-TTS', 'model/Qwen3-TTS'], ['CosyVoice3', 'model/CosyVoice3'], ['IndexTTS-2', 'model/IndexTTS-2'],
    ['tts-api', 'tts-api'], ['voice-cloning-api', 'voice-cloning-api'],
  ]) {
    const source = models.find(model => model.id === id) || hubs.find(hub => hub.slug === id);
    const body = curlBody(source.curlExample, id);
    const html = decode(read(`static/seo/${file}.html`));
    const sample = html.match(/<pre(?:\s[^>]*)?>(?:<code>)?([\s\S]*?)(?:<\/code>)?<\/pre>/)[1];
    assert.deepEqual(curlBody(sample, file), body);
    const request = contracts[body.model].requests.find(request => request.path.includes('/async/') === (body.inputs !== undefined));
    assert.ok(request, `${id}: missing pricing contract`);
    for (const key of ['prompt_audio_url', 'prompt_wav_url', 'prompt_text', 'use_emo_text', 'gender']) {
      assert.equal(body[key] !== undefined, request.body[key] !== undefined, `${id}: ${key} differs from pricing copy`);
    }
  }
});

test('Gemini SEO uses native JSON audio only and Eleven does not invent a voice enumeration', () => {
  const gemini = decode(read('static/seo/model/gemini-3.8-flash-tts.html'));
  assert.doesNotMatch(gemini, /also supports OpenAI|support Gemini-native generateContent and the OpenAI|Alternatively, use/);
  assert.match(gemini, /inlineData\.mimeType/);
  assert.match(gemini, /--output gemini-tts-response\.json/);
  const request = JSON.parse(gemini.match(/-d '(\{[\s\S]*?\})'\s*\\/)[1]);
  assert.equal(request.contents[0].role, 'user');
  assert.deepEqual(request.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(request.model, undefined);
  assert.doesNotMatch(read('static/seo/tts-api.html'), /also supports OpenAI-compatible|supports both the Gemini-native/);
  for (const id of ['eleven-v4', 'eleven-v4-turbo']) {
    const html = read(`static/seo/model/${id}.html`);
    assert.doesNotMatch(html, /Built-in voices include /);
    assert.match(html, /confirmed valid for this model and your account/);
    assert.match(html, /If spoken content differs from input/);
  }
  const compat = read('static/seo/openai-api-alternative.html');
  assert.match(compat, /gemini-3\.1-flash-tts-preview<\/code> remains pending/);
  assert.match(compat, /Index requires <code>prompt_audio_url/);
});

test('public copyable examples mark media URLs as explicit placeholders', () => {
  const files = [
    'static/brand/keyo-docs.html',
    'static/brand/keyo-api-ref.html',
    'static/brand/keyo-api-ref.md',
    'static/brand/keyo-api-ref.en.md',
    'docs/客户接入一页纸.md',
    'static/seo/model/CosyVoice3.html',
    'static/seo/model/IndexTTS-2.html',
    'static/seo/voice-cloning-api.html',
  ];
  for (const file of files) {
    const body = read(file);
    assert.doesNotMatch(body, /https:\/\/example\.com\//, `${file}: stale example.com placeholder`);
    assert.match(body, /https:\/\/replace-me\.invalid\//, `${file}: missing explicit placeholder`);
  }
  assert.match(quick, /data-i18n="heroIntro"/);
  assert.match(dictionary.zhCN.heroIntro, /接入文档/);
  assert.match(quick, /href="\/sign-in\?redirect=%2Fkeys"/);
  assert.match(quick, /redirect=%2Fwallet/);
  assert.doesNotMatch(dictionary.zhCN.apiKeyNote, /客服|发放/);
});

test('regenerating TTS SEO preserves corrected requests and hand-maintained TTS pages', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'keyo-tts-docs-'));
  const selected = ['model/Qwen3-TTS', 'model/CosyVoice3', 'model/IndexTTS-2', 'tts-api', 'voice-cloning-api', 'openai-api-alternative'];
  const manual = ['model/gemini-3.8-flash-tts', 'model/eleven-v4', 'model/eleven-v4-turbo'];
  try {
    for (const dir of ['config/seo', 'scripts', 'static/seo/model', 'new-api/web/public']) fs.mkdirSync(path.join(temp, dir), { recursive: true });
    fs.cpSync(path.join(root, 'config/seo'), path.join(temp, 'config/seo'), { recursive: true });
    fs.copyFileSync(path.join(root, 'config/sensenova-free-models.json'), path.join(temp, 'config/sensenova-free-models.json'));
    for (const file of ['gen-seo-pages.mjs', 'caddy-seo-shared.mjs']) fs.copyFileSync(path.join(root, 'scripts', file), path.join(temp, 'scripts', file));
    for (const file of manual) fs.writeFileSync(path.join(temp, 'static/seo', `${file}.html`), read(`static/seo/${file}.html`));
    execFileSync(process.execPath, [path.join(temp, 'scripts/gen-seo-pages.mjs'), `--pages=${selected.join(',')}`, '--html-only'], { stdio:'pipe' });
    // Generated footers use the current day; manual pages must stay byte-identical.
    const normalizeGenerated = (html) => html.replaceAll('\r\n', '\n')
      .replace(/(<span class="foot-updated">Updated )\d{4}-\d{2}-\d{2}(<\/span>)/g, '$1[date]$2');
    for (const file of selected) assert.equal(
      normalizeGenerated(fs.readFileSync(path.join(temp, 'static/seo', `${file}.html`), 'utf8')),
      normalizeGenerated(read(`static/seo/${file}.html`)), file);
    for (const file of manual) assert.equal(
      fs.readFileSync(path.join(temp, 'static/seo', `${file}.html`), 'utf8'),
      read(`static/seo/${file}.html`), file);
    assert.equal(fs.existsSync(path.join(temp, 'static/seo/sitemap.xml')), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
