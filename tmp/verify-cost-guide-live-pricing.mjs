import assert from 'node:assert/strict';
const response=await fetch('https://www.keyoapi.xyz/api/pricing',{signal:AbortSignal.timeout(20000)});
assert.equal(response.status,200);
const catalog=await response.json();
assert.ok(Array.isArray(catalog.data));
const expected=[['claude-haiku-5-5',.07353,.36765],['claude-sonnet-5',.4412,2.206],['claude-sonnet-5-5',.88235,4.41175],['claude-opus-5',1.103,5.515],['claude-opus-5-5',1.7647,8.8235],['claude-fable-5-1',7.353,36.765],['cloudflare/clef',.063,0]];
for(const [id,input,output]of expected){
 const model=catalog.data.find(item=>item.model_name===id);
 assert.ok(model,`Missing public model ${id}`);
 assert.equal(model.quota_type,0);
 assert.ok(model.enable_groups.includes('default'));
 assert.ok(Math.abs(model.model_ratio*2-input)<1e-9,`Input rate changed: ${id}`);
 assert.ok(Math.abs(model.model_ratio*2*model.completion_ratio-output)<1e-9,`Output rate changed: ${id}`);
 assert.ok(model.supported_endpoint_types.includes(id==='cloudflare/clef'?'decisions':'openai'));
 console.log(`${id}: default input $${input}/M, output $${output}/M; endpoint metadata confirmed.`);
}
console.log('PASS: public catalog matches all seven documented rates and model IDs. No authenticated inference or login request was made.');
