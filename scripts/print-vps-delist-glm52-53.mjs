/**
 * Generate short VPS paste to delist glm-5.2 / glm-5.3 series.
 *   node scripts/print-vps-delist-glm52-53.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-delist-glm52-53.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const short = [
  "cd /opt/ai-relay && sudo git pull --ff-only origin main",
  `echo '${b64}' | sudo tee /tmp/delist-glm.b64 >/dev/null`,
  "base64 -d /tmp/delist-glm.b64 | gunzip | sudo tee /tmp/delist-glm.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/delist-glm.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "sudo bash scripts/deploy-brand-static.sh",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json,re
d=json.load(open("/tmp/pricing.json"))
arr=d.get("data") or []
names={m.get("model_name") for m in arr}
pat=re.compile(r"^glm-5\\.[23]", re.I)
left=sorted(n for n in names if n and pat.match(n))
print("glm52_53_still_listed", left or "NONE")
print("DONE_DELIST_GLM52_53")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-delist-glm52-53-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-delist-glm52-53-readme.txt"),
  `# 下架 glm-5.2 / glm-5.3（含 free）

粘贴：scripts/vps-delist-glm52-53-short.txt
→ glm52_53_still_listed NONE
→ DONE_DELIST_GLM52_53
`
);

console.log({ b64: b64.length, short: Buffer.byteLength(short) });
