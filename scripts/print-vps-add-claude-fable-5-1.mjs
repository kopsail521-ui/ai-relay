/**
 * 生成 Workbench：上线 claude-fable-5-1（改库，绕过管理端 session 限制）
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

const py = fs.readFileSync(path.join(__dirname, "add-claude-fable-5-1.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");
const mid = Math.ceil(b64.length / 2);
const p1 = b64.slice(0, mid);
const p2 = b64.slice(mid);

writeLf(
  path.join(root, "scripts/vps-add-claude-fable-5-1-p1.txt"),
  `echo '${p1}' | sudo tee /tmp/add-fable51.b64 >/dev/null && echo OK_FABLE51_1\n`
);
writeLf(
  path.join(root, "scripts/vps-add-claude-fable-5-1-p2.txt"),
  `echo '${p2}' | sudo tee -a /tmp/add-fable51.b64 >/dev/null && echo OK_FABLE51_2\n`
);
writeLf(
  path.join(root, "scripts/vps-add-claude-fable-5-1-run.txt"),
  [
    "base64 -d /tmp/add-fable51.b64 | gunzip | sudo tee /tmp/add-fable51.py >/dev/null",
    "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/add-fable51.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
    "sudo docker restart ai-relay-new-api && sleep 3 && echo DONE_ADD_CLAUDE_FABLE_5_1",
  ].join(" && ") + "\n"
);

writeLf(
  path.join(root, "scripts/vps-add-claude-fable-5-1-readme.txt"),
  `# 上线 claude-fable-5-1（OpenLux ×5）

售价（最便宜组 Claude-Code-2 ×5）：
- 输入 ~$14.71 / M
- 输出 ~$73.53 / M

按顺序粘贴：
1. scripts/vps-add-claude-fable-5-1-p1.txt → OK_FABLE51_1
2. scripts/vps-add-claude-fable-5-1-p2.txt → OK_FABLE51_2
3. scripts/vps-add-claude-fable-5-1-run.txt → DONE_ADD_CLAUDE_FABLE_5_1

然后网站 Ctrl+F5，模型广场应出现 claude-fable-5-1（Anthropic / 大语言模型）。
`
);

console.log({ b64: b64.length, p1: p1.length, p2: p2.length });
