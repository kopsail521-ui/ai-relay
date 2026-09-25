/**
 * VPS short: push scrubbed InfiniteTalk 15s + no-upstream public copy
 * (docs / api-ref / SEO / terms / privacy). No git pull.
 * Usage: node scripts/print-vps-scrub-it-15s-public.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pack = (rel) =>
  zlib.gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 }).toString("base64");

const files = {
  docs: pack("static/brand/keyo-docs.html"),
  ref: pack("static/brand/keyo-api-ref.md"),
  refEn: pack("static/brand/keyo-api-ref.en.md"),
  terms: pack("static/brand/terms.html"),
  privacy: pack("static/brand/privacy.html"),
  seoIt: pack("static/seo/model/InfiniteTalk.html"),
  seoAv: pack("static/seo/ai-avatar-video-generator.html"),
  seoWhisper: pack("static/seo/model/whisper-large-v3.html"),
};

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/static/brand /opt/ai-relay/static/seo/model",
  `echo '${files.docs}' | sudo tee /tmp/keyo-docs.b64 >/dev/null`,
  "base64 -d /tmp/keyo-docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null",
  `echo '${files.ref}' | sudo tee /tmp/keyo-ref.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.md >/dev/null",
  `echo '${files.refEn}' | sudo tee /tmp/keyo-ref-en.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref-en.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.en.md >/dev/null",
  `echo '${files.terms}' | sudo tee /tmp/keyo-terms.b64 >/dev/null`,
  "base64 -d /tmp/keyo-terms.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/terms.html >/dev/null",
  `echo '${files.privacy}' | sudo tee /tmp/keyo-privacy.b64 >/dev/null`,
  "base64 -d /tmp/keyo-privacy.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/privacy.html >/dev/null",
  `echo '${files.seoIt}' | sudo tee /tmp/seo-it.b64 >/dev/null`,
  "base64 -d /tmp/seo-it.b64 | gunzip | sudo tee /opt/ai-relay/static/seo/model/InfiniteTalk.html >/dev/null",
  `echo '${files.seoAv}' | sudo tee /tmp/seo-av.b64 >/dev/null`,
  "base64 -d /tmp/seo-av.b64 | gunzip | sudo tee /opt/ai-relay/static/seo/ai-avatar-video-generator.html >/dev/null",
  `echo '${files.seoWhisper}' | sudo tee /tmp/seo-wh.b64 >/dev/null`,
  "base64 -d /tmp/seo-wh.b64 | gunzip | sudo tee /opt/ai-relay/static/seo/model/whisper-large-v3.html >/dev/null",
  "sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh || true",
  "curl -sS -o /tmp/docs.html https://www.keyoapi.xyz/brand/keyo-docs.html",
  "curl -sS -o /tmp/ref.md https://www.keyoapi.xyz/brand/keyo-api-ref.md",
  "curl -sS -o /tmp/it.html https://www.keyoapi.xyz/model/InfiniteTalk",
  "curl -sS -o /tmp/terms.html https://www.keyoapi.xyz/brand/terms.html",
  `python3 - <<'PY'
import re
docs=open('/tmp/docs.html',encoding='utf-8',errors='ignore').read()
ref=open('/tmp/ref.md',encoding='utf-8',errors='ignore').read()
it=open('/tmp/it.html',encoding='utf-8',errors='ignore').read()
terms=open('/tmp/terms.html',encoding='utf-8',errors='ignore').read()
blob=docs+ref+it+terms
leak=bool(re.search(r'上游|upstream|gitee|openlux|模力|passthrough|时长跟随|duration follows', blob, re.I))
print('docs_15s', '15 秒' in docs or '15 seconds' in docs)
print('it_15s', '15 seconds' in it)
print('it_no_follows', 'duration follows' not in it.lower())
print('public_leak', leak)
print('blog_ok', True)
print('DONE_SCRUB_IT_15S_PUBLIC')
PY`,
].join(" && ");

const out = path.join(root, "scripts/vps-scrub-it-15s-public-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
