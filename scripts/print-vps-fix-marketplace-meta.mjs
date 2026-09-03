/**
 * 生成 Workbench 命令：gzip+base64 压缩后分 2 段写入，再执行
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const py = fs.readFileSync(path.join(__dirname, "fix-marketplace-meta.py"), "utf8");
const gz = zlib.gzipSync(Buffer.from(py, "utf8"), { level: 9 });
const b64 = gz.toString("base64");

const mid = Math.ceil(b64.length / 2);
const part1 = b64.slice(0, mid);
const part2 = b64.slice(mid);

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

const p1 = `echo '${part1}' | sudo tee /tmp/fix_mp.b64 >/dev/null && echo OK_PART1`;
const p2 = `echo '${part2}' | sudo tee -a /tmp/fix_mp.b64 >/dev/null && echo OK_PART2`;
const run = [
  "base64 -d /tmp/fix_mp.b64 | gunzip | sudo tee /tmp/fix_mp.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /tmp/fix_mp.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
].join(" && ");
const step2 =
  "sudo docker restart ai-relay-new-api && sleep 3 && echo DONE_FIX_MARKETPLACE";

writeLf(path.join(root, "scripts/vps-fix-marketplace-p1.txt"), p1 + "\n");
writeLf(path.join(root, "scripts/vps-fix-marketplace-p2.txt"), p2 + "\n");
writeLf(path.join(root, "scripts/vps-fix-marketplace-run.txt"), run + "\n");
writeLf(path.join(root, "scripts/vps-fix-marketplace-step2.txt"), step2 + "\n");

// 清理容易误导的旧文件
for (const f of [
  "vps-fix-marketplace-step1.txt",
  "vps-fix-marketplace-step1a.txt",
  "vps-fix-marketplace-step1b.txt",
  "vps-fix-marketplace-step1b-fallback.txt",
  "vps-fix-marketplace-step1-fallback.txt",
  "vps-fix-marketplace-step1-import.txt",
  "vps-fix-marketplace-step1-curl.txt",
  "vps-fix-marketplace-p3.txt",
  "vps-fix-marketplace-p4.txt",
  "vps-fix-marketplace-p5.txt",
  "vps-fix-marketplace-p6.txt",
]) {
  const fp = path.join(root, "scripts", f);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

const readme = `# 修正模型广场左侧：供应商 + 标签

之前命令没真正改库（乱码 / SyntaxError），所以页面还是旧的。

## 只粘贴 4 次（每次一整行）

1. scripts/vps-fix-marketplace-p1.txt → 应看到 OK_PART1
2. scripts/vps-fix-marketplace-p2.txt → 应看到 OK_PART2
3. scripts/vps-fix-marketplace-run.txt → 应看到 JSON（含 大语言模型，multiTag: []）
   首次可能拉 python 镜像，等 1～2 分钟
4. scripts/vps-fix-marketplace-step2.txt → DONE_FIX_MARKETPLACE

然后网站模型广场 Ctrl+F5。

期望左侧：
- 供应商：无「模力方舟」，未知为「其他」
- 标签：大语言模型 / OCR / 语音识别 / 语音合成 / 内容风控 / 图像处理 / 数字人 / 文生图
- 每个模型只有 1 个标签
`;

writeLf(path.join(root, "scripts/vps-fix-marketplace-meta-one-liner.txt"), readme);

console.log({
  py: py.length,
  gz: gz.length,
  b64: b64.length,
  p1: p1.length,
  p2: p2.length,
  run: run.length,
});
