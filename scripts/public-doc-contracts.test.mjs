import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { normalizeImageRequest } from '../services/apimart-passthrough/image-contracts.mjs';
import { validateVideoClientBody, hasMiniMaxImage, buildOpenluxMiniMaxH3Body, buildAicopyVideoBody } from '../services/apimart-passthrough/video-contracts.mjs';
import { runPowerShellDocFixtures } from './test-doc-powershell-offline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const quick = read('static/brand/keyo-docs.html');
const viewer = read('static/brand/keyo-api-ref.html');
const decode = text => text.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
const i18n = vm.runInNewContext(quick.slice(quick.indexOf('const I18N = '), quick.indexOf('const LANG_LABELS = ')) + '\nI18N;');
const bodies = text => [...text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map(match => match[1]);

function quickSamples(dictionary) {
  const source = quick.slice(quick.indexOf('function renderSamples('), quick.indexOf('function applyLang('));
  const nodes = new Map();
  const context = vm.createContext({ document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } } });
  vm.runInContext(source + '\nthis.renderSamples = renderSamples;', context);
  context.renderSamples(dictionary);
  return nodes;
}

const geminiTtsPath = '/v1beta/models/gemini-3.8-flash-tts:generateContent';
function checkGeminiTtsBody(body, label) {
  assert.equal(body.contents?.[0]?.role, 'user', label);
  assert.ok(body.contents[0].parts[0].text?.length, label);
  assert.deepEqual(body.generationConfig?.responseModalities, ['AUDIO'], label);
  assert.equal(body.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName, 'Kore', label);
  for (const field of ['model', 'input', 'voice']) assert.equal(body[field], undefined, `${label}: OpenAI field ${field} in native request`);
}

function checkGeminiTtsCurl(sample, label) {
  assert.ok(sample.includes('https://www.keyoapi.xyz' + geminiTtsPath), label);
  assert.match(sample, /Authorization: Bearer /, label);
  assert.match(sample, /--output gemini-tts-response\.json/, label);
  assert.doesNotMatch(sample, /--output \S+\.wav/, label);
  assert.ok(!sample.includes('\\n'), `${label} has literal newline escapes`);
  const json = sample.match(/-d '([\s\S]+)'/)?.[1].replaceAll("'\\''", "'");
  assert.ok(json, `${label} missing native request JSON`);
  checkGeminiTtsBody(JSON.parse(json), label);
}

test('marketplace frontend and backend expose identical copyable model contracts', () => {
  assert.deepEqual(
    JSON.parse(read('new-api/web/src/features/pricing/lib/model-contracts.json')),
    JSON.parse(read('services/creem-moderation-proxy/model-contracts.json')),
  );
});

test('Gemini TTS examples and model-page copy contracts use native JSON audio, distinct from OpenAI speech', () => {
  const contracts = JSON.parse(read('services/creem-moderation-proxy/model-contracts.json'));
  const native = contracts['gemini-3.8-flash-tts'].requests;
  assert.equal(native.length, 1);
  assert.equal(native[0].path, geminiTtsPath);
  assert.match(native[0].output, /\.json$/);
  checkGeminiTtsBody(native[0].body, 'model page');
  assert.deepEqual(contracts['gemini-3.1-flash-tts-preview'].requests, []);
  assert.match(quick, /data-copy-target="curl-gemini-tts"/);
  for (const [language, dictionary] of Object.entries(i18n)) {
    checkGeminiTtsCurl(quickSamples(dictionary).get('curl-gemini-tts').textContent, language);
    assert.match(dictionary.geminiTtsHint, /inlineData\.mimeType/, language);
    assert.match(dictionary.geminiTtsHint, /base64/, language);
    assert.match(dictionary.geminiTtsHint, /section-7-2/, language);
  }
  for (const file of ['static/brand/keyo-api-ref.md', 'static/brand/keyo-api-ref.en.md']) {
    const markdown = read(file);
    const nativeSection = markdown.split('### 7.2 ')[1].split('## 8. ')[0];
    checkGeminiTtsCurl(nativeSection.match(/```bash\n([\s\S]+?)\n```/)[1], file);
    assert.match(nativeSection, /inlineData\.mimeType/);
    assert.match(nativeSection, /audio\/L16/);
    const openai = markdown.split('### 7.1 ')[1].split('### 7.2 ')[0];
    assert.doesNotMatch(openai, /gemini-3\.[18]-flash-tts/);
    assert.match(openai, /GLM-TTS/);
    assert.ok(markdown.split('### 1.14 ')[1].split('## 2. ')[0].includes('gemini-3.1-flash-tts-preview'));
  }
  const onepage = read('docs/客户接入一页纸.md').split('### 6.3 ')[1].split('## 7. ')[0];
  checkGeminiTtsCurl(onepage.match(/```bash\n([\s\S]+?)\n```/)[1], 'one-page guide');
});

