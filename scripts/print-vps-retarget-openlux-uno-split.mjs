/**
 * Generate short VPS paste: OpenLux-ever models → Keyo Primary (cost×2);
 * Uno-only models stay on Keyo Chat (cost×2).
 *   node scripts/print-vps-retarget-openlux-uno-split.mjs
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

const olCfg = pack("config/openlux-paid-chat-models.json");
const unoCfg = pack("config/unorouter-paid-models.json");
const py = pack("scripts/vps-retarget-openlux-uno-split.py");
const docs = pack("static/brand/keyo-docs.html");

const olIds = JSON.parse(
  fs.readFileSync(path.join(root, "config/openlux-paid-chat-models.json"), "utf8")
).models.map((m) => m.id);
const unoIds = JSON.parse(
  fs.readFileSync(path.join(root, "config/unorouter-paid-models.json"), "utf8")
).models.map((m) => m.id);

const expect = {
  "glm-5.3": [1.4, 4.4],
  "glm-5.2": [1.4, 4.4],
  "deepseek-v4.1-flash": [0.3, 1.2],
  "deepseek-v4-pro-0813": [1.32, 3.96],
  "deepseek-v4-flash-0731": [0.44, 1.32],
  "deepseek-v4-pro": [1.32, 3.96],
  "deepseek-v4-flash": [0.44, 1.32],
  "kimi-k3": [3, 15],
  "glm-5.3-flash": [0.072, 0.239998],
  "kimi-k2.7-code": [0.03344, 0.140799],
  "qwen3.8-flash": [0.05496, 0.172206],
  "mimo-v2.6-pro": [0.240033, 0.480066],
  "mimo-v2.6-flash": [0.150388, 0.300776],
};

const wantPy = [...olIds, ...unoIds].map((id) => JSON.stringify(id)).join(", ");
const expectPy = JSON.stringify(expect);

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/config /opt/ai-relay/scripts /opt/ai-relay/static/brand",
  `echo '${olCfg}' | sudo tee /tmp/ol-paid-cfg.b64 >/dev/null`,
  "base64 -d /tmp/ol-paid-cfg.b64 | gunzip | sudo tee /opt/ai-relay/config/openlux-paid-chat-models.json >/dev/null",
  `echo '${unoCfg}' | sudo tee /tmp/uno-paid-cfg.b64 >/dev/null`,
  "base64 -d /tmp/uno-paid-cfg.b64 | gunzip | sudo tee /opt/ai-relay/config/unorouter-paid-models.json >/dev/null",
  `echo '${py}' | sudo tee /tmp/retarget-py.b64 >/dev/null`,
  "base64 -d /tmp/retarget-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-retarget-openlux-uno-split.py >/dev/null",
  `echo '${docs}' | sudo tee /tmp/keyo-docs.b64 >/dev/null`,
  "base64 -d /tmp/keyo-docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null",
  "sudo docker run --rm --env-file /opt/ai-relay/.env -v /opt/ai-relay:/opt/ai-relay:ro -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-retarget-openlux-uno-split.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  "curl -sS -o /tmp/docs.html https://www.keyoapi.xyz/brand/keyo-docs.html",
  `python3 - <<'PY'
import json,re
want={${wantPy}}
expect=${expectPy}
d=json.load(open("/tmp/pricing.json"))
by={m.get("model_name"):m for m in (d.get("data") or [])}
print("missing", sorted(want-set(by)) or "NONE")
bad=[]
for mid, (ein, eout) in expect.items():
  m=by.get(mid)
  if not m:
    bad.append(mid+":absent"); continue
  mr=float(m.get("model_ratio") or 0); cr=float(m.get("completion_ratio") or 1)
  sin=round(mr*2,6); sout=round(sin*cr,6)
  ok=abs(sin-ein)<1e-4 and abs(sout-eout)<1e-3
  print(mid, "sell", sin, "/", sout, "OK" if ok else "BAD want %s/%s"%(ein,eout))
  if not ok: bad.append(mid)
blob=json.dumps(d,ensure_ascii=False)
docs=open("/tmp/docs.html",encoding="utf-8",errors="ignore").read()
print("docs_glm53", "~$1.40" in docs and 'data-copy="glm-5.3"' in docs)
print("public_leak", bool(re.search(r'unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough', blob, re.I)))
print("bad", bad or "NONE")
print("DONE_RETARGET_OPENLUX_UNO_SPLIT")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-retarget-openlux-uno-split-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-retarget-openlux-uno-split-readme.txt"),
  `# OpenLux 原上架模型回 Keyo Primary（成本×2）；Uno 独有 5 个仍 Keyo Chat（成本×2）

OpenLux→Primary: glm-5.3 / glm-5.2 / deepseek-v4* / kimi-k3
Uno→Chat: glm-5.3-flash / kimi-k2.7-code / qwen3.8-flash / mimo-v2.6-pro / mimo-v2.6-flash

粘贴：scripts/vps-retarget-openlux-uno-split-short.txt
→ missing NONE / bad NONE / docs_glm53 True
→ DONE_RETARGET_OPENLUX_UNO_SPLIT
`
);

writeLf(
  path.join(root, "scripts/vps-add-unorouter-paid-readme.txt"),
  `# 上架 UnoRouter 付费对话（仅 OpenLux 未上过的；成本×2）

glm-5.3-flash / kimi-k2.7-code / qwen3.8-flash / mimo-v2.6-pro / mimo-v2.6-flash

OpenLux 重叠模型请用：scripts/vps-retarget-openlux-uno-split-readme.txt

粘贴：scripts/vps-add-unorouter-paid-short.txt
→ missing NONE
→ DONE_ADD_UNOROUTER_PAID
`
);

console.log({
  olCfg: olCfg.length,
  unoCfg: unoCfg.length,
  py: py.length,
  docs: docs.length,
  short: Buffer.byteLength(short),
  olIds,
  unoIds,
});
