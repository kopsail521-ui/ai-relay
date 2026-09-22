/**
 * Generate Workbench paste scripts for price/tag ops 2026-09-22.
 *   node scripts/print-vps-price-tag-ops-20260922.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-price-tag-ops-20260922.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");
const mid = Math.ceil(b64.length / 2);
const p1 = b64.slice(0, mid);
const p2 = b64.slice(mid);

writeLf(
  path.join(root, "scripts/vps-price-tag-ops-p1.txt"),
  `echo '${p1}' | sudo tee /tmp/price-tag-ops.b64 >/dev/null && echo OK_PRICE_TAG_1\n`
);
writeLf(
  path.join(root, "scripts/vps-price-tag-ops-p2.txt"),
  `echo '${p2}' | sudo tee -a /tmp/price-tag-ops.b64 >/dev/null && echo OK_PRICE_TAG_2\n`
);
writeLf(
  path.join(root, "scripts/vps-price-tag-ops-run.txt"),
  [
    "base64 -d /tmp/price-tag-ops.b64 | gunzip | sudo tee /tmp/price-tag-ops.py >/dev/null",
    "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/price-tag-ops.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
    "sudo docker restart ai-relay-new-api && sleep 4",
    "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
    `python3 - <<'PY'
import json
d=json.load(open("/tmp/pricing.json"))
arr=d.get("data") or []
names={m.get("model_name") for m in arr}
ds=[n for n in sorted(names) if "deepseek" in n.lower()]
print("deepseek_still_listed", ds or "NONE")
want=["glm-5.2","glm-5.3","kimi-k3","MiniMax-M3","gpt-image-2.5","gpt-image-2.5-flare","gpt-image-2.5-sunburst","grok-1.5-video","Qwen3-VL-Embedding-8B"]
for mid in want:
  m=next((x for x in arr if x.get("model_name")==mid), None)
  if not m:
    print(mid, "MISSING")
    continue
  sell_in=(m.get("model_ratio") or 0)*2
  sell_out=sell_in*(m.get("completion_ratio") or 1)
  print(mid, "tags="+str(m.get("tags")), "ratio="+str(m.get("model_ratio")), "comp="+str(m.get("completion_ratio")), "sell≈", round(sell_in,6), "/", round(sell_out,6), "price="+str(m.get("model_price")))
print("DONE_PRICE_TAG_OPS_20260922")
PY`,
  ].join(" && ") + "\n"
);

writeLf(
  path.join(root, "scripts/vps-price-tag-ops-readme.txt"),
  `# 2026-09-22 价格 / 标签 / DeepSeek 下架

变更：
- 下架全部 DeepSeek 系列（含 free / Prover）
- glm-5.2、glm-5.3 售价 = 成本 ×1.2 → ~$0.84 / $2.64 per 1M
- kimi-k3、MiniMax-M3 售价 = 成本 ×1.5 → kimi ~$2.25/$11.25；M3 ~$0.225/$0.90
- gpt-image-2.5 / flare / sunburst → 标签「图片」
- grok-1.5-video → 标签「视频按次」
- Qwen3-VL-Embedding-8B → 标签「rag」

按顺序粘贴：
1. scripts/vps-price-tag-ops-p1.txt → OK_PRICE_TAG_1
2. scripts/vps-price-tag-ops-p2.txt → OK_PRICE_TAG_2
3. scripts/vps-price-tag-ops-run.txt → DONE_PRICE_TAG_OPS_20260922

然后网站 Ctrl+F5 刷新模型广场 /pricing。
`
);

console.log({ b64: b64.length, p1: p1.length, p2: p2.length });