test('copied Gemini Python decoder handles WAV and PCM fixtures and rejects false audio results', () => {
  const candidates = [process.env.KEYO_DOC_PYTHON, 'python3', 'python'].filter(Boolean);
  const python = candidates.find(command => spawnSync(command, ['-c', 'import sys; assert sys.version_info >= (3, 8)'], { encoding:'utf8', windowsHide:true }).status === 0);
  assert.ok(python, 'Python 3.8+ is required for the offline copied-decoder fixture; set KEYO_DOC_PYTHON if needed');
  const fixture = `import base64, io, json, runpy, sys, tempfile, wave
from pathlib import Path
decode = runpy.run_path(sys.argv[1], run_name="fixture")["save_gemini_audio"]
pcm = bytes([0, 0, 1, 0, 255, 127, 0, 128])
def part(mime, raw=pcm):
    return {"inlineData": {"mimeType": mime, "data": base64.b64encode(raw).decode("ascii")}}
def payload(*parts):
    return {"candidates": [{"content": {"parts": list(parts)}}]}
def reject(data, output):
    try:
        decode(data, output)
    except Exception:
        return
    raise AssertionError("Invalid audio response was accepted")
with tempfile.TemporaryDirectory(dir=sys.argv[2]) as temporary:
    output = Path(temporary)
    for index, (mime, rate) in enumerate([( "audio/L16;codec=pcm;rate=24000", 24000), ("audio/L16;rate=16000;channels=1", 16000), ("audio/L16", 24000)]):
        files = decode(payload({"text": "spoken text"}, part(mime)), output / str(index))
        assert len(files) == 1
        with wave.open(files[0], "rb") as audio:
            assert (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) == (1, 2, rate)
            assert audio.readframes(audio.getnframes()) == pcm
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(24000); audio.writeframes(pcm)
    wav = buffer.getvalue()
    files = decode(payload(part("audio/wav", wav)), output / "wav")
    assert Path(files[0]).read_bytes() == wav, "Complete WAV was wrapped a second time"
    alternatives = payload(part("audio/L16"), part("audio/L16", pcm[::-1]))
    alternatives["candidates"].append({"content": {"parts": [part("audio/L16", b"ignored")]}})
    files = decode(alternatives, output / "parts")
    assert len(files) == 2, "Alternative candidates were incorrectly concatenated"
    for bad in [{"error": {"message": "fixture"}}, payload({"text": "no audio"}), payload(part("audio/mpeg")), payload(part("audio/wav", b"not-a-wave")), payload(part("audio/L16", b"x")), payload(part("audio/L16;rate=0")), payload(part("audio/L16;channels=2")), {"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"audio/L16","data":"invalid-base64!"}}]}}]}]:
        reject(bad, output / "invalid")
print(json.dumps({"pcmCases":3,"wavPreserved":True,"multipartPreserved":True,"rejectedCases":8}))
`;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'keyo-doc-decoder-'));
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
  const moduleFile = path.join(temporary, 'copied_decoder.py');
  try {
    let expected;
    for (const file of ['static/brand/keyo-api-ref.md', 'static/brand/keyo-api-ref.en.md']) {
      const section = read(file).split('### 7.2 ')[1].split('## 8. ')[0];
      const source = section.match(/```python\n([\s\S]+?)\n```/)[1];
      if (expected) assert.equal(source, expected, 'Chinese and English decoder snippets drifted');
      expected = source;
      fs.writeFileSync(moduleFile, source, 'utf8');
      const result = spawnSync(python, ['-c', fixture, moduleFile, temporary], { encoding:'utf8', windowsHide:true });
      assert.equal(result.status, 0, `${file}: ${result.stderr}`);
      assert.deepEqual(JSON.parse(result.stdout), { pcmCases:3, wavPreserved:true, multipartPreserved:true, rejectedCases:8 });
    }
  } finally {
    if (fs.existsSync(moduleFile)) fs.unlinkSync(moduleFile);
    fs.rmdirSync(temporary);
  }
});

