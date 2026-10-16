import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function close(text,start){let depth=0,string=false,escaped=false;for(let i=start;i<text.length;i++){const c=text[i];if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;continue;}if(c==='"')string=true;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}')if(--depth===0)return i;}throw Error('Unclosed JSON');}
function field(text,key){const match=new RegExp('"'+key+'"\\s*:\\s*').exec(text);if(!match)throw Error('Missing '+key);const start=match.index+match[0].length;return {start,end:close(text,start)};}
function arrayObjects(text,key){const {start,end}=field(text,key);const objects=[];for(let i=start+1;i<end;i++){if(text[i]==='{'){const finish=close(text,i);objects.push({start:i,end:finish,value:JSON.parse(text.slice(i,finish+1))});i=finish;}}return {start,end,objects};}
function append(text,key,values){if(!values.length)return text;const {start,end}=field(text,key);const existing=text.slice(start+1,end).trimEnd();const whitespace=text.slice(start+1,end).slice(existing.length);const indent=(/^\s*/.exec(text.slice(text.lastIndexOf('\n',end)+1,end))[0]);const encoded=values.map(value=>JSON.stringify(value,null,2).split('\n').map((line,i)=>(i?indent+'  ':'')+line).join('\n')).join(',\n'+indent+'  ');return text.slice(0,start+1)+existing+(existing.trim()?',':'')+'\n'+indent+'  '+encoded+'\n'+indent+text.slice(end);}
for(const [file,array,key,changed] of [
 ['config/seo/content-landings.json','pages','slug',new Set(['ai-agent-api','claude-code-api-pricing'])],
 ['config/seo/batch2-models.json','models','id',new Set(['cloudflare-clef'])],
 ['config/seo/pricing-landings.json','pages','slug',new Set(['claude-api-pricing'])],
]){
 const full=path.join(root,file),current=JSON.parse(fs.readFileSync(full,'utf8'));
 const original=execFileSync('git',['show','HEAD:'+file],{cwd:root,encoding:'utf8'});
 const parsed=JSON.parse(original),ranges=arrayObjects(original,array);let result=original;
 for(const entry of [...ranges.objects].reverse()){
  const id=entry.value[key],now=current[array].find(item=>item[key]===id);assert.ok(now,id);
  if(!changed.has(id)){assert.deepEqual(now,entry.value,`Unexpected concurrent change in ${id}`);continue;}
  let text=original.slice(entry.start,entry.end+1);
  if(id==='ai-agent-api'){
   assert.deepEqual(now.sections.slice(0,entry.value.sections.length),entry.value.sections);
   assert.deepEqual(now.related.slice(0,entry.value.related.length),entry.value.related);
   text=append(text,'sections',now.sections.slice(entry.value.sections.length));
   text=append(text,'related',now.related.slice(entry.value.related.length));
  }else if(id==='claude-api-pricing'){
   assert.deepEqual(now.guideSections.slice(0,(entry.value.guideSections||[]).length),entry.value.guideSections||[]);
   text=append(text,'guideSections',now.guideSections.slice((entry.value.guideSections||[]).length));
  }else{
   now.related=entry.value.related;
   const extraKeywords=now.targetKeywords.filter(value=>!entry.value.targetKeywords.includes(value));
   text=append(text,'targetKeywords',extraKeywords);
   text=append(text,'guideSections',now.guideSections.slice(entry.value.guideSections.length));
   text=append(text,'faqs',now.faqs.slice(entry.value.faqs.length));
   text=text.replace('Bearer YOUR_API_KEY','Bearer $KEYO_API_KEY');
  }
  assert.deepEqual(JSON.parse(text),now,`Patch mismatch: ${id}`);
  result=result.slice(0,entry.start)+text+result.slice(entry.end+1);
 }
 const newObjects=current[array].filter(item=>!parsed[array].some(old=>old[key]===item[key]));
 for(const item of newObjects)assert.ok(changed.has(item[key]));
 result=append(result,array,newObjects);
 assert.deepEqual(JSON.parse(result),current);
 fs.writeFileSync(full,result);
}
console.log('Preserved original formatting and content for every unrelated config record.');
