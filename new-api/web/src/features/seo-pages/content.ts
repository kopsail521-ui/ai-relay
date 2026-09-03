/*
Copyright (C) 2023-2026 QuantumNous
*/

export type SeoPageContent = {
  slug: string
  title: string
  description: string
  h1: string
  intro: string
  sections: Array<{ heading: string; body: string; code?: string }>
  relatedLinks: Array<{ label: string; href: string }>
}

const BASE = 'https://www.keyoapi.xyz/v1'

export const INTEGRATION_PAGES: Record<string, SeoPageContent> = {
  python: {
    slug: 'python',
    title: 'Python OpenAI Compatible API - KeyoAPI',
    description:
      'Use KeyoAPI as an OpenAI-compatible API in Python. Change the base URL and call Claude, Gemini, DeepSeek and more with the official OpenAI SDK.',
    h1: 'Python OpenAI Compatible API',
    intro:
      'Point the official OpenAI Python SDK at KeyoAPI to access multiple AI models through one OpenAI-compatible endpoint.',
    sections: [
      {
        heading: 'Install the SDK',
        body: 'Use the standard openai package — no custom client required.',
        code: 'pip install openai',
      },
      {
        heading: 'Configure base URL and API key',
        body: 'Set your KeyoAPI key and override the base URL. All chat/completions calls stay OpenAI-compatible.',
        code: `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_KEYOAPI_KEY",
    base_url="${BASE}",
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`,
      },
      {
        heading: 'Switch models without changing code',
        body: 'Change the model parameter to call Claude, Gemini, DeepSeek or other models in the catalog. Same request format, same SDK.',
      },
    ],
    relatedLinks: [
      { label: 'Browse models', href: '/pricing' },
      { label: 'Node.js integration', href: '/integrations/nodejs' },
      { label: 'Documentation', href: '/docs' },
    ],
  },
  nodejs: {
    slug: 'nodejs',
    title: 'Node.js OpenAI Compatible API - KeyoAPI',
    description:
      'Connect Node.js apps to multiple AI models with the OpenAI SDK. Set a custom base URL to use KeyoAPI as your unified API gateway.',
    h1: 'Node.js OpenAI Compatible API',
    intro:
      'Use the OpenAI Node.js SDK with a custom base URL to call multiple models through KeyoAPI.',
    sections: [
      {
        heading: 'Install',
        code: 'npm install openai',
        body: '',
      },
      {
        heading: 'Client setup',
        body: 'Pass baseURL and apiKey to the OpenAI constructor.',
        code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.KEYOAPI_KEY,
  baseURL: "${BASE}",
});

const completion = await client.chat.completions.create({
  model: "claude-sonnet-4",
  messages: [{ role: "user", content: "Hello!" }],
});`,
      },
    ],
    relatedLinks: [
      { label: 'Python integration', href: '/integrations/python' },
      { label: 'OpenAI SDK guide', href: '/integrations/openai-sdk' },
      { label: 'Model catalog', href: '/pricing' },
    ],
  },
  cursor: {
    slug: 'cursor',
    title: 'Cursor Custom OpenAI API - KeyoAPI',
    description:
      'Configure Cursor IDE to use KeyoAPI as a custom OpenAI-compatible API. One API key for multiple models in your editor.',
    h1: 'Cursor Custom OpenAI API',
    intro:
      'Point Cursor at KeyoAPI to use multiple AI models with a familiar OpenAI-compatible interface inside the editor.',
    sections: [
      {
        heading: 'Open Cursor settings',
        body: 'Go to Settings → Models (or Cursor Settings → API Keys) and choose Override OpenAI Base URL.',
      },
      {
        heading: 'Enter KeyoAPI credentials',
        body: 'Set the base URL and paste your KeyoAPI key. Use model names from the KeyoAPI catalog.',
        code: `Base URL: ${BASE}
API Key: YOUR_KEYOAPI_KEY
Model: (choose from /models)`,
      },
      {
        heading: 'Troubleshooting',
        body: 'If Cursor custom API is not working, verify the base URL ends with /v1, the key is active, and the model name exists in your account group.',
      },
    ],
    relatedLinks: [
      { label: 'Continue.dev setup', href: '/integrations/continue-dev' },
      { label: 'OpenAI SDK base URL', href: '/integrations/openai-sdk' },
      { label: 'Browse models', href: '/pricing' },
    ],
  },
  'continue-dev': {
    slug: 'continue-dev',
    title: 'Continue.dev OpenAI Compatible API - KeyoAPI',
    description:
      'Use KeyoAPI with Continue.dev by setting a custom OpenAI-compatible base URL and API key.',
    h1: 'Continue.dev Integration',
    intro:
      'Continue supports custom OpenAI-compatible providers. Configure KeyoAPI in your config.json.',
    sections: [
      {
        heading: 'config.json example',
        body: 'Add a models entry with apiBase and apiKey pointing to KeyoAPI.',
        code: `{
  "models": [{
    "title": "KeyoAPI",
    "provider": "openai",
    "model": "gpt-4o",
    "apiBase": "${BASE}",
    "apiKey": "YOUR_KEYOAPI_KEY"
  }]
}`,
      },
    ],
    relatedLinks: [
      { label: 'Cursor integration', href: '/integrations/cursor' },
      { label: 'Documentation', href: '/docs' },
    ],
  },
  'openai-sdk': {
    slug: 'openai-sdk',
    title: 'OpenAI SDK Custom Base URL - KeyoAPI',
    description:
      'How to change OpenAI base URL to use KeyoAPI as an OpenAI-compatible API gateway for multiple AI models.',
    h1: 'OpenAI SDK Custom Base URL',
    intro:
      'Any client that supports OpenAI SDK custom base URL can connect to KeyoAPI. Replace api.openai.com with your KeyoAPI endpoint.',
    sections: [
      {
        heading: 'Universal pattern',
        body: 'The only change is base_url / baseURL / OPENAI_BASE_URL — keep the same request schema.',
        code: `Base URL: ${BASE}
Authorization: Bearer YOUR_KEYOAPI_KEY`,
      },
      {
        heading: 'Supported endpoints',
        body: 'Chat completions, embeddings, image generation, speech-to-text and text-to-speech where available per model. See /models for capabilities and pricing.',
      },
      {
        heading: 'Call Claude or Gemini with OpenAI SDK',
        body: 'Set model to a catalog slug (e.g. claude-sonnet-4, gemini-2.5-flash). KeyoAPI translates the OpenAI-compatible request to the upstream provider.',
      },
    ],
    relatedLinks: [
      { label: 'Python', href: '/integrations/python' },
      { label: 'Node.js', href: '/integrations/nodejs' },
      { label: 'Model catalog', href: '/pricing' },
    ],
  },
}

export const USE_CASE_PAGES: Record<string, SeoPageContent> = {
  'image-generation': {
    slug: 'image-generation',
    title: 'OpenAI Compatible Image Generation API - KeyoAPI',
    description:
      'Generate images through an OpenAI-compatible API. Access multiple image models with one API key and unified billing.',
    h1: 'OpenAI Compatible Image Generation API',
    intro:
      'Use standard OpenAI image endpoints against KeyoAPI to generate images from multiple providers.',
    sections: [
      {
        heading: 'Example request',
        code: `curl ${BASE}/images/generations \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "dall-e-3", "prompt": "A minimal logo", "n": 1, "size": "1024x1024"}'`,
        body: 'Check /models for available image models and per-image pricing.',
      },
    ],
    relatedLinks: [
      { label: 'Browse image models', href: '/pricing' },
      { label: 'Python integration', href: '/integrations/python' },
    ],
  },
  'speech-to-text': {
    slug: 'speech-to-text',
    title: 'OpenAI Compatible Speech to Text API - KeyoAPI',
    description:
      'Transcribe audio with an OpenAI-compatible speech-to-text API. One endpoint, multiple models.',
    h1: 'OpenAI Compatible Speech to Text API',
    intro:
      'Use /v1/audio/transcriptions with KeyoAPI for speech-to-text where supported by catalog models.',
    sections: [
      {
        heading: 'Example',
        code: `curl ${BASE}/audio/transcriptions \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -F file=@audio.mp3 \\
  -F model=whisper-1`,
        body: 'See /models for STT-capable models and pricing.',
      },
    ],
    relatedLinks: [
      { label: 'Text to speech', href: '/use-cases/text-to-speech' },
      { label: 'Documentation', href: '/docs' },
    ],
  },
  'text-to-speech': {
    slug: 'text-to-speech',
    title: 'OpenAI Compatible Text to Speech API - KeyoAPI',
    description:
      'Convert text to speech through an OpenAI-compatible API gateway with unified billing.',
    h1: 'OpenAI Compatible Text to Speech API',
    intro:
      'Use /v1/audio/speech with models listed in the KeyoAPI catalog.',
    sections: [
      {
        heading: 'Example',
        code: `curl ${BASE}/audio/speech \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "tts-1", "input": "Hello world", "voice": "alloy"}' \\
  --output speech.mp3`,
        body: 'Available voices and models vary — check /models for details.',
      },
    ],
    relatedLinks: [
      { label: 'Speech to text', href: '/use-cases/speech-to-text' },
      { label: 'Browse models', href: '/pricing' },
    ],
  },
}

export const INTEGRATION_SLUGS = Object.keys(INTEGRATION_PAGES)
export const USE_CASE_SLUGS = Object.keys(USE_CASE_PAGES)