test('all seven languages produce valid copied JSON and distinct task URLs', () => {
  for (const [language, dictionary] of Object.entries(i18n)) {
    const nodes = quickSamples(dictionary);
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

test('copied shell examples clearly distinguish Bash from Windows PowerShell', () => {
  assert.ok(!quick.includes('<span class="lang">cURL'));
  assert.match(quick, /data-copy-target="ps-chat"/);
  assert.match(quick, /id="powershell-chat"/);
  for (const [language, dictionary] of Object.entries(i18n)) {
    assert.match(dictionary.shellBashHint, /Bash.*curl/);
    assert.match(dictionary.shellBashHint, /macOS.*Linux.*Git Bash/);
    assert.match(dictionary.shellPowerShellHint, /PowerShell 5\.1 \/ 7/);
    const source = quickSamples(dictionary).get('ps-chat').textContent;
    assert.match(source, /Invoke-RestMethod @request/, language);
    assert.match(source, /UTF8\.GetBytes\(\$body\)/, language);
    assert.doesNotMatch(source, /curl|\\\r?\n/, language);
  }
  for (const file of ['static/brand/keyo-api-ref.md', 'static/brand/keyo-api-ref.en.md']) {
    assert.match(read(file), /### 2\.2 .*PowerShell 5\.1 \/ 7/);
    assert.match(read(file), /```powershell\n\$apiKey = /);
  }
  assert.match(read('docs/客户接入一页纸.md'), /keyo-docs\.html#powershell-chat/);
});

test('PowerShell 5.1 and 7 send copied Unicode JSON and auth correctly to loopback only', { skip: process.platform !== 'win32' }, async () => {
  const result = await runPowerShellDocFixtures();
  assert.equal(result.loopbackRequests, 18);
  assert.equal(result.publicModelRequests, 0);
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

test('copied MiniMax-H3 examples pass the actual validator and preserve fields in their matching builders', () => {
  const catalog = JSON.parse(read('services/apimart-passthrough/catalog.json')).models;
  const meta = catalog.find(model => model.id === 'MiniMax-H3');
  const examples = [];
  for (const file of ['static/brand/keyo-api-ref.md', 'static/brand/keyo-api-ref.en.md', 'docs/客户接入一页纸.md']) {
    const h3 = bodies(read(file)).map(body => JSON.parse(body)).filter(body => body.model === 'MiniMax-H3');
    assert.equal(h3.length, 2, `Expected text and reference-image examples in ${file}`);
    examples.push(...h3.map(body => ({ file, body })));
  }
  const marketplace = JSON.parse(read('services/creem-moderation-proxy/model-contracts.json'));
  examples.push({ file:'marketplace MiniMax-H3', body:marketplace['MiniMax-H3'].requests[0].body });
  for (const { file, body } of examples) {
    assert.equal(validateVideoClientBody(body.model, body), null, file);
    if (hasMiniMaxImage(body)) {
      const request = buildAicopyVideoBody(meta, body);
      assert.equal(request.seconds, body.duration, file);
      assert.equal(request.resolution, body.resolution, file);
      assert.deepEqual(request.extra.reference_images, body.images.map(url => ({ url, role:'reference_image' })), file);
      assert.deepEqual(request.extra.reference_audios, body.audios.map(url => ({ url })), file);
      assert.equal(request.extra.aspect_ratio, body.aspectRatio === 'portrait' ? '9:16' : '16:9', file);
    } else {
      const request = buildOpenluxMiniMaxH3Body(meta, body);
      assert.equal(request.resolution, body.resolution === '2k' ? '2K' : '768P', file);
      assert.equal(request.duration, body.duration, file);
      assert.deepEqual(request.content, [{ type:'text', text:body.prompt }], file);
      assert.equal(request.ratio, body.aspectRatio === 'portrait' ? '9:16' : '16:9', file);
    }
  }
  for (const [language, dictionary] of Object.entries(i18n)) {
    assert.match(dictionary.minimaxResolutionSummary, /768p \/ 2k/, language);
    assert.match(dictionary.minimaxDurationSummary, /4–15.*1–15/, language);
    assert.match(dictionary.nMinimaxH3, /seed/, language);
  }
});

test('marketplace copyable video contracts pass the actual validator and use their own submit and polling paths', () => {
  const contracts = JSON.parse(read('services/creem-moderation-proxy/model-contracts.json'));
  const catalog = JSON.parse(read('services/apimart-passthrough/catalog.json')).models;
  const videoIds = new Set(catalog.map(model => model.id));
  let checked = 0;
  for (const [id, contract] of Object.entries(contracts)) {
    if (contract.kind !== 'video') continue;
    for (const request of contract.requests || []) {
      checked++;
      assert.equal(request.body.model, id);
      assert.equal(validateVideoClientBody(id, request.body), null, id);
      if (id === 'grok-video-1.5') {
        assert.equal(request.path, '/v1/chat/completions');
        assert.ok(request.body.messages?.length);
        assert.equal(request.pollPath, undefined);
      } else {
        assert.ok(videoIds.has(id), `${id} missing native video catalog`);
        assert.equal(request.path, '/v1/videos/generations', id);
        assert.equal(request.pollPath, '/v1/tasks/{id}', id);
      }
    }
  }
  assert.ok(checked >= 10, 'Video copy regression must include all current documented requests');
  assert.deepEqual(contracts['agnes-video-2.5'].requests, []);
  assert.doesNotMatch(quick, /data-copy="agnes-video-2\.5"/);
  assert.doesNotMatch(read('docs/客户接入一页纸.md'), /grok-imagine/);
  for (const file of ['static/brand/keyo-api-ref.md', 'static/brand/keyo-api-ref.en.md']) {
    const markdown = read(file);
    const documented = markdown.split('### 1.4 ')[1].split('### 1.5 ')[0];
    assert.ok(!documented.includes('agnes-video-2.5'), `${file} advertises a pending contract`);
    const pending = markdown.split('### 1.14 ')[1].split('## 2. ')[0];
    assert.ok(pending.includes('agnes-video-2.5'), `${file} missing pending contract notice`);
  }
});

test('public image recommendations exclude delisted IDs and agree across handbooks and mirrors', () => {
  const documented = ['gpt-image-2', 'gpt-image-2-vip', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'nano-banana-2', 'nano-banana-2.1', 'nano-banana-pro'].sort();
  const delisted = /(?:data-copy="|`)(?:gpt-image-2\.5|gpt-image-2\.5-(?:flare|sunburst)-vip)(?:"|`)/;
  const files = ['static/brand/keyo-docs.html', 'static/brand/keyo-api-ref.md', 'static/brand/keyo-api-ref.en.md', 'static/brand/keyo-api-ref.html', 'docs/客户接入一页纸.md', 'docs/keyoapi-接入文档.html', 'new-api/web/public/keyoapi-docs.html'];
  for (const file of files) {
    assert.doesNotMatch(read(file), delisted, `Delisted image recommendation in ${file}`);
    assert.doesNotMatch(read(file), /[Aa]ll eight models|八个型号|八個型號|全8モデル|Les 8 modèles|Все 8 моделей|Cả 8 model/, `Stale image model count in ${file}`);
  }
  const imageSection = quick.match(/<section id="image">([\s\S]*?)<\/section>/)[1];
  const quickModels = [...imageSection.matchAll(/class="model-btn" data-copy="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(quickModels, documented);
  for (const file of ['static/brand/keyo-api-ref.md', 'static/brand/keyo-api-ref.en.md', 'docs/客户接入一页纸.md']) {
    const rows = [...read(file).matchAll(/^\| `(gpt-image-[^`]+|nano-banana-[^`]+)` \|/gm)].map(match => match[1]).sort();
    assert.deepEqual(rows, documented, `Image capability table differs in ${file}`);
  }
  for (const [language, dictionary] of Object.entries(i18n)) {
    assert.ok(dictionary.imageSizeHint.includes('gpt-image-2.5-flare'), `${language} missing current variant`);
    assert.ok(dictionary.imageSizeHint.includes('gpt-image-2.5-sunburst'), `${language} missing current variant`);
    assert.ok(dictionary.imageSizeHint.includes('/pricing'), `${language} missing group check link`);
  }
  for (const file of ['docs/keyoapi-接入文档.html', 'new-api/web/public/keyoapi-docs.html']) assert.equal(read(file), quick, `Stale mirror ${file}`);
});

test('image completion rules remain distinct from other asynchronous task families', () => {
  for (const [language, dictionary] of Object.entries(i18n)) {
    assert.match(dictionary.imageTasksHint, /status=succeeded/, `${language} image success rule`);
    assert.match(dictionary.imageTasksHint, /data\[\]\.url/, `${language} image result rule`);
    assert.doesNotMatch(dictionary.imageTasksHint, /status.?[:=] ?["']?completed/, `${language} image rule uses a video terminal status`);
    assert.match(dictionary.videoTaskHint, /\/v1\/tasks\/\{id\}/, `${language} video path`);
    assert.match(dictionary.videoTaskHint, /\/v1\/task\/\{id\}/, `${language} tools path`);
    assert.match(dictionary.videoTaskHint, /\/v1\/images\/tasks\/\{task_id\}/, `${language} distinct image path`);
  }
});

test('unavailable video tools expose a pending notice instead of executable requests', () => {
  const contracts = JSON.parse(read('services/creem-moderation-proxy/model-contracts.json'));
  for (const id of ['subtitle-erase-pro', 'video-enhance-pro']) {
    assert.deepEqual(contracts[id].requests, [], `${id} must not offer a copyable request`);
    assert.ok(!quick.includes(`data-copy="${id}"`), `${id} has a model copy button`);
    for (const dictionary of Object.values(i18n)) assert.ok(dictionary.videoToolsPendingHint.includes(id));
  }
  assert.doesNotMatch(quick, /data-copy="https:\/\/www\.keyoapi\.xyz\/v1\/async\/videos\/(?:enhance|subtitle-erase)"/);
  for (const [language, dictionary] of Object.entries(i18n)) {
    assert.match(dictionary.videoToolsPendingHint, /\/v1\/async\/videos\/subtitle-erase/);
    assert.match(dictionary.videoToolsPendingHint, /\/v1\/async\/videos\/enhance/);
    assert.doesNotMatch(dictionary.capVideoSub, /subtitle|字幕|субтитр|phụ đề/i, `${language} capability card promises unavailable subtitle removal`);
  }
  for (const file of ['static/brand/keyo-api-ref.md', 'static/brand/keyo-api-ref.en.md']) {
    const markdown = read(file);
    const notice = markdown.split('### 1.11a ')[1].split('### 1.11b ')[0];
    assert.doesNotMatch(notice, /```|`POST /);
    assert.match(markdown, /## 17\./);
    assert.match(markdown, /task_query_unavailable/);
    assert.match(markdown, /Retry-After/);
    assert.match(markdown, /GET.*(?:轮询响应|polling responses)/);
    assert.match(markdown, /waiting/);
  }
});

test('FAQ has a single page heading and no corrupted headings embedded in prose', () => {
  const faq = read('static/brand/faq.html');
  assert.equal([...faq.matchAll(/<h1\b/g)].length, 1);
  assert.doesNotMatch(faq, /<(?:p|li)\b[^>]*>[^<]*<h1\b/);
  assert.doesNotMatch(faq, /500,000 quota units/);
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
