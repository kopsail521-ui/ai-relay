/**
 * Rename tag rag → 嵌入模型 / Embedding. No git pull, no bash heredoc.
 *   node scripts/print-vps-rename-rag-tag.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-rename-rag-tag.py"));
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const checkPy = `#!/usr/bin/env python3
import json,re
d=json.load(open("/tmp/pricing.json"))
tags=set()
rag=0
emb=0
for m in (d.get("data") or []):
    t=str(m.get("tags") or "")
    tags.add(t)
    if "rag" in t.lower().split(",") or t.strip()=="rag":
        rag+=1
    if "嵌入模型" in t:
        emb+=1
print("tag_rag_left", rag)
print("tag_embed", emb)
html=open("/tmp/pricing-page.html",encoding="utf-8",errors="ignore").read()
print("i18n_zh", "嵌入模型" in html)
print("i18n_en", '"en":"Embedding"' in html.replace(" ","") or "Embedding" in html)
blob=json.dumps(d,ensure_ascii=False)
print("public_leak", bool(re.search(r"unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough|进货|二道|转售", blob, re.I)))
print("DONE_RENAME_RAG_TAG")
`;
const checkB64 = zlib.gzipSync(Buffer.from(checkPy, "utf8"), { level: 9 }).toString("base64");

const packList = [
  "config/marketplace-model-copy.json",
  "services/creem-moderation-proxy/marketplace-model-copy.json",
  "services/creem-moderation-proxy/server.mjs",
];
for (const rel of packList) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error("missing " + rel);
}
const tarPath = path.join(root, "tmp/_rename-rag-tag.tar.gz");
fs.mkdirSync(path.dirname(tarPath), { recursive: true });
execSync(`tar -czf "${tarPath}" ${packList.map((s) => `"${s}"`).join(" ")}`, {
  cwd: root,
  stdio: "pipe",
  shell: true,
});
const tarB64 = fs.readFileSync(tarPath).toString("base64");
if (tarB64.length < 200) throw new Error("tar too small");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts /opt/ai-relay/config /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${pyB64}' | sudo tee /tmp/rag-tag-py.b64 >/dev/null`,
  "base64 -d /tmp/rag-tag-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-rename-rag-tag.py >/dev/null",
  `echo '${checkB64}' | sudo tee /tmp/rag-tag-check.b64 >/dev/null`,
  "base64 -d /tmp/rag-tag-check.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-check-rag-tag.py >/dev/null",
  `echo '${tarB64}' | sudo tee /tmp/rag-tag-copy.b64 >/dev/null`,
  "base64 -d /tmp/rag-tag-copy.b64 | sudo tee /tmp/rag-tag-copy.tar.gz >/dev/null",
  "sudo tar -xzf /tmp/rag-tag-copy.tar.gz -C /opt/ai-relay",
  "sudo docker run --rm -e KEYO_ROOT=/opt/ai-relay -v /opt/ai-relay:/opt/ai-relay:rw -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-rename-rag-tag.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ai-relay-creem-moderation:/app/billing-unit-inject.js",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code} ' https://www.keyoapi.xyz/api/pricing",
  "curl -sS -o /tmp/pricing-page.html -w 'page=%{http_code} ' https://www.keyoapi.xyz/pricing",
  "python3 /opt/ai-relay/scripts/vps-check-rag-tag.py",
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc leaked");
if (short.includes("\n")) throw new Error("short must be one line");

writeLf(path.join(root, "scripts/vps-rename-rag-tag-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-rename-rag-tag-readme.txt"),
  `# 标签 rag → 嵌入模型（en: Embedding）

粘贴：scripts/vps-rename-rag-tag-short.txt（一整行）
期望：tag_rag_left 0 · tag_embed >0 · i18n_zh True · public_leak False · DONE_RENAME_RAG_TAG
硬开 /pricing，侧栏应是「嵌入模型」/ Embedding，不再是 rag。
`
);
console.log({ pyB64: pyB64.length, tarB64: tarB64.length, short: short.length });
