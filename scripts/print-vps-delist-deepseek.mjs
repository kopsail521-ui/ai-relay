/**
 * Generate short VPS paste to delist all DeepSeek models.
 *   node scripts/print-vps-delist-deepseek.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-delist-deepseek.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const short = [
  "cd /opt/ai-relay && sudo git pull --ff-only origin main",
  `echo '${b64}' | sudo tee /tmp/delist-ds.b64 >/dev/null`,
  "base64 -d /tmp/delist-ds.b64 | gunzip | sudo tee /tmp/delist-ds.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/delist-ds.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json
d=json.load(open("/tmp/pricing.json"))
arr=d.get("data") or []
names={m.get("model_name") for m in arr}
ds=[n for n in sorted(names) if "deepseek" in n.lower()]
print("deepseek_still_listed", ds or "NONE")
print("DONE_DELIST_DEEPSEEK")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-delist-deepseek-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-delist-deepseek-readme.txt"),
  `# 下架全部 DeepSeek

粘贴：scripts/vps-delist-deepseek-short.txt
→ deepseek_still_listed NONE
→ DONE_DELIST_DEEPSEEK
`
);

console.log({ b64: b64.length, short: Buffer.byteLength(short) });
