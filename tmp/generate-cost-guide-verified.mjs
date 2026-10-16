import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const selected=['claude-code-api-pricing','model/cloudflare-clef','models','compare','pricing','claude-api-pricing','ai-agent-api'];
const selectedFiles=new Set(selected.map(key=>key+'.html'));
const seo=path.join(root,'static/seo');
const snapshot=new Map();
for(const entry of fs.readdirSync(seo,{withFileTypes:true,recursive:true}))if(entry.isFile()&&entry.name.endsWith('.html')){
 const file=path.join(entry.parentPath||entry.path,entry.name);
 snapshot.set(path.relative(seo,file).replaceAll('\\','/'),fs.readFileSync(file));
}
const normal=text=>text.replaceAll('\r\n','\n');
const head=file=>normal(fs.readFileSync(path.join(root,file),'utf8'));
const reference=head('static/brand/keyo-api-ref.html');
const oldReference=execFileSync('git',['show','HEAD:static/brand/keyo-api-ref.html'],{cwd:root,encoding:'utf8'});
assert.equal(reference.slice(reference.indexOf('<body')),oldReference.slice(oldReference.indexOf('<body')),'API reference body changed');
const fields=text=>['title','h1'].map(tag=>text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]).concat(text.match(/<link rel="canonical"[^>]*>/)?.[0],text.match(/<meta name="description"[^>]*>/)?.[0]);
execFileSync(process.execPath,[path.join(root,'scripts/gen-seo-pages.mjs'),'--pages='+selected.join(',')],{stdio:'inherit'});
for(const [file,before]of snapshot){const after=fs.readFileSync(path.join(seo,file));if(!selectedFiles.has(file))assert.deepEqual(after,before,'Unexpected HTML overwrite '+file);else assert.deepEqual(fields(after.toString()),fields(before.toString()),'Changed established metadata '+file);}
for(const [file,key,allowed]of [['content-landings.json','slug',['ai-agent-api','claude-code-api-pricing']],['batch2-models.json','id',['cloudflare-clef']],['pricing-landings.json','slug',['claude-api-pricing']]]){
 const rel='config/seo/'+file;
 const before=JSON.parse(execFileSync('git',['show','HEAD:'+rel],{cwd:root,encoding:'utf8'}));
 const after=JSON.parse(head(rel));const list=key==='id'?'models':'pages';
 for(const record of before[list])if(!allowed.includes(record[key]))assert.deepEqual(after[list].find(item=>item[key]===record[key]),record,'Changed unrelated record '+record[key]);
}
console.log(`PASS: ${selected.length} selected pages; all other ${[...snapshot.keys()].filter(file=>!selectedFiles.has(file)).length} HTML files byte-preserved; existing metadata and unrelated config records preserved; API reference body unchanged.`);
