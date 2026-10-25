/** Execute the public PowerShell snippets against loopback fixtures only. No model calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');

export async function runPowerShellDocFixtures() {
  assert.equal(process.platform, 'win32', 'Run this offline regression on Windows with PowerShell 5.1 and 7 installed');
  const shells = ['powershell.exe', 'pwsh.exe'].map(command => {
    const probe = spawnSync(command, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding:'utf8', windowsHide:true, timeout:10000 });
    assert.ifError(probe.error);
    assert.equal(probe.status, 0, `${command} must be available`);
    const version = probe.stdout.trim();
    assert.match(version, command === 'powershell.exe' ? /^5\.1\./ : /^7\./);
    return { command, version };
  });
  const quick = read('static/brand/keyo-docs.html');
  const i18n = vm.runInNewContext(quick.slice(quick.indexOf('const I18N = '), quick.indexOf('const LANG_LABELS = ')) + '\nI18N;');
  const renderer = quick.slice(quick.indexOf('function renderSamples('), quick.indexOf('function applyLang('));
  const samples = [];
  for (const [name, dictionary] of Object.entries(i18n)) {
    const nodes = new Map();
    const context = vm.createContext({ document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } } });
    vm.runInContext(renderer + '\nthis.renderSamples = renderSamples;', context);
    context.renderSamples(dictionary);
    samples.push({ name, source:nodes.get('ps-chat').textContent, message:dictionary.hello || 'Hello' });
  }
  for (const [file, message] of [['static/brand/keyo-api-ref.md', '你好'], ['static/brand/keyo-api-ref.en.md', 'Hello']]) {
    samples.push({ name:file, source:read(file).match(/```powershell\n([\s\S]*?)\n```/)[1], message });
  }
  assert.equal(samples.length, 9);
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method:req.method, url:req.url, auth:req.headers.authorization, type:req.headers['content-type'], body:Buffer.concat(chunks).toString('utf8') });
    res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8' });
    res.end(JSON.stringify({ choices:[{ message:{ content:'fixture-已验证-✓' } }] }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const localUrl = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
    for (const { command } of shells) {
      const source = "$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n" + samples.map(sample => sample.source.replace('https://www.keyoapi.xyz/v1/chat/completions', localUrl).replace(/^\$apiKey = .*$/m, "$apiKey = 'sk-loopback-fixture'")).join('\n');
      assert.ok(!source.includes('keyoapi.xyz'), 'Regression must never call the public model endpoint');
      const encoded = Buffer.from(source, 'utf16le').toString('base64');
      const output = await new Promise((resolve, reject) => {
        const child = spawn(command, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide:true, timeout:30000 });
        let stdout = '', stderr = '';
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr}`)));
      });
      assert.equal(output.match(/fixture-已验证-✓/g)?.length, samples.length, `${command} did not read UTF-8 responses`);
    }
    assert.equal(requests.length, samples.length * shells.length);
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i], sample = samples[i % samples.length];
      assert.equal(req.method, 'POST'); assert.equal(req.url, '/v1/chat/completions');
      assert.equal(req.auth, 'Bearer sk-loopback-fixture');
      assert.match(req.type, /application\/json;\s*charset=utf-8/i);
      assert.deepEqual(JSON.parse(req.body), { model:'gpt-5.6-luna', messages:[{ role:'user', content:sample.message }] }, sample.name);
    }
    return { samples:samples.length, shells, loopbackRequests:requests.length, publicModelRequests:0 };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await runPowerShellDocFixtures(), null, 2));
}
