/**
 * VPS paste: route gemini TTS models through the native Gemini channel (type 24)
 * so /v1beta generateContent returns REAL inline audio (upstream chat path
 * returns a placeholder). No git pull, no bash heredoc.
 *   node scripts/print-vps-fix-gemini-tts-native.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-fix-gemini-tts-native.py"));
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const checkPy = `#!/usr/bin/env python3
import json, os, sqlite3, urllib.request
db = next(p for p in ("/opt/ai-relay/data/new-api/one-api.db", "/data/one-api.db") if os.path.exists(p))
key = "sk-" + sqlite3.connect(db).execute(
    "SELECT key FROM tokens WHERE status=1 LIMIT 1").fetchone()[0]
body = json.dumps({
    "contents": [{"parts": [{"text": "Say hi."}]}],
    "generationConfig": {"responseModalities": ["AUDIO"],
                         "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Kore"}}}}
}).encode()
req = urllib.request.Request(
    "https://www.keyoapi.xyz/v1beta/models/gemini-3.8-flash-tts:generateContent",
    data=body,
    headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
d = json.load(urllib.request.urlopen(req, timeout=120))
parts = (d.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
aud = [p for p in parts if str(p.get("inlineData", {}).get("mimeType", "")).startswith("audio/")]
print("audio_ok", bool(aud), "b64len", len(aud[0]["inlineData"]["data"]) if aud else 0)
for tag, page in (("p38", "/tmp/m38.html"), ("p31", "/tmp/m31.html")):
    html = open(page, encoding="utf-8", errors="ignore").read()
    print(tag, "native_page", "/v1beta/models/" in html)
print("DONE_FIX_GEMINI_TTS_NATIVE")
`;
const checkB64 = zlib.gzipSync(Buffer.from(checkPy, "utf8"), { level: 9 }).toString("base64");

const seoList = [
  "static/seo/model/gemini-3.8-flash-tts.html",
  "static/seo/model/gemini-3.1-flash-tts-preview.html",
];
for (const rel of seoList) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error("missing " + rel);
}
const tarRel = "tmp/_gemini-tts-native-seo.tar.gz";
execSync(`tar -czf ${tarRel} ${seoList.map((s) => `"${s}"`).join(" ")}`, {
  cwd: root,
  stdio: "pipe",
  shell: true,
});
const tarB64 = fs.readFileSync(path.join(root, tarRel)).toString("base64");
if (tarB64.length < 200) throw new Error("tar too small");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts /opt/ai-relay/static/seo/model",
  `echo '${pyB64}' | sudo tee /tmp/g38nat-py.b64 >/dev/null`,
  "base64 -d /tmp/g38nat-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-fix-gemini-tts-native.py >/dev/null",
  `echo '${checkB64}' | sudo tee /tmp/g38nat-chk.b64 >/dev/null`,
  "base64 -d /tmp/g38nat-chk.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-check-gemini-tts-native.py >/dev/null",
  `echo '${tarB64}' | sudo tee /tmp/g38nat-seo.b64 >/dev/null`,
  "base64 -d /tmp/g38nat-seo.b64 | sudo tee /tmp/g38nat-seo.tar.gz >/dev/null",
  "sudo tar -xzf /tmp/g38nat-seo.tar.gz -C /opt/ai-relay",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /opt/ai-relay/scripts/vps-fix-gemini-tts-native.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "sleep 4",
  "curl -sS -o /tmp/m38.html -w 'p38=%{http_code} ' https://www.keyoapi.xyz/model/gemini-3.8-flash-tts",
  "curl -sS -o /tmp/m31.html -w 'p31=%{http_code} ' https://www.keyoapi.xyz/model/gemini-3.1-flash-tts-preview",
  "sudo python3 /opt/ai-relay/scripts/vps-check-gemini-tts-native.py",
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc leaked");
if (short.includes("\n")) throw new Error("short must be one line");

writeLf(path.join(root, "scripts/vps-fix-gemini-tts-native-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-fix-gemini-tts-native-readme.txt"),
  `# 修复 gemini TTS 真音频：原生 Gemini 渠道（type 24）+ /v1beta 原生协议

背景：上游 OpenAI 兼容 chat 路径返回 "[audio/wav data]" 占位符（无真音频，
已实测端到端）；上游原生 generateContent 返回真实 inline WAV。我们的
Gemini 原生中继逐字节透传响应，因此：

1. 新建/复用渠道 "Keyo Audio"（type 24，克隆主渠道 key/base_url）
2. 两个 TTS 模型（gemini-3.8-flash-tts、gemini-3.1-flash-tts-preview）
   从主渠道模型列表移除，abilities 换绑到 Keyo Audio（保留 default/vip 组）
3. 模型广场 endpoints 改为 {"gemini": "/v1beta/models/<model>:generateContent"}
4. 两个 SEO 模型页示例改为原生调用（deploy-brand-static 同步）

客户端调用方式（改后）：
  POST https://www.keyoapi.xyz/v1beta/models/gemini-3.8-flash-tts:generateContent
  Authorization: Bearer sk-...
  body: {"contents":[{"parts":[{"text":"..."}]}],
         "generationConfig":{"responseModalities":["AUDIO"],
           "speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":"Kore"}}}}}
  响应 candidates[0].content.parts[].inlineData = audio/wav base64

粘贴：scripts/vps-fix-gemini-tts-native-short.txt（一整行）
期望：
  donor <id> Keyo Primary
  audio channel created <id>      （或 reused ... added (none)）
  donor models trimmed ... removed [两个 TTS 模型]
  abilities repointed ... -> <id>
  endpoints set ... {"gemini":"/v1beta/models/...:generateContent"}
  DONE_FIX_GEMINI_TTS_NATIVE
  p38=200 p31=200
  audio_ok True b64len <几千>
  p38 native_page True · p31 native_page True
  DONE_FIX_GEMINI_TTS_NATIVE
`
);

console.log({ b64: pyB64.length, check: checkB64.length, tar: tarB64.length });