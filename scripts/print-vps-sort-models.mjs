/**
 * 生成 Workbench：按供应商顺序 + 新模型靠前 重排模型广场
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

const py = fs.readFileSync(path.join(__dirname, "sort-models-by-vendor.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");
const mid = Math.ceil(b64.length / 2);

writeLf(
  path.join(root, "scripts/vps-sort-models-p1.txt"),
  `echo '${b64.slice(0, mid)}' | sudo tee /tmp/sort-models.b64 >/dev/null && echo OK_SORT_1\n`
);
writeLf(
  path.join(root, "scripts/vps-sort-models-p2.txt"),
  `echo '${b64.slice(mid)}' | sudo tee -a /tmp/sort-models.b64 >/dev/null && echo OK_SORT_2\n`
);
writeLf(
  path.join(root, "scripts/vps-sort-models-dry.txt"),
  [
    "base64 -d /tmp/sort-models.b64 | gunzip | sudo tee /tmp/sort-models.py >/dev/null",
    "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/sort-models.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db --dry",
  ].join(" && ") + "\n"
);
writeLf(
  path.join(root, "scripts/vps-sort-models-run.txt"),
  [
    "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/sort-models.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
    "sudo docker restart ai-relay-new-api && sleep 3 && echo DONE_SORT_MODELS",
  ].join(" && ") + "\n"
);

writeLf(
  path.join(root, "scripts/vps-sort-models-readme.txt"),
  `# 模型广场排序

规则：
1. 按供应商：OpenAI → Anthropic → Google → DeepSeek → … → 其他最后
2. 同一供应商内：新模型（更大 id）靠前
3. 「其他」排最后

步骤：
1. vps-sort-models-p1.txt → OK_SORT_1
2. vps-sort-models-p2.txt → OK_SORT_2
3. vps-sort-models-dry.txt → 先预览（若报 display_order 不存在，说明当前镜像不支持，停下来告诉我）
4. 预览 OK 后再跑 vps-sort-models-run.txt → DONE_SORT_MODELS
5. 网站 Ctrl+F5
`
);

console.log({ b64: b64.length, mid });
