/**
 * Generate VPS short paste: OpenLux DeepSeek×1.2 + grok-4.7×5
 *   node scripts/print-vps-add-openlux-ds-grok.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-add-openlux-ds-grok.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const short = [
  "cd /opt/ai-relay && sudo git pull --ff-only origin main",
  `echo '${b64}' | sudo tee /tmp/add-olx-ds.b64 >/dev/null`,
  "base64 -d /tmp/add-olx-ds.b64 | gunzip | sudo tee /tmp/add-olx-ds.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/add-olx-ds.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json
d=json.load(open("/tmp/pricing.json"))
arr=d.get("data") or []
want=["deepseek-v4.1-flash","deepseek-v4-pro-0813","deepseek-v4-flash-0731","grok-4.7"]
for mid in want:
  m=next((x for x in arr if x.get("model_name")==mid), None)
  if not m:
    print(mid, "MISSING"); continue
  si=(m.get("model_ratio") or 0)*2; so=si*(m.get("completion_ratio") or 1)
  print(mid, "tags="+str(m.get("tags")), "sell~", round(si,4), "/", round(so,4))
print("DONE_ADD_OPENLUX_DS_GROK")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-add-openlux-ds-grok-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-add-openlux-ds-grok-readme.txt"),
  `# OpenLux 上架 DeepSeek×1.2 + grok-4.7×5

售价：
- deepseek-v4.1-flash → ~$0.18 / $0.72
- deepseek-v4-pro-0813 → ~$0.792 / $2.376
- deepseek-v4-flash-0731 → ~$0.264 / $0.792
- grok-4.7 → ~$0.7353 / $2.2059

粘贴：scripts/vps-add-openlux-ds-grok-short.txt
→ DONE_ADD_OPENLUX_DS_GROK
`
);

console.log({ b64: b64.length, short: Buffer.byteLength(short) });
