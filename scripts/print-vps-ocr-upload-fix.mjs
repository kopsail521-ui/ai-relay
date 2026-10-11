/**
 * 生成 OCR 上传修复部署粘贴包（Workbench）。
 *
 * 修复（commit 2cad42e）：
 *   1. 代理主路径请求体封顶（PROXY_MAX_BODY_BYTES，默认 128MiB），超限 413 快速失败，
 *      不再无限缓冲把 1GB VPS 拖到挂起（MinerU 大 PDF 提交超时的根因）。
 *   2. /v1/uploads 写盘前按「文件大小 + 64MB」预留空间；ENOSPC/EDQUOT 归类为
 *      storage_insufficient（存储已满），不再误报 storage_unavailable。
 *
 * 部署后打印磁盘/内存/上传目录/容器日志，一并回答「为什么 503」的现场问题。
 * 用法：node scripts/print-vps-ocr-upload-fix.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const serverB64 = zlib
  .gzipSync(fs.readFileSync(path.join(root, "services/creem-moderation-proxy/server.mjs")))
  .toString("base64");

const cmd = `set -e
cd /opt/ai-relay
sudo git pull --ff-only origin main
echo '${serverB64}' | base64 -d | gunzip | sudo tee services/creem-moderation-proxy/server.mjs >/dev/null
sudo docker build -q -t keyo-creem-moderation ./services/creem-moderation-proxy
sudo docker rm -f ai-relay-creem-moderation 2>/dev/null || true
sudo docker run -d --name ai-relay-creem-moderation --restart always --network host \\
  --env-file /opt/ai-relay/.env.moderation \\
  -e UPSTREAM_URL=http://127.0.0.1:3000 \\
  -e LISTEN_HOST=127.0.0.1 \\
  -e PORT=3001 \\
  -e UPLOAD_DIR=/opt/ai-relay/static/uploads \\
  -e UPLOAD_PUBLIC_BASE=https://www.keyoapi.xyz/uploads \\
  -e UPLOAD_MAX_BYTES=104857600 \\
  -e UPLOAD_TTL_HOURS=48 \\
  -v /opt/ai-relay/static/uploads:/opt/ai-relay/static/uploads \\
  keyo-creem-moderation
sleep 2
echo '--- probe: expect 401 invalid_api_key ---'
curl -sS -o /tmp/up_probe.json -w "upload_probe=%{http_code}\\n" -X POST http://127.0.0.1:3001/v1/uploads -H "Authorization: Bearer sk-invalid" -F "file=@/etc/hosts" || true
head -c 160 /tmp/up_probe.json; echo
echo '--- 磁盘（503 的现场答案） ---'
df -h / || true
echo '--- 内存（MinerU 超时的现场答案） ---'
free -m || true
echo '--- 上传目录 ---'
sudo du -sh /opt/ai-relay/static/uploads 2>/dev/null || true
sudo ls /opt/ai-relay/static/uploads 2>/dev/null | wc -l
echo '--- 代理日志里的写盘失败 ---'
sudo docker logs ai-relay-creem-moderation 2>&1 | grep -i "uploads" | tail -10 || true
echo '--- new-api 日志里的 OCR/任务超时 ---'
sudo docker logs --tail 400 ai-relay-new-api 2>&1 | grep -iE "mineru|unlimited-ocr|documents/parse|task" | tail -12 || true
echo DONE_OCR_UPLOAD_FIX
`;

const out = path.join(root, "scripts/vps-ocr-upload-fix.txt");
fs.writeFileSync(out, cmd);
console.log("Wrote", out, "(" + cmd.length + " chars)");
