import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

const py = fs.readFileSync(path.join(__dirname, "reorder-models-by-id.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");
const mid = Math.ceil(b64.length / 2);

writeLf(
  path.join(root, "scripts/vps-reorder-models-p1.txt"),
  `echo '${b64.slice(0, mid)}' | sudo tee /tmp/reorder-models.b64 >/dev/null && echo OK_REORDER_1\n`
);
writeLf(
  path.join(root, "scripts/vps-reorder-models-p2.txt"),
  `echo '${b64.slice(mid)}' | sudo tee -a /tmp/reorder-models.b64 >/dev/null && echo OK_REORDER_2\n`
);
writeLf(
  path.join(root, "scripts/vps-reorder-models-dry.txt"),
  [
    "base64 -d /tmp/reorder-models.b64 | gunzip | sudo tee /tmp/reorder-models.py >/dev/null",
    "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/reorder-models.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db --dry",
  ].join(" && ") + "\n"
);
writeLf(
  path.join(root, "scripts/vps-reorder-models-run.txt"),
  [
    "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/reorder-models.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db --apply",
    "sudo docker restart ai-relay-new-api && sleep 3 && echo DONE_REORDER_MODELS",
  ].join(" && ") + "\n"
);

writeLf(
  path.join(root, "scripts/vps-reorder-models-readme.txt"),
  `# 无 display_order 时的排序方案（软删重建 id）

你的镜像没有 display_order。本方案按 id 倒序展示规则，重排 models.id。

步骤：
1. vps-reorder-models-p1.txt
2. vps-reorder-models-p2.txt
3. vps-reorder-models-dry.txt  ← 先看 head/vendors 是否符合预期
4. 确认后再 vps-reorder-models-run.txt
5. Ctrl+F5
`
);
console.log({ len: b64.length });
