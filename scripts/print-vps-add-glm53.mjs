/**
 * Short VPS: list glm-5.3 (UnoRouter cost × 2). Embeds cfg+py so no pull required.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function pack(rel) {
  return zlib
    .gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 })
    .toString("base64");
}

const cfgB64 = pack("config/unorouter-paid-models.json");
const pyB64 = pack("scripts/vps-add-unorouter-paid.py");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/config /opt/ai-relay/scripts",
  `echo '${cfgB64}' | sudo tee /tmp/uno-paid-cfg.b64 >/dev/null`,
  "base64 -d /tmp/uno-paid-cfg.b64 | gunzip | sudo tee /opt/ai-relay/config/unorouter-paid-models.json >/dev/null",
  `echo '${pyB64}' | sudo tee /tmp/uno-paid-py.b64 >/dev/null`,
  "base64 -d /tmp/uno-paid-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-unorouter-paid.py >/dev/null",
  "sudo docker run --rm --env-file /opt/ai-relay/.env -v /opt/ai-relay:/opt/ai-relay:ro -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-add-unorouter-paid.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "curl -sS -o /tmp/pricing.json https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json,re
want={"glm-5.3","glm-5.3-flash","glm-5.2","deepseek-v4.1-flash","deepseek-v4-pro-0813","deepseek-v4-flash-0731","deepseek-v4-pro","deepseek-v4-flash","kimi-k3","kimi-k2.7-code","qwen3.8-flash"}
d=json.load(open("/tmp/pricing.json"))
by={m.get("model_name"):m for m in (d.get("data") or [])}
print("missing", sorted(want-set(by)) or "NONE")
m=by.get("glm-5.3")
if m:
  mr=float(m.get("model_ratio") or 0); cr=float(m.get("completion_ratio") or 1)
  print("glm-5.3 sell", round(mr*2,6), "/", round(mr*2*cr,6))
blob=json.dumps(d,ensure_ascii=False)
print("public_leak", bool(re.search(r'unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough', blob, re.I)))
print("DONE_ADD_GLM53")
PY`,
].join(" && ");

const out = path.join(root, "scripts/vps-add-glm53-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
