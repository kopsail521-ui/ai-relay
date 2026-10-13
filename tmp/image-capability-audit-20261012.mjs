import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { taskStatus } from '../services/apimart-passthrough/task-responses.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source=fs.readFileSync(path.join(root,'services/apimart-passthrough/server.mjs'),'utf8');
const section=source.slice(source.indexOf('const IMAGE_POLL_INTERVAL_MS'),source.indexOf('const server = http.createServer'));
const models=JSON.parse(fs.readFileSync(path.join(root,'services/apimart-passthrough/catalog.json'),'utf8')).models.filter(m=>m.kind==='image');
function imageHarness(polls, env={}) {
  let clock=0; const submits=[], bills=[];
  class AuditDate extends Date {static now(){return clock;}}
  const context={process:{env:{IMAGE_POLL_INTERVAL_MS:'1',IMAGE_POLL_MAX_MS:'120000',...env}},Date:AuditDate,Buffer,taskStatus,
    setTimeout:(fn,ms)=>{clock+=ms; fn();},isGrsaiMeta:()=>true,GRSAI_ORIGIN:'http://mock',GRSAI_KEY:'mock',
    estimateCostUsd:m=>m.estimate.cost_usd,sellUsd:(n,m)=>n*m.markup,
    adjustQuota:(u,t,m,delta)=>{bills.push(delta);return {ok:true};},
    json:(res,status,body)=>({status,body}),
    proxyOrigin:async(origin,key,req,buf,p)=>{
      if(p==='/v1/api/generate') {submits.push(JSON.parse(buf.toString()));return {status:200,buf:Buffer.from(JSON.stringify({id:'mock-'+submits.length}))};}
      const j=typeof polls==='function'?polls(submits.length):polls;
      return {status:200,buf:Buffer.from(JSON.stringify(j))};
    }
  };
  vm.runInNewContext(section+'\nglobalThis.auditSubmit=handleImageSubmit;',context);
  return {run:body=>context.auditSubmit({headers:{}},{},{userId:1,tokenId:1},models.find(m=>m.id===body.model),body),submits,bills};
}
const results=[];
for(const m of models){
  const h=imageHarness({status:'succeeded',results:[{url:'https://mock.invalid/out.png'}]});
  const reply=await h.run({model:m.id,prompt:'audit',images:['https://mock.invalid/ref.png'],size:'3840x2160',resolution:'4K',imageSize:'4K',quality:'high',mask:'https://mock.invalid/mask.png',background:'transparent',n:3,response_format:'b64_json'});
  results.push({model:m.id,status:reply.status,forwarded:h.submits[0],count:reply.body.data?.length,responseFields:Object.keys(reply.body.data?.[0]||{}),charges:h.bills});
}
for(const model of ['gpt-image-2-vip','gpt-image-2.5-flare','gpt-image-2.5-sunburst']){
  const h=imageHarness({status:'succeeded',results:[{url:'https://mock.invalid/out.png'}]});
  const reply=await h.run({model,prompt:'audit',images:['https://mock.invalid/ref.png'],size:'4096x4096'});
  results.push({check:'invalid_size',model,status:reply.status,submits:h.submits.length,charges:h.bills});
}
{
  const h=imageHarness({status:'succeeded',results:[{url:'https://mock.invalid/out.png'}]});
  const reply=await h.run({model:'gpt-image-2-vip',prompt:'audit',images:['data:image/png;base64,aGVsbG8=']});
  results.push({check:'base64_reference',status:reply.status,submits:h.submits.length});
}
{
  const h=imageHarness({status:'running'}, {IMAGE_POLL_INTERVAL_MS:'20000',IMAGE_POLL_MAX_MS:'180000'});
  const reply=await h.run({model:'gpt-image-2-vip',prompt:'audit',images:['https://mock.invalid/ref.png'],size:'3840x2160'});
  results.push({check:'running_task_retry',status:reply.status,submits:h.submits.length,charges:h.bills,errorCode:reply.body.error.code});
}
{
  const h=imageHarness({status:'succeeded',results:[{url:'https://mock.invalid/out.png'}]});
  const reply=await h.run({model:'gpt-image-2-vip',prompt:'audit',image:['https://mock.invalid/ref.png']});
  results.push({check:'singular_image_array',status:reply.status,submits:h.submits.length});
}
{
  const h=imageHarness({status:'violation',error:'mock policy rejection'}, {IMAGE_POLL_INTERVAL_MS:'20000',IMAGE_POLL_MAX_MS:'180000'});
  const reply=await h.run({model:'gpt-image-2-vip',prompt:'audit',images:['https://mock.invalid/ref.png']});
  results.push({check:'policy_rejection_retry',status:reply.status,submits:h.submits.length,charges:h.bills,errorCode:reply.body.error.code});
}
const modSource=fs.readFileSync(path.join(root,'services/creem-moderation-proxy/server.mjs'),'utf8');
const modSection=modSource.slice(modSource.indexOf('const server = http.createServer'),modSource.indexOf('server.listen'));
let handler,forwarded=0;
const modContext={http:{createServer:fn=>{handler=fn;return {};}},Buffer,Date,console,
 redirectPublicPaths:()=>false,rankingsSyntheticEnabled:()=>false,readBodyLimited:async req=>{const arr=[];for await(const c of req)arr.push(c);return Buffer.concat(arr);},
 PROXY_MAX_BODY_BYTES:134217728,IMAGE_PATHS:new Set(['/v1/images/generations','/v1/images/edits','/v1/images/variations']),extractPrompt:p=>p.prompt||'',
 screenPrompt:async()=>({decision:'allow'}),IMAGE_GEN_MODELS:new Set(models.map(m=>m.id)),VIDEO_GEN:'http://mock-native',UPSTREAM:'http://mock-compat',qsOf:()=>'',
 proxyRaw:async()=>{throw new Error('mock native transport failure');},proxyRequest:async(req,res)=>{forwarded++;res.result={status:200,fellBack:true};},
 json:(res,status,body)=>{res.result={status,body};}};
vm.runInNewContext(modSection,modContext);
function req(body,type,url){const r=Readable.from([Buffer.from(body)]);r.url=url;r.method='POST';r.headers={'content-type':type,authorization:'Bearer mock'};return r;}
const multipart='--boundary\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-2-vip\r\n--boundary\r\nContent-Disposition: form-data; name="prompt"\r\n\r\naudit\r\n--boundary--\r\n';
const mr={};await handler(req(multipart,'multipart/form-data; boundary=boundary','/v1/images/edits'),mr);
results.push({check:'multipart_edit',...mr.result});
const fr={};await handler(req(JSON.stringify({model:'gpt-image-2-vip',prompt:'audit',images:['https://mock.invalid/ref.png']}),'application/json','/v1/images/generations'),fr);
results.push({check:'native_forward_failure',...fr.result,compatibilityForwardCount:forwarded});
console.log(JSON.stringify({source:'actual source sections executed with local mocks; no paid generation or production changes',results},null,2));
