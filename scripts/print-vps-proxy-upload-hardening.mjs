/**
 * 生成 uploads 存储加固部署粘贴包（Workbench）。
 * 改动：creem-moderation-proxy 写盘前检查磁盘余量，写盘失败返回 503 + 明确错误码
 *       （storage_insufficient / storage_unavailable），不再抛成笼统 502 Bad gateway。
 * 部署后同时打印磁盘用量与容器日志，定位当初 502 的根因（磁盘满/目录问题）。
 * 用法：node scripts/print-vps-proxy-upload-hardening.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function b64gz(rel) {
  return zlib.gzipSync(fs.readFileSync(path.join(root, rel))).toString("base64");
}

const serverB64 = b64gz("services/creem-moderation-proxy/server.mjs");

const cmd = `set -e
cd /opt/ai-relay
echo '${serverB64}' | base64 -d | gunzip | sudo tee services/creem-moderation-proxy/server.mjs >/dev/null
sudo docker build -t keyo-creem-moderation ./services/creem-moderation-proxy
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
echo '--- disk usage (root cause check for the 502s) ---'
df -h / || true
df -h /opt 2>/dev/null || true
echo '--- upload probe: expect 401 invalid_api_key (proxy alive, auth OK) ---'
curl -sS -o /tmp/up_probe.json -w "upload_probe=%{http_code}\\n" -X POST http://127.0.0.1:3001/v1/uploads -H "Authorization: Bearer sk-invalid" -F "file=@/etc/hosts" || true
head -c 200 /tmp/up_probe.json; echo
echo '--- recent proxy logs ---'
sudo docker logs --tail 40 ai-relay-creem-moderation 2>&1 | tail -15
echo DONE_PROXY_UPLOAD_HARDENING
`;

const out = path.join(root, "scripts/vps-proxy-upload-hardening.txt");
fs.writeFileSync(out, cmd);
console.log("Wrote", out, "(" + cmd.length + " chars)");
console.log("Paste scripts/vps-proxy-upload-hardening.txt on the VPS Workbench.");
