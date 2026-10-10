/**
 * VPS paste: list gemini-3.8-flash-tts on Keyo Primary at cost x 2.
 * No git pull, no bash heredoc.
 *   node scripts/print-vps-add-gemini-3.8-flash-tts.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-add-gemini-3.8-flash-tts.py"));
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const checkPy = `#!/usr/bin/env python3
import json,re
d=json.load(open("/tmp/pricing.json"))
by={m.get("model_name"):m for m in (d.get("data") or [])}
m=by.get("gemini-3.8-flash-tts")
if not m:
    print("gemini-3.8-flash-tts MISSING")
    raise SystemExit(1)
qt=int(m.get("quota_type") or 0)
if qt==1:
    print("gemini-3.8-flash-tts times", m.get("model_price"), "tags", m.get("tags"), "vendor", m.get("vendor_name"))
else:
    mr=float(m.get("model_ratio") or 0); cr=float(m.get("completion_ratio") or 1)
    print("gemini-3.8-flash-tts sell", round(mr*2,6), "/", round(mr*2*cr,6), "tags", m.get("tags"), "vendor", m.get("vendor_name"))
blob=json.dumps(d,ensure_ascii=False)
print("public_leak", bool(re.search(r"unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough|进货|二道|转售", blob, re.I)))
html=open("/tmp/m-tts.html",encoding="utf-8",errors="ignore").read()
print("model_page", "gemini-3.8-flash-tts" in html)
print("DONE_ADD_GEMINI_3_8_FLASH_TTS")
`;
const checkB64 = zlib.gzipSync(Buffer.from(checkPy, "utf8"), { level: 9 }).toString("base64");

const seoList = [
  "static/seo/model/gemini-3.8-flash-tts.html",
  "config/marketplace-model-copy.json",
  "services/creem-moderation-proxy/marketplace-model-copy.json",
  "config/model-icon-map.json",
  "services/creem-moderation-proxy/model-icon-map.json",
  "services/creem-moderation-proxy/server.mjs",
  "services/creem-moderation-proxy/billing-unit-inject.js",
];
for (const rel of seoList) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error("missing " + rel);
}
const tarRel = "tmp/_gemini38-tts-seo.tar.gz";
execSync(`tar -czf ${tarRel} ${seoList.map((s) => `"${s}"`).join(" ")}`, {
  cwd: root,
  stdio: "pipe",
  shell: true,
});
const tarB64 = fs.readFileSync(path.join(root, tarRel)).toString("base64");
if (tarB64.length < 200) throw new Error("tar too small");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts /opt/ai-relay/static/seo/model /opt/ai-relay/static/brand",
  `echo '${pyB64}' | sudo tee /tmp/g38tts-py.b64 >/dev/null`,
  "base64 -d /tmp/g38tts-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-gemini-3.8-flash-tts.py >/dev/null",
  `echo '${checkB64}' | sudo tee /tmp/g38tts-check.b64 >/dev/null`,
  "base64 -d /tmp/g38tts-check.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-check-gemini-3.8-flash-tts.py >/dev/null",
  `echo '${tarB64}' | sudo tee /tmp/g38tts-seo.b64 >/dev/null`,
  "base64 -d /tmp/g38tts-seo.b64 | sudo tee /tmp/g38tts-seo.tar.gz >/dev/null",
  "sudo tar -xzf /tmp/g38tts-seo.tar.gz -C /opt/ai-relay",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:rw -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-add-gemini-3.8-flash-tts.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/model-icon-map.json ai-relay-creem-moderation:/app/model-icon-map.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ai-relay-creem-moderation:/app/billing-unit-inject.js",
  "sudo docker restart ai-relay-creem-moderation",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code} ' https://www.keyoapi.xyz/api/pricing",
  "curl -sS -o /tmp/m-tts.html -w 'tts=%{http_code} ' https://www.keyoapi.xyz/model/gemini-3.8-flash-tts",
  "python3 /opt/ai-relay/scripts/vps-check-gemini-3.8-flash-tts.py",
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc leaked");
if (short.includes("\n")) throw new Error("short must be one line");

writeLf(path.join(root, "scripts/vps-add-gemini-3.8-flash-tts-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-add-gemini-3.8-flash-tts-readme.txt"),
  `# 上架 gemini-3.8-flash-tts（OpenLux 上游，售价=成本×2）
# Keyo Primary · 语音合成 · Token 计费

上游定价（最便宜组 Aistudio-Gemini-2，2026-10-10 探测）：
- 成本 输入 $0.132355 / M · 输出 $2.38239 / M
- 售价 输入 $0.26471 / M · 输出 $4.76478 / M
- ModelRatio=0.132355 CompletionRatio=18

粘贴：scripts/vps-add-gemini-3.8-flash-tts-short.txt（一整行）
期望：
  primary <id> Keyo Primary
  channel <id> Keyo Primary add ['gemini-3.8-flash-tts']
  pricing token gemini-3.8-flash-tts 0.26471 / 4.76478 ratio 0.132355 comp 18.0
  marketplace created gemini-3.8-flash-tts
  abilities copied gemini-3.8-flash-tts from gemini-3.1-flash-tts-preview
  copy_merged ...marketplace-model-copy.json
  SELL_IN_USD 0.26471
  SELL_OUT_USD 4.76478
  DONE_ADD_GEMINI_3_8_FLASH_TTS

然后验证输出：
  gemini-3.8-flash-tts sell 0.26471 / 4.76478 tags 语音合成
  public_leak False
  model_page True
  DONE_ADD_GEMINI_3_8_FLASH_TTS
`
);

console.log({ b64: pyB64.length, check: checkB64.length, tar: tarB64.length });