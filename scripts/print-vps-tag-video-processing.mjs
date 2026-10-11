/**
 * VPS paste: move the 4 aicopy video SKUs to the new 视频处理 tag and add the
 * __tags__ i18n entry to both marketplace copies. No git pull, no heredoc.
 *   node scripts/print-vps-tag-video-processing.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-tag-video-processing.py"));
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const checkPy = `#!/usr/bin/env python3
import json, re
d = json.load(open("/tmp/pricing.json"))
by = {m.get("model_name"): m for m in (d.get("data") or [])}
ok = True
for n in ("keyo-super-resolution-1080p", "keyo-super-resolution-2k",
          "keyo-super-resolution-4k", "keyo-video-subtitle-removal"):
    m = by.get(n)
    t = (m or {}).get("tags")
    print(n, "tags", t)
    if t != "视频处理":
        ok = False
tags = {}
for m in d.get("data") or []:
    for t in str(m.get("tags") or "").split(","):
        t = t.strip()
        if t:
            tags[t] = tags.get(t, 0) + 1
print("tag_video_processing", tags.get("视频处理"), "| video_model_left", tags.get("视频模型"))
print("public_leak", bool(re.search(r"小裴|豆姐|aicopy|unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough|进货|二道|转售", json.dumps(d, ensure_ascii=False))))
print("ALL_OK" if ok else "HAS_FAIL")
print("DONE_TAG_VIDEO_PROCESSING")
`;
const checkB64 = zlib.gzipSync(Buffer.from(checkPy, "utf8"), { level: 9 }).toString("base64");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts",
  `echo '${pyB64}' | sudo tee /tmp/vptag-py.b64 >/dev/null`,
  "base64 -d /tmp/vptag-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-tag-video-processing.py >/dev/null",
  `echo '${checkB64}' | sudo tee /tmp/vptag-chk.b64 >/dev/null`,
  "base64 -d /tmp/vptag-chk.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-check-tag-video-processing.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:rw -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-tag-video-processing.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 4",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code} ' https://www.keyoapi.xyz/api/pricing",
  "python3 /opt/ai-relay/scripts/vps-check-tag-video-processing.py",
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc leaked");
if (short.includes("\n")) throw new Error("short must be one line");

writeLf(path.join(root, "scripts/vps-tag-video-processing-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-tag-video-processing-readme.txt"),
  `# 新增标签「视频处理」并迁移 4 个模型

- models.tags：keyo-super-resolution-1080p / -2k / -4k、keyo-video-subtitle-removal
  -> 视频处理（其余模型不动，视频模型标签保留 12 个）
- 两份 marketplace-model-copy.json：__tags__ 补 视频处理 7 语言条目
  （moderation-proxy 的 normalizeTagToken 已有 视频处理/VideoProc 映射，runbook
  仍会 docker cp server.mjs 保持容器与仓库一致）

粘贴：scripts/vps-tag-video-processing-short.txt（一整行）
期望：
  retag ... rows 1 ×4
  tags_i18n_merged ... ×2
  DONE_TAG_VIDEO_PROCESSING
  pricing=200
  4 行 tags 视频处理
  tag_video_processing 4
  public_leak False
  ALL_OK
  DONE_TAG_VIDEO_PROCESSING
`
);

console.log({ b64: pyB64.length, check: checkB64.length });