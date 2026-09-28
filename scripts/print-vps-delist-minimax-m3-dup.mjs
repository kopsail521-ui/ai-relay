/**
 * Delist expensive MiniMax-M3; keep minimax-m3; sync docs.
 *   node scripts/print-vps-delist-minimax-m3-dup.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

function pack(rel) {
  return zlib
    .gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 })
    .toString("base64");
}

const py = pack("scripts/vps-delist-minimax-m3-dup.py");
const docs = pack("static/brand/keyo-docs.html");
const refZh = pack("static/brand/keyo-api-ref.md");
const refEn = pack("static/brand/keyo-api-ref.en.md");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts /opt/ai-relay/static/brand",
  `echo '${py}' | sudo tee /tmp/delist-m3.b64 >/dev/null`,
  "base64 -d /tmp/delist-m3.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-delist-minimax-m3-dup.py >/dev/null",
  `echo '${docs}' | sudo tee /tmp/keyo-docs.b64 >/dev/null`,
  "base64 -d /tmp/keyo-docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null",
  `echo '${refZh}' | sudo tee /tmp/keyo-ref-zh.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref-zh.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.md >/dev/null",
  `echo '${refEn}' | sudo tee /tmp/keyo-ref-en.b64 >/dev/null`,
  "base64 -d /tmp/keyo-ref-en.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.en.md >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:ro -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-delist-minimax-m3-dup.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  "curl -sS -o /tmp/docs.html https://www.keyoapi.xyz/brand/keyo-docs.html",
  "curl -sS -o /tmp/ref.md https://www.keyoapi.xyz/brand/keyo-api-ref.md",
  `python3 - <<'PY'
import json,re
d=json.load(open("/tmp/pricing.json"))
names={m.get("model_name") for m in (d.get("data") or [])}
print("MiniMax-M3_listed", "MiniMax-M3" in names)
print("minimax-m3_listed", "minimax-m3" in names)
m=next((x for x in (d.get("data") or []) if x.get("model_name")=="minimax-m3"), None)
if m:
  mr=float(m.get("model_ratio") or 0); cr=float(m.get("completion_ratio") or 1)
  print("minimax-m3_sell", round(mr*2,6), "/", round(mr*2*cr,6))
docs=open("/tmp/docs.html",encoding="utf-8",errors="ignore").read()
ref=open("/tmp/ref.md",encoding="utf-8",errors="ignore").read()
print("docs_old_id", 'data-copy="MiniMax-M3"' in docs)
print("docs_new_id", 'data-copy="minimax-m3"' in docs and "~$0.12" in docs)
print("ref_old_id", "MiniMax-M3" in ref)
print("ref_new_id", "minimax-m3" in ref)
print("public_leak", bool(re.search(r'unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough', json.dumps(d)+docs+ref, re.I)))
print("DONE_DELIST_MINIMAX_M3_DUP")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-delist-minimax-m3-dup-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-delist-minimax-m3-dup-readme.txt"),
  `# 下架贵的 MiniMax-M3，保留 minimax-m3（Uno×2 ~$0.12/$0.48）

同步 docs / api-ref。SEO 无独立 MiniMax-M3 落地页。

粘贴：scripts/vps-delist-minimax-m3-dup-short.txt
→ MiniMax-M3_listed False / minimax-m3_listed True
→ DONE_DELIST_MINIMAX_M3_DUP
`
);

console.log({
  py: py.length,
  docs: docs.length,
  short: Buffer.byteLength(short),
});
