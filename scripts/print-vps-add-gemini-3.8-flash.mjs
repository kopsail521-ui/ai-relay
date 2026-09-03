/**
 * 生成 Workbench：上线 gemini-3.8-flash（改库，绕过管理端 session 限制）
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

const py = fs.readFileSync(path.join(__dirname, "add-gemini-3.8-flash.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");
const mid = Math.ceil(b64.length / 2);
const p1 = b64.slice(0, mid);
const p2 = b64.slice(mid);

writeLf(
  path.join(root, "scripts/vps-add-gemini-3.8-flash-p1.txt"),
  `echo '${p1}' | sudo tee /tmp/add-gem38.b64 >/dev/null && echo OK_GEM38_1\n`
);
writeLf(
  path.join(root, "scripts/vps-add-gemini-3.8-flash-p2.txt"),
  `echo '${p2}' | sudo tee -a /tmp/add-gem38.b64 >/dev/null && echo OK_GEM38_2\n`
);
writeLf(
  path.join(root, "scripts/vps-add-gemini-3.8-flash-run.txt"),
  [
    "base64 -d /tmp/add-gem38.b64 | gunzip | sudo tee /tmp/add-gem38.py >/dev/null",
    "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/add-gem38.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
    "sudo docker restart ai-relay-new-api && sleep 3 && echo DONE_ADD_GEMINI_3_8_FLASH",
  ].join(" && ") + "\n"
);

writeLf(
  path.join(root, "scripts/vps-add-gemini-3.8-flash-readme.txt"),
  `# 上线 gemini-3.8-flash（OpenLux ×5）

上游：https://api.openlux.ai
售价（最便宜组 Anti-Gemini-1 ×5）：
- 输入 ~$0.28 / M
- 输出 ~$1.38 / M
- ModelRatio=0.137869 CompletionRatio=5

按顺序粘贴：
1. scripts/vps-add-gemini-3.8-flash-p1.txt → OK_GEM38_1
2. scripts/vps-add-gemini-3.8-flash-p2.txt → OK_GEM38_2
3. scripts/vps-add-gemini-3.8-flash-run.txt → DONE_ADD_GEMINI_3_8_FLASH

然后网站 Ctrl+F5，模型广场应出现 gemini-3.8-flash（Google / 大语言模型）。
也可本地：node scripts/setup-openlux-models.mjs gemini-3.8-flash
`
);

console.log({ b64: b64.length, p1: p1.length, p2: p2.length });
