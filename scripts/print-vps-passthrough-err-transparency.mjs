/**
 * 生成视频任务错误透传部署粘贴包（Workbench）。
 * 改动：apimart-passthrough 轮询失败时向客户端返回显式 error 对象，
 *       并在 docker logs 记录 [poll-terminal] 原始上游响应，便于查失败原因。
 * 用法：node scripts/print-vps-passthrough-err-transparency.mjs
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

const serverB64 = b64gz("services/apimart-passthrough/server.mjs");
const trB64 = b64gz("services/apimart-passthrough/task-responses.mjs");

const cmd = `set -e
cd /opt/ai-relay
echo '${serverB64}' | base64 -d | gunzip | sudo tee services/apimart-passthrough/server.mjs >/dev/null
echo '${trB64}' | base64 -d | gunzip | sudo tee services/apimart-passthrough/task-responses.mjs >/dev/null
sudo docker build -t keyo-apimart-passthrough ./services/apimart-passthrough
sudo docker rm -f ai-relay-apimart-passthrough 2>/dev/null || true
sudo docker run -d --name ai-relay-apimart-passthrough --restart always --network host \\
  --env-file /opt/ai-relay/.env.apimart \\
  -v /opt/ai-relay/data:/data \\
  -e NEW_API_DB=/opt/ai-relay/data/new-api/one-api.db \\
  -e CATALOG=/app/catalog.json \\
  keyo-apimart-passthrough
sleep 2
curl -sS http://127.0.0.1:3011/healthz || true
echo
sudo docker logs --tail 15 ai-relay-apimart-passthrough 2>&1 | tail -8
echo DONE_PASSTHROUGH_ERR_TRANSPARENCY
`;

const out = path.join(root, "scripts/vps-passthrough-err-transparency.txt");
fs.writeFileSync(out, cmd);
console.log("Wrote", out, "(" + cmd.length + " chars)");
console.log("Paste scripts/vps-passthrough-err-transparency.txt on the VPS Workbench.");
