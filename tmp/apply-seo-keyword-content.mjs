import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function update(file, change) {
  const target = path.join(root, file);
  const data = JSON.parse(fs.readFileSync(target, 'utf8'));
  change(data);
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
}
function byKey(items, key, value) {
  const matches = items.filter(item => item[key] === value);
  if (matches.length !== 1) throw new Error(`Expected one ${key}=${value}`);
  return matches[0];
}
update('config/seo/batch2-models.json', data => {
  const sol = byKey(data.models, 'id', 'gpt-6.1-sol');
  sol.targetKeywords = [...new Set([...sol.targetKeywords, 'gpt 6.1 sol pricing', 'gpt sol 6.1', '6.1 sol vs 6 astra'])];
  sol.guideSections = [
    {
      heading: 'GPT 6.1 Sol pricing and a request-cost example',
      paragraphs: [
        'The public KeyoAPI catalog checked on 2026-10-13 lists default-group rates of $0.3677 per million input tokens and $1.8385 per million output tokens. These are KeyoAPI sell rates, not official OpenAI list prices. Other billing groups can apply a multiplier; confirm your active group and current rates on /pricing.',
        'For 10,000 input tokens and 2,000 output tokens, the ordinary token estimate is 0.01 × $0.3677 + 0.002 × $1.8385 = $0.007354. A thousand requests with that identical mix total about $7.354 before retries, cached-token adjustments or extra modalities. Use actual response usage when calculating a production budget.'
      ]
    },
    {
      heading: 'GPT-6.1 Sol vs GPT-6 Astra',
      paragraphs: [
        'Astra lists $1.8385 input and $9.1925 output per million tokens in the checked default group. Sol therefore costs one fifth as much per input or output token. The same 10,000-input and 2,000-output example costs $0.036770 on Astra. The complete table and evaluation checklist are on /gpt-6-1-sol-vs-gpt-6-astra.',
        'Choose using accepted task results, not the model names alone. Compare identical prompts, correctness, latency, output lengths and retries. Start a Sol evaluation on routine chat or structured work, then test Astra on cases that fail your acceptance checks. Higher unit prices do not by themselves prove better coding or reasoning quality.'
      ]
    },
    {
      heading: 'Use the exact Sol model ID',
      paragraphs: [
        'GPT Sol 6.1 and GPT 6.1 Sol refer to gpt-6.1-sol in this catalog. Pass that exact ID to POST /v1/chat/completions; the words in a search phrase are not interchangeable API aliases. Check optional tool, streaming and context behavior on the channel you use before depending on those features.',
        'For an application workflow see /ai-agent-api, /ai-story-api or /study-ai-api. For a broader GPT-class token table see /openai-api-pricing. These examples use the bare paid model ID; gift-credit eligibility is tied to eligible gift-credit IDs rather than automatically applied to every chat model.'
      ]
    }
  ];
  sol.faqs.push({q: 'What does GPT 6.1 Sol cost?', a: 'At the checked default-group rate: $0.3677 per million input tokens and $1.8385 per million output tokens. Check /pricing for your current group and rates. See /gpt-6-1-sol-vs-gpt-6-astra for a worked cost comparison.'});
  const opus = byKey(data.models, 'id', 'claude-opus-5-5');
  opus.targetKeywords = [...new Set([...opus.targetKeywords, 'opus5.5', 'fable 5.1 vs opus 5.5', 'opus 5.5 vs fable 5.1'])];
  opus.related = [...new Set([...opus.related, 'claude-fable-5-1'])];
  opus.guideSections = [
    {
      heading: 'Opus 5.5 pricing by input and output tokens',
      paragraphs: [
        'The public KeyoAPI catalog checked on 2026-10-13 lists default-group rates of $1.7647 per million input tokens and $8.8235 per million output tokens. These are KeyoAPI sell rates, not Anthropic official list prices. Confirm current rates and your billing-group multiplier in /pricing.',
        'A request with 10,000 input tokens and 2,000 output tokens costs about $0.035294 before retries, cached-token adjustments or extra modalities. A thousand requests with that identical mix cost about $35.294. For agent sessions, count tokens across every model turn and repeated context rather than only the final answer.'
      ]
    },
    {
      heading: 'Fable 5.1 vs Opus 5.5',
      paragraphs: [
        'claude-fable-5-1 lists $7.3530 input and $36.7650 output per million tokens in the checked default group, about 4.17 times the Opus rate. The same example costs $0.147060 on Fable. /fable-5-1-vs-opus-5-5 covers both comparison word orders with one table and one evaluation checklist.',
        'Test both models on the same coding or agent tasks with the same context, tools and execution budget. Compare passing tests, completed tasks, human corrections and total cost including retries. Use measured results to decide when a higher-cost candidate is worth routing to; this guide does not claim a universal performance ranking.'
      ]
    },
    {
      heading: 'Call opus5.5 through the chat API',
      paragraphs: [
        'The shorthand opus5.5 maps to claude-opus-5-5 in this guide. Keep the exact catalog ID in your request. Both Opus and Fable currently advertise the OpenAI-compatible chat route; verify advanced tool and streaming behavior before deploying it.',
        'Use /ai-agent-api for a bounded application loop and /claude-api-pricing for the broader Claude-class rate table. Your application executes tools and checks results; a chat response does not run the agent workflow by itself.'
      ]
    }
  ];
  opus.faqs.push({q: 'Is opus5.5 the API model ID?', a: 'Use claude-opus-5-5 as the model value. opus5.5 is a shorthand label, not the exact catalog ID. See /fable-5-1-vs-opus-5-5 to compare it with claude-fable-5-1.'});
});
update('config/seo/pricing-landings.json', data => {
  const openai = byKey(data.pages, 'slug', 'openai-api-pricing');
  if (!openai.rows.some(row => row.model === 'gpt-6.1-sol')) {
    const astraIndex = openai.rows.findIndex(row => row.model === 'gpt-6-astra');
    if (astraIndex < 0) throw new Error('Astra row missing');
    openai.rows.splice(astraIndex, 0, {
      model: 'gpt-6.1-sol',
      official: 'KeyoAPI catalog ID; check first-party documentation separately for official naming and list rates',
      keyo: '~$0.37 / $1.84 per 1M in/out',
      note: 'Sol default-group token rate is one fifth of Astra · /model/gpt-6.1-sol'
    });
  }
  openai.guideSections = [{heading: 'GPT 6.1 Sol pricing and Sol vs Astra', paragraphs: ['gpt-6.1-sol lists $0.3677 input and $1.8385 output per million tokens in the default group checked on 2026-10-13. A 10,000-input and 2,000-output request is about $0.007354 before retries and extra charges. See /model/gpt-6.1-sol for the model guide and /gpt-6-1-sol-vs-gpt-6-astra for the complete side-by-side table. Test accepted results on your own workload before deciding which tier to use.']}];
  const claude = byKey(data.pages, 'slug', 'claude-api-pricing');
  byKey(claude.rows, 'model', 'claude-opus-5-5');
  byKey(claude.rows, 'model', 'claude-fable-5-1');
  claude.guideSections = [{heading: 'Opus 5.5 vs Fable 5.1', paragraphs: ['At the default-group rates checked on 2026-10-13, claude-opus-5-5 lists $1.7647 / $8.8235 per million input/output tokens and claude-fable-5-1 lists $7.3530 / $36.7650. Fable tokens cost about 4.17 times as much. See /fable-5-1-vs-opus-5-5 for the request-cost calculation and coding or agent evaluation checklist. The Opus model guide is /model/claude-opus-5-5.']}];
  const gemini = byKey(data.pages, 'slug', 'gemini-api-pricing');
  byKey(gemini.rows, 'model', 'gemini-4-argon');
  byKey(gemini.rows, 'model', 'gemini-4-barium');
  gemini.guideSections = [{heading: 'Gemini 4 API: Argon and Barium', paragraphs: ['The Gemini 4 family entry is /gemini-4-api. It links to /model/gemini-4-argon and /model/gemini-4-barium, both already listed in /models. Use one of those exact model IDs for POST /v1/chat/completions. The checked default-group rates are $0.7353 input and $3.6765 output per million tokens for either ID. A bare gemini-4 is a family label, not a model listed in the checked catalog.']}];
});
console.log('Updated Sol, Opus and three brand hubs by model ID or page slug.');
