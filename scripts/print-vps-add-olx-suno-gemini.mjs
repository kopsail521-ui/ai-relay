/**
 * VPS paste: list suno_music_open + gemini TTS/embedding at cost × 2.
 * No git pull, no bash heredoc.
 *   node scripts/print-vps-add-olx-suno-gemini.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

const py = fs.readFileSync(path.join(__dirname, "vps-add-olx-suno-gemini.py"));
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const checkPy = `#!/usr/bin/env python3
import json,re
d=json.load(open("/tmp/pricing.json"))
by={m.get("model_name"):m for m in (d.get("data") or [])}
want=["suno_music_open","gemini-3.1-flash-tts-preview","gemini-embedding-2-preview"]
for n in want:
    m=by.get(n)
    if not m:
        print(n,"MISSING"); continue
    qt=int(m.get("quota_type") or 0)
    if qt==1:
        print(n,"times", m.get("model_price"), "tags", m.get("tags"), "vendor", m.get("vendor_name"))
    else:
        mr=float(m.get("model_ratio") or 0); cr=float(m.get("completion_ratio") or 1)
        print(n,"sell", round(mr*2,6), "/", round(mr*2*cr,6), "tags", m.get("tags"), "vendor", m.get("vendor_name"))
blob=json.dumps(d,ensure_ascii=False)
print("public_leak", bool(re.search(r"unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough|进货|二道|转售", blob, re.I)))
docs=open("/tmp/docs.html",encoding="utf-8",errors="ignore").read()
print("docs_tts", "gemini-3.1-flash-tts-preview" in docs)
print("docs_suno", "suno_music_open" in docs)
print("docs_emb", "gemini-embedding-2-preview" in docs)
guide=open("/tmp/m-suno.html",encoding="utf-8",errors="ignore").read()
print("guide_suno", "suno_music_open" in guide)
print("guide_tts", "gemini-3.1-flash-tts-preview" in open("/tmp/m-tts.html",encoding="utf-8",errors="ignore").read())
print("guide_emb", "gemini-embedding-2-preview" in open("/tmp/m-emb.html",encoding="utf-8",errors="ignore").read())
print("DONE_ADD_OLX_SUNO_GEMINI")
`;
const checkB64 = zlib.gzipSync(Buffer.from(checkPy, "utf8"), { level: 9 }).toString("base64");

const seoList = [
  "static/seo/model/suno_music_open.html",
  "static/seo/model/gemini-3.1-flash-tts-preview.html",
  "static/seo/model/gemini-embedding-2-preview.html",
  "static/seo/compare.html",
  "static/seo/models.html",
  "static/seo/pricing.html",
  "static/seo/index.html",
  "static/seo/tts-api.html",
  "static/seo/gemini-api-pricing.html",
  "static/seo/sitemap.xml",
  "static/seo/sitemap-live.xml",
  "static/brand/keyo-docs.html",
  "new-api/web/public/sitemap.xml",
  "config/model-icon-map.json",
  "services/creem-moderation-proxy/model-icon-map.json",
];
for (const rel of seoList) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error("missing " + rel);
}
const tarPath = path.join(root, "tmp/_olx-suno-gemini-seo.tar.gz");
execSync(`tar -czf "${tarPath}" ${seoList.map((s) => `"${s}"`).join(" ")}`, {
  cwd: root,
  stdio: "pipe",
  shell: true,
});
const tarB64 = fs.readFileSync(tarPath).toString("base64");
if (tarB64.length < 200) throw new Error("tar too small");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts /opt/ai-relay/static/seo/model /opt/ai-relay/static/brand",
  `echo '${pyB64}' | sudo tee /tmp/olx-sg-py.b64 >/dev/null`,
  "base64 -d /tmp/olx-sg-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-olx-suno-gemini.py >/dev/null",
  `echo '${checkB64}' | sudo tee /tmp/olx-sg-check.b64 >/dev/null`,
  "base64 -d /tmp/olx-sg-check.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-check-olx-suno-gemini.py >/dev/null",
  `echo '${tarB64}' | sudo tee /tmp/olx-sg-seo.b64 >/dev/null`,
  "base64 -d /tmp/olx-sg-seo.b64 | sudo tee /tmp/olx-sg-seo.tar.gz >/dev/null",
  "sudo tar -xzf /tmp/olx-sg-seo.tar.gz -C /opt/ai-relay",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:rw -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-add-olx-suno-gemini.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/model-icon-map.json ai-relay-creem-moderation:/app/model-icon-map.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ai-relay-creem-moderation:/app/billing-unit-inject.js",
  "sudo docker restart ai-relay-creem-moderation",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code} ' https://www.keyoapi.xyz/api/pricing",
  "curl -sS -o /tmp/docs.html -w 'docs=%{http_code} ' https://www.keyoapi.xyz/brand/keyo-docs.html",
  "curl -sS -o /tmp/m-suno.html -w 'suno=%{http_code} ' https://www.keyoapi.xyz/model/suno_music_open",
  "curl -sS -o /tmp/m-tts.html -w 'tts=%{http_code} ' https://www.keyoapi.xyz/model/gemini-3.1-flash-tts-preview",
  "curl -sS -o /tmp/m-emb.html -w 'emb=%{http_code} ' https://www.keyoapi.xyz/model/gemini-embedding-2-preview",
  "python3 /opt/ai-relay/scripts/vps-check-olx-suno-gemini.py",
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc leaked");
if (short.includes("\n")) throw new Error("short must be one line");

writeLf(path.join(root, "scripts/vps-add-olx-suno-gemini-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-add-olx-suno-gemini-readme.txt"),
  `# 上架 suno_music_open / gemini-3.1-flash-tts-preview / gemini-embedding-2-preview
# Keyo Primary + Keyo Music；售价=成本×2；标签 音乐 / 语音合成 / rag

粘贴：scripts/vps-add-olx-suno-gemini-short.txt（一整行）
期望：
  suno_music_open times 0.003922 tags 音乐
  gemini-3.1-flash-tts-preview sell 0.4 / 8 tags 语音合成
  gemini-embedding-2-preview sell 0.176472 / 0.705888 tags rag
  public_leak False · DONE_ADD_OLX_SUNO_GEMINI
`
);
console.log({ pyB64: pyB64.length, checkB64: checkB64.length, tarB64: tarB64.length, short: Buffer.byteLength(short) });
