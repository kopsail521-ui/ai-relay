/**
 * VPS short: redeploy gitee-passthrough — scrub client error code/message
 * (no passthrough / special-path wording).
 * Usage: node scripts/print-vps-gitee-err-scrub.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pack = (rel) =>
  zlib.gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 }).toString("base64");

const srv = pack("services/gitee-passthrough/server.mjs");

const short = [
  "cd /opt/ai-relay",
  `echo '${srv}' | sudo tee /tmp/gitee-srv.b64 >/dev/null`,
  "base64 -d /tmp/gitee-srv.b64 | gunzip | sudo tee /opt/ai-relay/services/gitee-passthrough/server.mjs >/dev/null",
  "sudo docker build -t keyo-gitee-passthrough /opt/ai-relay/services/gitee-passthrough",
  "sudo docker rm -f ai-relay-gitee-passthrough 2>/dev/null || true",
  "sudo docker run -d --name ai-relay-gitee-passthrough --restart always --network host --env-file /opt/ai-relay/.env.gitee -e PORT=3010 keyo-gitee-passthrough",
  "sleep 2",
  "curl -sS http://127.0.0.1:3010/healthz | head -c 200; echo",
  "echo DONE_GITEE_ERR_SCRUB",
].join(" && ");

const out = path.join(root, "scripts/vps-gitee-err-scrub-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
