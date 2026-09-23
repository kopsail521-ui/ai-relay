/**
 * Generate short VPS paste to list UnoRouter paid chat (sell = cost × 2).
 *   node scripts/print-vps-add-unorouter-paid.mjs
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

const cfg = fs.readFileSync(
  path.join(root, "config/unorouter-paid-models.json")
);
const py = fs.readFileSync(path.join(__dirname, "vps-add-unorouter-paid.py"));
const freePy = fs.readFileSync(path.join(__dirname, "vps-add-unorouter-free.py"));

const cfgB64 = zlib.gzipSync(cfg, { level: 9 }).toString("base64");
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");
const freeB64 = zlib.gzipSync(freePy, { level: 9 }).toString("base64");

const ids = JSON.parse(cfg.toString("utf8")).models.map((m) => m.id);
const wantPy = ids.map((id) => JSON.stringify(id)).join(", ");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/config /opt/ai-relay/scripts",
  `echo '${cfgB64}' | sudo tee /tmp/uno-paid-cfg.b64 >/dev/null`,
  "base64 -d /tmp/uno-paid-cfg.b64 | gunzip | sudo tee /opt/ai-relay/config/unorouter-paid-models.json >/dev/null",
  `echo '${pyB64}' | sudo tee /tmp/uno-paid-py.b64 >/dev/null`,
  "base64 -d /tmp/uno-paid-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-unorouter-paid.py >/dev/null",
  `echo '${freeB64}' | sudo tee /tmp/uno-free-py.b64 >/dev/null`,
  "base64 -d /tmp/uno-free-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-unorouter-free.py >/dev/null",
  "sudo docker run --rm --env-file /opt/ai-relay/.env -v /opt/ai-relay:/opt/ai-relay:ro -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-add-unorouter-paid.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json
want={${wantPy}}
d=json.load(open("/tmp/pricing.json"))
by={m.get("model_name"):m for m in (d.get("data") or [])}
miss=sorted(want-set(by))
print("missing", miss or "NONE")
for mid in sorted(want):
  m=by.get(mid)
  if not m: continue
  mr=float(m.get("model_ratio") or 0)
  cr=float(m.get("completion_ratio") or 1)
  print(mid, "sell", round(mr*2,6), "/", round(mr*2*cr,6))
print("DONE_ADD_UNOROUTER_PAID")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-add-unorouter-paid-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-add-unorouter-paid-readme.txt"),
  `# 上架 UnoRouter 付费对话（成本×2）

glm-5.3-flash / glm-5.2 / deepseek-v4* / kimi-k3 / kimi-k2.7-code / qwen3.8-flash

粘贴：scripts/vps-add-unorouter-paid-short.txt
→ missing NONE
→ DONE_ADD_UNOROUTER_PAID
`
);

console.log({
  cfgB64: cfgB64.length,
  pyB64: pyB64.length,
  freeB64: freeB64.length,
  short: Buffer.byteLength(short),
});
