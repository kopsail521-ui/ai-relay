/**
 * VPS short: redeploy gitee-passthrough with InfiniteTalk bill-after-task_id fix.
 *   node scripts/print-vps-infinitetalk-bill-after-taskid.mjs
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

const serverB64 = pack("services/gitee-passthrough/server.mjs");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/gitee-passthrough /opt/ai-relay/scripts",
  "sudo git pull --ff-only origin main || echo PULL_SKIP",
  `echo '${serverB64}' | sudo tee /tmp/it-billfix-server.b64 >/dev/null`,
  "base64 -d /tmp/it-billfix-server.b64 | gunzip | sudo tee /opt/ai-relay/services/gitee-passthrough/server.mjs >/dev/null",
  "sudo docker build -t keyo-gitee-passthrough ./services/gitee-passthrough",
  "sudo docker rm -f ai-relay-gitee-passthrough 2>/dev/null || true",
  "sudo docker run -d --name ai-relay-gitee-passthrough --restart always --network host --env-file /opt/ai-relay/.env.gitee -v /opt/ai-relay/data/new-api:/data:rw -e NEW_API_DB=/data/one-api.db -e NEW_API_BASE=http://127.0.0.1:3000 -e CATALOG=/app/catalog.json -e LISTEN_HOST=127.0.0.1 -e PORT=3010 keyo-gitee-passthrough",
  "sleep 2",
  "curl -sS http://127.0.0.1:3010/healthz || true",
  "echo",
  'sudo docker exec ai-relay-gitee-passthrough grep -n "billAfterTaskId\\|INFINITETALK_SUBMIT_TIMEOUT\\|missing_task_id\\|deferWrite" /app/server.mjs | head -20',
  "sudo docker logs --tail 15 ai-relay-gitee-passthrough",
  "echo DONE_INFINITETALK_BILL_AFTER_TASKID",
].join(" && ");

writeLf(path.join(root, "scripts/vps-infinitetalk-bill-after-taskid-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-infinitetalk-bill-after-taskid-readme.txt"),
  `# InfiniteTalk: 有 task_id 再扣费；504/无 id 不扣费；提交超时 10 分钟

粘贴：scripts/vps-infinitetalk-bill-after-taskid-short.txt
→ DONE_INFINITETALK_BILL_AFTER_TASKID

事故退款（该次 $0.342466）：scripts/vps-refund-infinitetalk-504-readme.txt
`
);

console.log({
  serverB64: serverB64.length,
  short: Buffer.byteLength(short),
});
