import fs from "fs";
import zlib from "zlib";

const py = fs.readFileSync("scripts/vps-price-tag-ops-20260922.py");
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const short = [
  `echo '${b64}' | sudo tee /tmp/price-tag-ops.b64 >/dev/null`,
  "base64 -d /tmp/price-tag-ops.b64 | gunzip | sudo tee /tmp/price-tag-ops.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/price-tag-ops.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json
d=json.load(open("/tmp/pricing.json"))
arr=d.get("data") or []
names={m.get("model_name") for m in arr}
print("deepseek_still_listed", [n for n in sorted(names) if "deepseek" in n.lower()] or "NONE")
for mid in ["glm-5.2","glm-5.3","kimi-k3","MiniMax-M3","gpt-image-2.5","gpt-image-2.5-flare","gpt-image-2.5-sunburst","grok-1.5-video","Qwen3-VL-Embedding-8B"]:
  m=next((x for x in arr if x.get("model_name")==mid), None)
  if not m:
    print(mid, "MISSING"); continue
  si=(m.get("model_ratio") or 0)*2; so=si*(m.get("completion_ratio") or 1)
  print(mid, "tags="+str(m.get("tags")), "sell~", round(si,4), "/", round(so,4), "price="+str(m.get("model_price")))
print("DONE_PRICE_TAG_OPS_20260922")
PY`,
].join(" && ");

fs.writeFileSync(
  "scripts/vps-price-tag-ops-short.txt",
  short.replace(/\r\n/g, "\n").replace(/\r/g, "\n") + "\n"
);
console.log({ bytes: Buffer.byteLength(short), b64: b64.length });
