/**
 * Generate VPS paste for DeepSeek official listing.
 * Key is NOT embedded — set DEEPSEEK_API_KEY on the VPS first.
 *   node scripts/print-vps-add-deepseek-official.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-add-deepseek-official.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const short = [
  "cd /opt/ai-relay && sudo git pull --ff-only origin main",
  `echo '${b64}' | sudo tee /tmp/add-ds.b64 >/dev/null`,
  "base64 -d /tmp/add-ds.b64 | gunzip | sudo tee /tmp/add-ds.py >/dev/null",
  "grep -q '^DEEPSEEK_API_KEY=' /opt/ai-relay/.env || { echo 'MISSING DEEPSEEK_API_KEY in /opt/ai-relay/.env'; exit 1; }",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /opt/ai-relay/.env:/opt/ai-relay/.env:ro -v /tmp/add-ds.py:/fix.py:ro python:3.12-alpine sh -c 'export $(grep -E \"^DEEPSEEK_API_KEY=\" /opt/ai-relay/.env | xargs) && python /fix.py /data/one-api.db'",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json
d=json.load(open("/tmp/pricing.json"))
arr=d.get("data") or []
for mid in ["deepseek-v4.1-flash","deepseek-v4-pro-0813"]:
  m=next((x for x in arr if x.get("model_name")==mid), None)
  if not m:
    print(mid, "MISSING"); continue
  si=(m.get("model_ratio") or 0)*2; so=si*(m.get("completion_ratio") or 1)
  print(mid, "tags="+str(m.get("tags")), "sell~", round(si,4), "/", round(so,4))
print("DONE_ADD_DEEPSEEK_OFFICIAL")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-add-deepseek-official-short.txt"), short + "\n");

writeLf(
  path.join(root, "scripts/vps-add-deepseek-official-readme.txt"),
  `# 上架 DeepSeek 官方 API（高峰价×1.2）

模型：
- deepseek-v4.1-flash → upstream deepseek-flash · 售价 ~$0.36 / $1.44
- deepseek-v4-pro-0813 → upstream deepseek-v4-pro · 售价 ~$1.584 / $4.752

1) 在 VPS 写入密钥（勿提交 Git）：
   grep -q '^DEEPSEEK_API_KEY=' /opt/ai-relay/.env || echo 'DEEPSEEK_API_KEY=sk-YOUR_KEY' | sudo tee -a /opt/ai-relay/.env

2) 粘贴 scripts/vps-add-deepseek-official-short.txt
   → DONE_ADD_DEEPSEEK_OFFICIAL
`
);

console.log({ b64: b64.length, short: Buffer.byteLength(short) });
