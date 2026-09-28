/**
 * Generate short VPS paste: remaining OpenLux models stay Keyo Primary (cost×2);
 * listed models move to Keyo Chat / UnoRouter (cost×2).
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
const copyCfg = pack("config/marketplace-model-copy.json");

const olIds = JSON.parse(
  fs.readFileSync(path.join(root, "config/openlux-paid-chat-models.json"), "utf8")
).models.map((m) => m.id);
const unoModels = JSON.parse(
  fs.readFileSync(path.join(root, "config/unorouter-paid-models.json"), "utf8")
).models;
const unoIds = unoModels.map((m) => m.id);
const markup = 2;

const expect = {};
for (const m of [
  ...JSON.parse(
    fs.readFileSync(path.join(root, "config/openlux-paid-chat-models.json"), "utf8")
  ).models,
  ...unoModels,
]) {
  expect[m.id] = [
    +(m.cost_in * markup).toFixed(6),
    +(m.cost_out * markup).toFixed(6),
  ];
}

const wantPy = [...olIds, ...unoIds].map((id) => JSON.stringify(id)).join(", ");
const expectPy = JSON.stringify(expect);
const unoWantPy = unoIds.map((id) => JSON.stringify(id)).join(", ");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/config /opt/ai-relay/scripts /opt/ai-relay/static/brand /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${olCfg}' | sudo tee /tmp/ol-paid-cfg.b64 >/dev/null`,
  "base64 -d /tmp/ol-paid-cfg.b64 | gunzip | sudo tee /opt/ai-relay/config/openlux-paid-chat-models.json >/dev/null",
  `echo '${unoCfg}' | sudo tee /tmp/uno-paid-cfg.b64 >/dev/null`,
  "base64 -d /tmp/uno-paid-cfg.b64 | gunzip | sudo tee /opt/ai-relay/config/unorouter-paid-models.json >/dev/null",
  `echo '${py}' | sudo tee /tmp/retarget-py.b64 >/dev/null`,
  "base64 -d /tmp/retarget-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-retarget-openlux-uno-split.py >/dev/null",
  `echo '${docs}' | sudo tee /tmp/keyo-docs.b64 >/dev/null`,
  "base64 -d /tmp/keyo-docs.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null",
  `echo '${copyCfg}' | sudo tee /tmp/mkt-copy.b64 >/dev/null`,
  "base64 -d /tmp/mkt-copy.b64 | gunzip | sudo tee /opt/ai-relay/config/marketplace-model-copy.json >/dev/null",
  "base64 -d /tmp/mkt-copy.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null",
  "sudo docker run --rm --env-file /opt/ai-relay/.env -v /opt/ai-relay:/opt/ai-relay:ro -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-retarget-openlux-uno-split.py /data/one-api.db",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:ro -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-update-marketplace-copy.py /data/one-api.db /opt/ai-relay/config/marketplace-model-copy.json || echo COPY_SKIP",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json 2>/dev/null || true",
  "sudo docker restart ai-relay-new-api ai-relay-creem-moderation && sleep 5",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  "curl -sS -o /tmp/docs.html https://www.keyoapi.xyz/brand/keyo-docs.html",
  `python3 - <<'PY'
import json,re
want={${wantPy}}
uno={${unoWantPy}}
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
docs=open("/tmp/docs.html",encoding="utf-8",errors="ignore").read()
print("docs_glm53", "~$0.12" in docs and 'data-copy="glm-5.3"' in docs)
print("docs_minimax_m3", 'data-copy="minimax-m3"' in docs and "~$0.12" in docs)
print("public_leak", bool(re.search(r'unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough', json.dumps(d,ensure_ascii=False), re.I)))
print("uno_count", len(uno))
print("bad", bad or "NONE")
print("DONE_RETARGET_OPENLUX_UNO_SPLIT")
PY`,
].join(" && ");

writeLf(path.join(root, "scripts/vps-retarget-openlux-uno-split-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-retarget-openlux-uno-split-readme.txt"),
  `# 13 个模型改走 Keyo Chat（Uno，成本×2）；OpenLux 仅留 glm-5.2 / deepseek-v4-flash

Uno→Chat:
deepseek-v4.1-flash / glm-5.3 / kimi-k3 / deepseek-v4-flash-0731 / deepseek-v4-pro /
qwen3.8-flash / deepseek-v4-pro-0813 / glm-5.3-flash / minimax-m3 / mimo-v2.6-pro /
kimi-k2.7-code / hy4-preview / mimo-v2.6-flash

OpenLux→Primary 剩余: glm-5.2 / deepseek-v4-flash

粘贴：scripts/vps-retarget-openlux-uno-split-short.txt
→ missing NONE / bad NONE / docs_glm53 True
→ DONE_RETARGET_OPENLUX_UNO_SPLIT
`
);

writeLf(
  path.join(root, "scripts/vps-add-unorouter-paid-readme.txt"),
  `# 上架 / 刷新 UnoRouter 付费对话（Keyo Chat；成本×2）

见 config/unorouter-paid-models.json（当前 13 个）。

若要从 Keyo Primary 迁走重叠模型，用：
scripts/vps-retarget-openlux-uno-split-readme.txt

粘贴：scripts/vps-add-unorouter-paid-short.txt
→ DONE_ADD_UNOROUTER_PAID
`
);

console.log({
  olCfg: olCfg.length,
  unoCfg: unoCfg.length,
  py: py.length,
  docs: docs.length,
  copyCfg: copyCfg.length,
  short: Buffer.byteLength(short),
  olIds,
  unoIds,
  expect,
});
