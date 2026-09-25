/**
 * Emit VPS short for InfiniteTalk 504 incident refund.
 *   node scripts/print-vps-refund-infinitetalk-504.mjs
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

const pyB64 = pack("scripts/vps-refund-infinitetalk-504.py");

const dry = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts",
  `echo '${pyB64}' | sudo tee /tmp/it-refund-py.b64 >/dev/null`,
  "base64 -d /tmp/it-refund-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-refund-infinitetalk-504.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:ro -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-refund-infinitetalk-504.py /data/one-api.db --dry-run",
].join(" && ");

const live = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts",
  `echo '${pyB64}' | sudo tee /tmp/it-refund-py.b64 >/dev/null`,
  "base64 -d /tmp/it-refund-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-refund-infinitetalk-504.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay:/opt/ai-relay:ro -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-refund-infinitetalk-504.py /data/one-api.db",
].join(" && ");

writeLf(path.join(root, "scripts/vps-refund-infinitetalk-504-dry-short.txt"), dry + "\n");
writeLf(path.join(root, "scripts/vps-refund-infinitetalk-504-short.txt"), live + "\n");
writeLf(
  path.join(root, "scripts/vps-refund-infinitetalk-504-readme.txt"),
  `# 退还 InfiniteTalk 504 空结果扣费（约 $0.342466 / use_time=0）

1) 先预览：scripts/vps-refund-infinitetalk-504-dry-short.txt
   → candidate … dry_run skip refund → DONE_REFUND_INFINITETALK_504
2) 确认后再退：scripts/vps-refund-infinitetalk-504-short.txt
   → refunded … → DONE_REFUND_INFINITETALK_504

默认窗口：2026-09-25 20:35–21:00 CST（UTC 12:35–13:00）。
`
);

console.log({ pyB64: pyB64.length, dry: Buffer.byteLength(dry), live: Buffer.byteLength(live) });
