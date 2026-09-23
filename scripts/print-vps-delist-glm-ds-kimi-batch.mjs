/**
 * Generate short VPS paste to delist glm / deepseek / kimi batch.
 *   node scripts/print-vps-delist-glm-ds-kimi-batch.mjs
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

const py = fs.readFileSync(
  path.join(__dirname, "vps-delist-glm-ds-kimi-batch.py")
);
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const checkIds = [
  "glm-5.3",
  "glm-5.2",
  "glm-5.2-free",
  "deepseek-v4-pro-0813",
  "deepseek-v4-flash-0731",
  "deepseek-v4.1-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "kimi-k3",
  "kimi-k3-free",
];

const wantPy = checkIds.map((id) => JSON.stringify(id)).join(", ");

const short = [
  "cd /opt/ai-relay",
  `echo '${b64}' | sudo tee /tmp/delist-batch.b64 >/dev/null`,
  "base64 -d /tmp/delist-batch.b64 | gunzip | sudo tee /tmp/delist-batch.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/delist-batch.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json
want={${wantPy}}
d=json.load(open("/tmp/pricing.json"))
names={m.get("model_name") for m in (d.get("data") or [])}
hit=sorted(n for n in names if n in want)
print("still_listed", hit or "NONE")
print("DONE_DELIST_GLM_DS_KIMI")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-delist-glm-ds-kimi-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-delist-glm-ds-kimi-readme.txt"),
  `# 下架 glm-5.3 / glm-5.2(+free) / DeepSeek v4 系列 / kimi-k3(+free)

粘贴：scripts/vps-delist-glm-ds-kimi-short.txt
→ still_listed NONE
→ DONE_DELIST_GLM_DS_KIMI
`
);

console.log({ b64: b64.length, short: Buffer.byteLength(short) });
