import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = path.join(root, "scripts/gen-seo-pages.mjs");
let s = fs.readFileSync(p, "utf8");

const fn = `/** Brand-aware related links — avoid one TTS boilerplate on every LLM hub. */
function landingRelatedLinks(slug) {
  const base =
    '<a href="/compare">/compare</a>, <a href="/free-models">/free-models</a>, <a href="/pricing-list">/pricing-list</a>';
  const bySlug = {
    "tts-api":
      \`\${base}, and <a href="/model/CosyVoice3">CosyVoice3 API</a> · <a href="/voice-cloning-api">Voice cloning</a> · <a href="/model/IndexTTS-2">IndexTTS-2</a>\`,
    "voice-cloning-api":
      \`\${base}, and <a href="/tts-api">TTS API</a> · <a href="/model/CosyVoice3">CosyVoice3</a> · <a href="/model/Qwen3-TTS">Qwen3-TTS</a>\`,
    "ai-avatar-video-generator":
      \`\${base}, and <a href="/model/Duix-Avatar">Duix Avatar</a> · <a href="/model/InfiniteTalk">InfiniteTalk</a> · <a href="/tts-api">TTS API</a>\`,
    "remove-bg-api-alternative":
      \`\${base}, and <a href="/model/RMBG-2.0">RMBG-2.0</a> · <a href="/model/sam3">sam3</a>\`,
    "gemini-api-pricing":
      \`\${base}, and <a href="/model/gemini-3.8-flash">gemini-3.8-flash</a> · <a href="/model/gemini-3.7-flash">gemini-3.7-flash</a>\`,
    "grok-api-pricing":
      \`\${base}, and <a href="/model/grok-4.7">grok-4.7</a> · <a href="/model/grok-4.6">grok-4.6</a>\`,
    "deepseek-api-pricing":
      \`\${base}, and <a href="/model/deepseek-v4.1-flash">deepseek-v4.1-flash</a> · <a href="/model/deepseek-v4-pro-0813">deepseek-v4-pro-0813</a>\`,
    "claude-api-pricing":
      \`\${base}, and <a href="/model/claude-sonnet-5">claude-sonnet-5</a> · <a href="/model/claude-opus-5">claude-opus-5</a>\`,
    "openai-api-pricing":
      \`\${base}, and <a href="/model/gpt-6-astra">gpt-6-astra</a> · <a href="/model/gpt-5.6-luna">gpt-5.6-luna</a>\`,
  };
  const links = bySlug[slug] || \`\${base}, and <a href="/tts-api">TTS API</a> · <a href="/ai-avatar-video-generator">Avatar video</a>\`;
  return \`<p class="meta">Also see \${links}.</p>\`;
}

`;

const marker = "function renderPricingLanding(p) {";
if (!s.includes("function landingRelatedLinks(slug)")) {
  if (!s.includes(marker)) throw new Error("marker missing");
  s = s.replace(marker, fn + marker);
}

const old = `<p class="meta">Also see <a href="/compare">/compare</a>, <a href="/free-models">/free-models</a>, and <a href="/model/CosyVoice3">CosyVoice3 API</a> · <a href="/tts-api">TTS API</a> · <a href="/model/deepseek-v4-flash">DeepSeek V4 Flash</a> · <a href="/model/kimi-k3">Kimi K3</a> · <a href="/model/Duix-Avatar">Duix Avatar</a>.</p>`;
const neu = "${landingRelatedLinks(p.slug)}";
if (!s.includes(old)) throw new Error("footer block missing");
s = s.replace(old, neu);

fs.writeFileSync(p, s);
console.log("patched", p);
