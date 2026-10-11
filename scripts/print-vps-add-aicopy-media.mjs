/**
 * VPS paste: list 9 aicopy media SKUs at cost x 2 (CNY / FX 7.3) on the
 * existing "Keyo Video" channel. No git pull, no bash heredoc.
 *   node scripts/print-vps-add-aicopy-media.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-add-aicopy-media.py"));
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const checkPy = `#!/usr/bin/env python3
import json, re
d = json.load(open("/tmp/pricing.json"))
by = {m.get("model_name"): m for m in (d.get("data") or [])}
want = {
    "keyo-super-resolution-1080p": 0.054795,
    "keyo-super-resolution-2k": 0.109589,
    "keyo-super-resolution-4k": 0.219178,
    "keyo-video-subtitle-removal": 0.013699,
    "grok-image-2.0": 0.00274,
    "keyo-voice-clone": 0.013699,
    "keyo-tts": 0.013699,
    "keyo-song": 0.013699,
    "keyo-asr": 0.013699,
}
ok = True
for n, p in want.items():
    m = by.get(n)
    if not m:
        print(n, "MISSING")
        ok = False
        continue
    got = round(float(m.get("model_price") or 0), 6)
    print(n, "price", got, "tags", m.get("tags"), "vendor", m.get("vendor_name"))
    if abs(got - p) > 1e-9:
        print(n, "PRICE_MISMATCH expected", p)
        ok = False
blob = json.dumps(d, ensure_ascii=False)
print("public_leak", bool(re.search(r"小裴|豆姐|aicopy|unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough|进货|二道|转售", blob)))
print("ALL_OK" if ok else "HAS_FAIL")
print("DONE_ADD_AICOPY_MEDIA")
`;
const checkB64 = zlib.gzipSync(Buffer.from(checkPy, "utf8"), { level: 9 }).toString("base64");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts",
  `echo '${pyB64}' | sudo tee /tmp/acm-py.b64 >/dev/null`,
  "base64 -d /tmp/acm-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-aicopy-media.py >/dev/null",
  `echo '${checkB64}' | sudo tee /tmp/acm-chk.b64 >/dev/null`,
  "base64 -d /tmp/acm-chk.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-check-aicopy-media.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:rw -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-add-aicopy-media.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code} ' https://www.keyoapi.xyz/api/pricing",
  "python3 /opt/ai-relay/scripts/vps-check-aicopy-media.py",
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc leaked");
if (short.includes("\n")) throw new Error("short must be one line");

writeLf(path.join(root, "scripts/vps-add-aicopy-media-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-add-aicopy-media-readme.txt"),
  `# 上架 9 个媒体模型（成本×2，CNY/7.3；复用 Keyo Video 渠道）

上游 /api/pricing 实测 2026-10-11，全部按次计费（quota_type=1，default 组）：

| 公开 ID | 上游 SKU | 成本 CNY | 售价 USD/次 | 标签 |
|---|---|---|---|---|
| keyo-super-resolution-1080p | 小裴-大模型超分-1080分辨率 | 0.2 | 0.054795 | 视频模型 |
| keyo-super-resolution-2k | 小裴-大模型超分-2k分辨率 | 0.4 | 0.109589 | 视频模型 |
| keyo-super-resolution-4k | 小裴-大模型超分-4k分辨率 | 0.8 | 0.219178 | 视频模型 |
| keyo-video-subtitle-removal | 小裴-视频去字幕 | 0.05 | 0.013699 | 视频模型 |
| grok-image-2.0 | grok-图片-2.0 | 0.01 | 0.00274 | 图片 |
| keyo-voice-clone | 【豆姐】音色复刻 | 0.05 | 0.013699 | 语音合成 |
| keyo-tts | 【豆姐】文字转语音 | 0.05 | 0.013699 | 语音合成 |
| keyo-song | 【豆姐】音频生成（歌曲生成） | 0.05 | 0.013699 | 音乐 |
| keyo-asr | 【豆姐】语音转文字 | 0.05 | 0.013699 | 语音识别 |

- 渠道：复用 Keyo Video（model_mapping 合并，既有 grok 映射保留）
- 供应商：8 个 Keyo（icon Custom）+ grok-image-2.0 xAI（icon XAI）
- 端点：4 个视频 SKU 走 /v1/videos（openai-video），其余 5 个走 /v1/chat/completions
- vendor/key 读取 /opt/ai-relay/.env 的 AICOPY_API_KEY；读不到则保留渠道现有 key

粘贴：scripts/vps-add-aicopy-media-short.txt（一整行）
期望：
  channel 1 Keyo Video models added [9 个] mapping added [9 个]
  marketplace created ×9 / vendor created（如缺失）
  price ... = $0.054795 / request (CNY 0.2 x2 / 7.3) ×9
  copy_merged ... ×2
  DONE_ADD_AICOPY_MEDIA
  pricing=200
  9 行 price + tags + vendor
  public_leak False
  ALL_OK
  DONE_ADD_AICOPY_MEDIA
`
);

console.log({ b64: pyB64.length, check: checkB64.length });