import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const save=(file,data)=>fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,2)+'\n');
const one=(list,key,value)=>{const found=list.filter(item=>item[key]===value);if(found.length!==1)throw new Error(`Expected one ${key}=${value}`);return found[0];};
const upsert=(list,key,value,item)=>{const found=list.filter(old=>old[key]===value);if(found.length>1)throw new Error(`Duplicate ${value}`);if(found.length)Object.assign(found[0],item);else list.push(item);};
const contentFile='config/seo/content-landings.json';
const content=load(contentFile);
const rates=[['claude-haiku-5-5',0.07353,0.36765],['claude-sonnet-5',0.4412,2.206],['claude-sonnet-5-5',0.88235,4.41175],['claude-opus-5',1.103,5.515],['claude-opus-5-5',1.7647,8.8235],['claude-fable-5-1',7.353,36.765]];
upsert(content.pages,'slug','claude-code-api-pricing',{
 slug:'claude-code-api-pricing',kind:'cost-guide',
 title:'Claude Code API Pricing: Task Budgets & Model Rates | KeyoAPI',
 h1:'Claude Code API Pricing: Budget the Whole Task',
 metaDescription:'Plan Claude Code API costs with KeyoAPI token rates, a clearly assumed 100K/10K task budget, subscription tradeoffs and gateway compatibility requirements.',
 lead:'An API budget for Claude Code needs the billed usage across the whole task: context sent on each turn, generated output and any retries. Use the KeyoAPI rates below to compare a stated token budget with your own usage. Direct Claude Code integration through KeyoAPI has not yet been verified end to end.',
 sections:[
  {heading:'Claude model API rates on KeyoAPI',paragraphs:['Checked against the public catalog on 2026-10-14 for the default billing group. These are KeyoAPI sell rates and catalog IDs, not Anthropic official list prices or a guarantee of Claude Code compatibility. The catalog currently advertises OpenAI-compatible chat for these IDs. Other billing groups, cached input and additional features can use different rates. Confirm current prices on /pricing and compare the wider table on /claude-api-pricing.'],headers:['KeyoAPI model ID','Input / 1M tokens','Output / 1M tokens'],rows:rates.map(([id,input,output])=>[id,'$'+input.toFixed(5),'$'+output.toFixed(5)]),paragraphsAfter:['Price alone does not establish answer quality, context limits or the best model for a task. Compare accepted edits, passing tests, latency and total cost on your actual repository work. Fable is included as another catalog option; it is not restricted to long-form writing.']},
  {heading:'A worked task budget: 100K input + 10K output',paragraphs:['Assume one task accumulates 100,000 billed input tokens and 10,000 billed output tokens across all its requests. This is an illustrative budget, not a measured average or a claim about typical Claude Code usage. If context is sent repeatedly, count each billed occurrence. These examples exclude cache-rate differences, group multipliers, additional charges and retries beyond that stated usage.','Cost = total input tokens / 1,000,000 × input rate + total output tokens / 1,000,000 × output rate.'],headers:['Model ID','Input cost','Output cost','Total task cost','$20 balance: complete tasks'],rows:rates.filter(([id])=>['claude-haiku-5-5','claude-sonnet-5-5','claude-opus-5-5','claude-fable-5-1'].includes(id)).map(([id,input,output])=>{const cost=input*.1+output*.01;return [id,'$'+(input*.1).toFixed(7),'$'+(output*.01).toFixed(7),'$'+cost.toFixed(7),String(Math.floor(20/cost))];}),paragraphsAfter:['A $20 prepaid API balance is not equivalent to a $20 subscription: it buys metered requests at the applicable rates. The counts above are budget divisions under identical usage assumptions, not guaranteed completed coding tasks. See /ai-agent-api for a bounded execution loop and total-session budgeting.']},
  {heading:'API billing vs a monthly Claude plan',paragraphs:['Compare your expected metered spend with the current first-party plan price, usage limits, included products and terms. A subscription may include access to Claude Code and other features; an API balance pays for API requests and does not establish the same entitlements. This page does not quote a subscription price because those terms can change.','Metered usage can suit occasional or uneven workloads, while a subscription can offer a predictable monthly outlay within its limits. Neither is always cheaper. Start with the token totals from completed tasks and account for caching, retries and human corrections before choosing. KeyoAPI balance rules and eligibility for gift credits are separate from first-party subscription billing.']},
  {heading:'Claude Code gateway compatibility: check before connecting',paragraphs:['Claude Code requires a gateway that serves a supported API format; an OpenAI chat endpoint alone is not a Claude Code setup. KeyoAPI has a POST /v1/messages route, but this page does not claim a verified end-to-end Claude Code connection for the listed IDs.','One successful Messages response is only a first check. Validate the exact model IDs, streaming, tool-use and tool-result turns, and the requests made by your installed Claude Code version before production use. Model routing and any model alias configuration must match the gateway catalog. Do not assume the client’s default model name matches a KeyoAPI ID.','The example below demonstrates the catalog’s OpenAI-compatible chat endpoint. It is not a command to configure Claude Code. Check /brand/keyo-api-ref.html for the endpoint reference.']},
  {heading:'Make a metered chat request with a catalog ID',paragraphs:['Use your API key from the console and the exact model value. This ordinary chat request lets you inspect response usage in your own application; it does not reproduce a multi-turn coding task.'],code:'curl https://www.keyoapi.xyz/v1/chat/completions \\\n  -H "Authorization: Bearer $KEYO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"claude-sonnet-5-5","messages":[{"role":"user","content":"Review this migration plan: add a nullable column, backfill it, validate and enforce the constraint. Identify missing rollback steps."}],"max_tokens":400}\''},
  {heading:'Keep the task within a spending budget',paragraphs:['Track usage for every request, stop after repeated failures, and cap the number of turns and the amount of context your application sends. Measure the cost per accepted result rather than the cost of one answer. If you use a supported client, check its own budget controls and usage reporting as well.','Calls to eligible gift-credit model IDs are billed by usage and consume gift credits under the account rules; they are not zero-cost inference. The bare paid IDs in this page’s examples do not establish gift-credit eligibility. Confirm your balance and model billing rules in the console.']}
 ],
 faqs:[
  {q:'How many tokens does one Claude Code task use?',a:'There is no fixed amount. Repository context, tool results, repeated turns, caching and retries affect billed usage. The 100K input plus 10K output on this page is a stated budget assumption; measure your own completed tasks.'},
  {q:'Which listed model has the lowest token price?',a:'Among the six checked IDs, claude-haiku-5-5 has the lowest default-group input and output rates. That does not establish the lowest cost per accepted coding task or Claude Code compatibility.'},
  {q:'Can I point Claude Code directly at KeyoAPI now?',a:'End-to-end client compatibility is not confirmed by this guide. POST /v1/messages exists, but the selected model route, streaming, tool cycle and client requests need validation. The chat curl shown here is not a Claude Code setup.'},
  {q:'Is a prepaid API balance the same as a Claude subscription?',a:'No. They have different billing, usage limits and product entitlements. Compare the current first-party plan terms with metered usage at the applicable API rates.'},
  {q:'Where are the current Claude API rates?',a:'Use /pricing for the live catalog and /claude-api-pricing for the broader guide. See /pricing-list for model IDs and documented endpoints.'}
 ],
 related:['/claude-api-pricing','/ai-agent-api','/model/claude-sonnet-5-5','/model/claude-opus-5-5','/fable-5-1-vs-opus-5-5','/pricing-list','/compare','/brand/keyo-api-ref.html']
});
const agent=one(content.pages,'slug','ai-agent-api');
upsert(agent.sections,'heading','Use a decision model for explicit routing',{
 heading:'Use a decision model for explicit routing',
 paragraphs:['For bounded routing or triage, /model/cloudflare-clef accepts state plus typed questions and returns choice / noul probabilities through POST /v1/decisions. It does not generate a chat message or execute tools. Your application interprets the probabilities, applies thresholds and decides whether to route, ask for clarification or request human review.','For Claude-class agent budget examples, see /claude-code-api-pricing. The token budget there is an assumption, not a typical session measurement.']
});
if(!agent.related.includes('/model/cloudflare-clef'))agent.related.push('/model/cloudflare-clef');
if(!agent.related.includes('/claude-code-api-pricing'))agent.related.push('/claude-code-api-pricing');
save(contentFile,content);
const batchFile='config/seo/batch2-models.json';
const batch=load(batchFile);
const clef=one(batch.models,'id','cloudflare-clef');
if(clef.modelId!=='cloudflare/clef'||clef.endpoint!=='POST /v1/decisions')throw new Error('Clef protocol changed');
clef.targetKeywords=[...new Set([...clef.targetKeywords,'clef model','clef api','cloudflare clef pricing'])];
clef.related=[...new Set([...clef.related,'claude-sonnet-5-5','claude-opus-5-5'])];
upsert(clef.guideSections,'heading','A decision model alongside a chat agent',{
 heading:'A decision model alongside a chat agent',
 paragraphs:['Use Clef for a defined choice such as account, billing or technical support routing. Your application supplies the candidate labels and decides how to handle low confidence. The returned probabilities are not a guarantee of correctness; evaluate labeled examples and choose thresholds that match the cost of mistakes.','Clef is a Cloudflare decision model, separate from Claude-class chat. See /ai-agent-api for the application execution loop, /claude-api-pricing for chat-model rates and /claude-code-api-pricing for a stated coding-task token budget.']
});
upsert(clef.guideSections,'heading','Read the final charge from usage.cost',{
 heading:'Read the final charge from usage.cost',
 paragraphs:['The response usage.cost is the final KeyoAPI charge in USD, already including the settlement markup. Do not multiply that returned value by 1.5 again. Wallet deductions follow the service’s quota precision; output_tokens is 0 for this decision protocol.','At the starting input rate, 1,000 input tokens would estimate $0.000063. This is arithmetic at the starting rate, not a guaranteed request price or a live inference measurement. Use the returned usage.cost and your console usage records for the actual charge.'],
 code:'{\n  "model": "cloudflare/clef",\n  "usage": {\n    "input_tokens": 1000,\n    "output_tokens": 0,\n    "cost": 0.000063\n  }\n}',
 paragraphsAfter:['This is an illustrative usage fragment, not a captured response; the real response also includes id and answers.']
});
upsert(clef.faqs,'q','Is Clef a Claude model?',{q:'Is Clef a Claude model?',a:'No. cloudflare/clef is a Cloudflare decision model. Use /v1/decisions for typed probabilities; use a chat model for free-form explanations or generation.'});
clef.curlExample=clef.curlExample.replace('Bearer YOUR_API_KEY','Bearer $KEYO_API_KEY');
save(batchFile,batch);
const priceFile='config/seo/pricing-landings.json';
const prices=load(priceFile);
const claude=one(prices.pages,'slug','claude-api-pricing');
claude.guideSections ||= [];
upsert(claude.guideSections,'heading','Claude Code API pricing: budget the full task',{
 heading:'Claude Code API pricing: budget the full task',
 paragraphs:['See /claude-code-api-pricing for exact default-group rates and a worked 100K input / 10K output task budget. The token mix is an explicit assumption, not an average Claude Code session. Compare current subscription terms separately, and verify the supported gateway format before connecting a client.']
});
upsert(claude.guideSections,'heading','A separate decision model for routing',{
 heading:'A separate decision model for routing',
 paragraphs:['For bounded routing, /model/cloudflare-clef is a Cloudflare decision model with POST /v1/decisions. It returns typed probabilities and is not part of the Claude chat price table. An application can use it to classify a request before sending selected work to a chat model; evaluate that routing policy on your own tasks.']
});
save(priceFile,prices);
console.log('Updated cost guide, existing Clef guide and key-based related sections.');
