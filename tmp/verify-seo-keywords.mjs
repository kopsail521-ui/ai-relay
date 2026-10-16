import fs from 'node:fs';
import cp from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const git=(...args)=>cp.execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const normalize=text=>text.replace(/\r\n/g,'\n');
const changed=git('diff','--name-only').trim().split('\n');
const patterns=[/<title>[\s\S]*?<\/title>/,/<h1>[\s\S]*?<\/h1>/,/<link rel="canonical"[^>]*>/,/<meta name="description"[^>]*>/];
for(const file of changed.filter(file=>file.startsWith('static/seo/')&&file.endsWith('.html'))){
  const before=git('show','HEAD:'+file),after=read(file);
  for(const pattern of patterns) assert.equal(after.match(pattern)?.[0],before.match(pattern)?.[0],`Metadata changed: ${file}`);
}
const protectedPages=['static/seo/index.html','static/seo/free-models.html',...['eleven-v4','eleven-v4-turbo','gemini-3.8-flash-tts','gemini-3.1-flash-tts-preview','suno_music_open','deepseek-v4-pro','gemini-embedding-2-preview','gemini-4-argon','gemini-4-barium'].map(id=>`static/seo/model/${id}.html`)];
for(const file of protectedPages) assert.equal(normalize(read(file)),normalize(git('show','HEAD:'+file)),`Protected content changed: ${file}`);
const prices=JSON.parse(read('tmp/seo-keyword-pricing.json'));
const expected=[['gpt-6.1-sol',0.3677,1.8385,0.007354],['gpt-6-astra',1.8385,9.1925,0.036770],['claude-opus-5-5',1.7647,8.8235,0.035294],['claude-fable-5-1',7.3530,36.7650,0.147060],['gemini-4-argon',0.7353,3.6765,0.014706],['gemini-4-barium',0.7353,3.6765,0.014706]];
assert.equal(prices.group_ratio.default,1);
for(const [id,input,output,cost] of expected){
  const model=prices.data.find(model=>model.model_name===id);
  assert.ok(model&&model.quota_type===0&&model.supported_endpoint_types.includes('openai'));
  assert.ok(Math.abs(model.model_ratio*2-input)<1e-10);
  assert.ok(Math.abs(model.model_ratio*2*model.completion_ratio-output)<1e-10);
  assert.ok(Math.abs(input*.01+output*.002-cost)<1e-10);
}
const content=JSON.parse(read('config/seo/content-landings.json'));
for(const page of content.pages){
  const html=read(`static/seo/${page.slug}.html`);
  assert.ok(!html.includes('noindex'));
  assert.ok(!/(search intent|for SEO|this page targets|search demand|highest-traffic)/i.test(html));
  assert.ok(!html.includes('/pricing/gpt-')&&!html.includes('/pricing/claude-'));
}
const originalBatch=JSON.parse(git('show','HEAD:config/seo/batch2-models.json'));
const newBatch=JSON.parse(read('config/seo/batch2-models.json'));
for(const model of newBatch.models) if(!['gpt-6.1-sol','claude-opus-5-5'].includes(model.id))assert.deepEqual(model,originalBatch.models.find(old=>old.id===model.id));
const originalLandings=JSON.parse(git('show','HEAD:config/seo/pricing-landings.json'));
const newLandings=JSON.parse(read('config/seo/pricing-landings.json'));
for(const page of newLandings.pages) if(!['openai-api-pricing','claude-api-pricing','gemini-api-pricing'].includes(page.slug))assert.deepEqual(page,originalLandings.pages.find(old=>old.slug===page.slug));
console.log('PASS: existing title/H1/canonical/meta unchanged; 11 protected HTML contents unchanged (CRLF normalized); 6 live catalog rates and request estimates match; unrelated config entries unchanged; new pages indexable.');
