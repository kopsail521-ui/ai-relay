import fs from 'node:fs';
import path from 'node:path';

const DIR = 'tmp/geo-bodies';
const OUT = 'blog-inbox';

// slug -> { title, excerpt, anchor, linkSentence }
const ARTICLES = {
  '1gger7hd': {
    title: 'OpenAI API Python Structured Output: Validation Patterns for Backends',
    excerpt: 'Learn how to build reliable Python backends around OpenAI-style structured output: parse safely, validate schemas, handle retries, migrate compatible integrations, and discover live model availability.',
    anchor: 'for high-impact decisions.',
    linkSentence: ' Confirm live model availability and rates on the <a href="/openai-api-pricing">OpenAI API pricing page</a> before choosing a model for production.',
  },
  '1y1kuuoj': {
    title: 'Gemini API Key Error 429: Diagnosis and Retry Strategy',
    excerpt: 'Learn how to diagnose Gemini API 429 errors, verify Bearer authentication, migrate to an OpenAI-compatible endpoint, and build reliable production checks for API keys and model availability.',
    anchor: 'before changing traffic patterns.',
    linkSentence: ' Check the <a href="/gemini-api-pricing">Gemini API pricing page</a> and the <a href="/model/gemini-3.8-flash">gemini-3.8-flash model page</a> for current rates and limits.',
  },
  '2o2w88ar': {
    title: 'AI Avatar Video Generator API: Queue, Retry, and Webhook Design',
    excerpt: 'Learn how to build a reliable AI avatar video generator API workflow with asynchronous queues, retries, signed webhooks, idempotency, error handling, and production cost controls.',
    anchor: 'workflow remains replaceable.',
    linkSentence: ' For the supported models and a production checklist, see the <a href="/ai-avatar-video-generator">AI avatar video generator API guide</a> and the <a href="/model/Duix-Avatar">Duix-Avatar model page</a>.',
  },
  '45717fli': {
    title: 'Claude API Connection Closed Mid-Response: Detecting and Recovering Incomplete Output',
    excerpt: 'Learn how to detect incomplete Claude API responses, safely retry or resume generation, preserve partial output, and evaluate migration alternatives without corrupting production data.',
    anchor: 'not whether some text was received.',
    linkSentence: ' Confirm current Claude rates and model availability on the <a href="/claude-api-pricing">Claude API pricing page</a> and the <a href="/model/claude-sonnet-5">claude-sonnet-5 model page</a>.',
  },
  '62c44nq0': {
    title: 'Gemini API Rate Limit Exceeded: Queue and Backoff Design',
    excerpt: 'Learn how to handle Gemini API rate limits with queues, exponential backoff, jitter, bounded retries, authentication, observability, and provider-agnostic migration patterns.',
    anchor: 'before treating an alternative as production-compatible.',
    linkSentence: ' Live Gemini rates and model availability are on the <a href="/gemini-api-pricing">Gemini API pricing page</a> and the <a href="/model/gemini-3.8-flash">gemini-3.8-flash model page</a>.',
  },
  '7tw9n0ql': {
    title: 'Gemini API Rate Limits Tier 1: Capacity Planning Without Assumptions',
    excerpt: 'Learn how to plan around Gemini API Tier 1 rate limits using measured traffic, explicit backpressure, retries, provider-agnostic interfaces, and production capacity tests.',
    anchor: 'rather than an emergency rewrite.',
    linkSentence: ' Confirm live rates on the <a href="/gemini-api-pricing">Gemini API pricing page</a> and check the <a href="/model/gemini-3.8-flash">gemini-3.8-flash model page</a> for availability.',
  },
  '9lvxpssw': {
    title: 'Gemini Video Generation Model API: What to Verify Before Integration',
    excerpt: 'Learn how to evaluate a Gemini video generation API integration, compare alternatives safely, and design a provider-agnostic production workflow covering models, jobs, security, retries, cost, and migration.',
    anchor: 'will generate video.',
    linkSentence: ' See the <a href="/gemini-api-pricing">Gemini API pricing page</a> for live rates and model availability.',
  },
  'axc6qmip': {
    title: 'OpenAI API Rate Limits: Measuring and Scheduling Production Traffic',
    excerpt: 'Learn how OpenAI API rate limits behave in production: measure limits, schedule traffic, bound retries, protect credentials, and evaluate alternatives without assuming compatibility.',
    anchor: 'model, or provider changes.',
    linkSentence: ' Live rates are on the <a href="/openai-api-pricing">OpenAI API pricing page</a>.',
  },
  'cu1coapk': {
    title: 'Claude API Prompt Caching: When It Helps and What to Verify',
    excerpt: 'Learn how to evaluate Claude API prompt caching, verify provider semantics, and design a migration workflow that measures cache hits, latency, and cost without assuming compatibility.',
    anchor: 'before committing to the migration.',
    linkSentence: ' For live Claude rates and availability, see the <a href="/claude-api-pricing">Claude API pricing page</a> and the <a href="/model/claude-sonnet-5">claude-sonnet-5 model page</a>.',
  },
  'dxp8cdop': {
    title: 'AI Avatar API Python Example: Server-Side Job Polling and Errors',
    excerpt: 'Learn how to structure a Python backend for an AI avatar API: submit jobs, poll safely, handle errors and retries, and protect credentials and costs.',
    anchor: 'around the operations it actually supports.',
    linkSentence: ' See the <a href="/ai-avatar-video-generator">AI avatar video generator API guide</a> and the <a href="/model/Duix-Avatar">Duix-Avatar model page</a> for the supported avatar operations.',
  },
  'jnv30sj3': {
    title: 'OpenAI API Image Generation and Speech-to-Text: What to Verify Before Production',
    excerpt: 'Learn how to verify OpenAI-compatible image generation and speech-to-text integrations: endpoint compatibility, model availability, response formats, retries, and production checks.',
    anchor: 'if the verified production behavior changes.',
    linkSentence: ' Confirm live rates on the <a href="/openai-api-pricing">OpenAI API pricing page</a> before committing volume.',
  },
  'jnyu9un7': {
    title: 'Remove.bg API Alternative: Evaluating a KeyoAPI Migration',
    excerpt: 'Learn how to evaluate a remove.bg API alternative: compare authentication, multipart upload behavior, model selection, response handling, retries, and production migration steps.',
    anchor: 'against the current endpoint and pricing information.',
    linkSentence: ' For a full comparison, see the <a href="/remove-bg-api-alternative">remove.bg API alternative guide</a> and the <a href="/model/RMBG-2.0">RMBG-2.0 model page</a>.',
  },
  'n7allrtc': {
    title: 'Claude Vision API Pricing: Measuring Real Image Costs',
    excerpt: 'Learn how to estimate Claude vision API costs from real image distributions, and verify model catalog, pricing, and vision behavior before migrating.',
    anchor: 'before making compatibility or savings assumptions.',
    linkSentence: ' Live Claude vision rates are on the <a href="/claude-api-pricing">Claude API pricing page</a>, and the <a href="/model/claude-sonnet-5">claude-sonnet-5 model page</a> covers the model\u2019s vision behavior.',
  },
  'ooy10bjn': {
    title: 'Gemini API Rate Limit Reset Time: Designing Safe Retries',
    excerpt: 'Learn why Gemini API rate limits do not have one universal reset time and how to build provider-agnostic retry, backoff, quota, and fallback logic for production systems.',
    anchor: 'does not become a production incident.',
    linkSentence: ' Check the <a href="/gemini-api-pricing">Gemini API pricing page</a> and the <a href="/model/gemini-3.8-flash">gemini-3.8-flash model page</a> for current rates and availability.',
  },
  'oyu8kdbq': {
    title: 'Alpha PNG Background Removal: Transparent Output Validation',
    excerpt: 'Learn how to validate alpha PNG output from a background removal API: multipart uploads, authentication, model selection, transparent PNG handling, request validation, and retries.',
    anchor: 'before putting the integration into production.',
    linkSentence: ' See the <a href="/model/RMBG-2.0">RMBG-2.0 model page</a> and the <a href="/remove-bg-api-alternative">remove.bg API alternative</a> for current availability.',
  },
  'qbfzdawk': {
    title: 'OpenAI API 401 Error: Incorrect API Key Troubleshooting',
    excerpt: 'Learn how to diagnose OpenAI API 401 errors, verify Bearer authentication, migrate to an OpenAI-compatible endpoint, and build reliable production checks for API keys and model availability.',
    anchor: 'models, endpoints, and service policies change.',
    linkSentence: ' Confirm live rates on the <a href="/openai-api-pricing">OpenAI API pricing page</a>.',
  },
  'tvdqdo7z': {
    title: 'Claude API Tool Use: Input Validation and Portable Tool Design',
    excerpt: 'Learn how to validate Claude tool inputs, keep tool execution secure, and design a provider-neutral tool layer that can be evaluated when migrating to another API.',
    anchor: 'migrate with evidence rather than assumptions.',
    linkSentence: ' Confirm Claude model availability and rates on the <a href="/claude-api-pricing">Claude API pricing page</a> and the <a href="/model/claude-sonnet-5">claude-sonnet-5 model page</a>.',
  },
  'ur3fw22w': {
    title: 'Bulk Background Removal API for E-Commerce Product Catalogs',
    excerpt: 'Learn how to run bulk background removal on e-commerce product catalogs: batching, alpha output validation, retries, cost control, and pipeline design.',
    anchor: 'before scheduling a large catalog batch.',
    linkSentence: ' See the <a href="/model/RMBG-2.0">RMBG-2.0 model page</a> and the <a href="/remove-bg-api-alternative">remove.bg API alternative</a> for current details.',
  },
  'vv4t8krr': {
    title: 'OpenAI API Rate Limit: What It Means and How to Respond',
    excerpt: 'Learn how to respond to OpenAI API rate limits: classify failures, bound retries, protect credentials, measure cost, and adapt to changing model availability.',
    anchor: 'to an OpenAI-compatible service.',
    linkSentence: ' Confirm live rates on the <a href="/openai-api-pricing">OpenAI API pricing page</a>.',
  },
};

// artifact fixes: slug -> [[search, replace], ...] (applied before link insert)
const ARTIFACTS = {
  'n7allrtc': [
    ['PROVIDER=.', 'PROVIDER=your_provider_name'],
    ['API_BASE_URL=.', 'API_BASE_URL=https://api.your-provider.com/v1'],
    ['API_KEY=.', 'API_KEY=your_api_key'],
    ['MODEL_ID=.', 'MODEL_ID=claude-sonnet-5'],
    ['REQUEST_TIMEOUT_SECONDS=.', 'REQUEST_TIMEOUT_SECONDS=60'],
    ['MAX_RETRIES=.', 'MAX_RETRIES=3'],
  ],
  'jnyu9un7': [
    ['--output./output.png', '--output ./output.png'],
  ],
  'axc6qmip': [
    ['1.maximum_attempts', '1..maximum_attempts'],
  ],
  'cu1coapk': [
    ['current_context baseline_response = call_model(', 'current_context\nbaseline_response = call_model('],
    [') cached_response = call_model(', ')\ncached_response = call_model('],
    [') record( latency', ')\nrecord( latency'],
    ['current documentation do <strong>not</strong> verify', 'The current documentation does <strong>not</strong> verify'],
  ],
};

let ok = 0;
let fail = 0;
for (const [slug, cfg] of Object.entries(ARTICLES)) {
  const src = path.join(DIR, slug + '.html');
  const body = fs.readFileSync(src, 'utf8');
  let text = body;

  // 1) artifact fixes
  for (const [search, replace] of (ARTIFACTS[slug] || [])) {
    if (!text.includes(search)) {
      console.log(`FAIL ${slug}: artifact not found: ${JSON.stringify(search.slice(0, 60))}`);
      fail++;
    } else {
      text = text.split(search).join(replace);
    }
  }

  // 2) link insertion at end of last paragraph
  const anchor = cfg.anchor;
  const idx = text.lastIndexOf(anchor);
  if (idx < 0) {
    console.log(`FAIL ${slug}: anchor not found: ${JSON.stringify(anchor)}`);
    fail++;
  } else {
    text = text.slice(0, idx + anchor.length) + cfg.linkSentence + text.slice(idx + anchor.length);
  }

  // 3) wrap fragment
  const fragment = `<!-- TITLE: ${cfg.title} -->\n<!-- EXCERPT: ${cfg.excerpt} -->\n${text.trim()}\n`;
  fs.writeFileSync(path.join(OUT, slug + '.html'), fragment);
  ok++;
  console.log(`OK   ${slug}: len=${text.length}`);
}
console.log(`\nDONE ok=${ok} fail=${fail}`);