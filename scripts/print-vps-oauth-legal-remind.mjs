/**
 * Generate VPS commands to hotpatch creem-moderation-proxy OAuth remind script.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { imageDeployCommand } from "./print-vps-image-fixes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/server.mjs")
);
const b64 = zlib.gzipSync(src, { level: 9 }).toString("base64");
const mid = Math.ceil(b64.length / 2);

const write = (name, text) =>
  fs.writeFileSync(path.join(root, "scripts", name), text.replace(/\r\n/g, "\n"));

write(
  "vps-oauth-legal-remind-p1.txt",
  `echo '${b64.slice(0, mid)}' | sudo tee /tmp/mod_server.b64 >/dev/null && echo OK_MOD_P1\n`
);
write(
  "vps-oauth-legal-remind-p2.txt",
  `echo '${b64.slice(mid)}' | sudo tee -a /tmp/mod_server.b64 >/dev/null && echo OK_MOD_P2\n`
);
write(
  "vps-oauth-legal-remind-run.txt",
  [
    "set -euo pipefail",
    "base64 -d /tmp/mod_server.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
    imageDeployCommand("moderation"),
    "sleep 2",
    'curl -sS -m 5 -o /dev/null -w "mod=%{http_code}\\n" http://127.0.0.1:3001/api/status || true',
    "echo DONE_OAUTH_REMIND",
    "",
  ].join("\n")
);
write(
  "vps-oauth-legal-remind.txt",
  `# Google 未勾选隐私条款时弹出提醒
# 依次整行粘贴到 Workbench：
# 1) scripts/vps-oauth-legal-remind-p1.txt → OK_MOD_P1
# 2) scripts/vps-oauth-legal-remind-p2.txt → OK_MOD_P2
# 3) scripts/vps-oauth-legal-remind-run.txt → DONE_OAUTH_REMIND
# 然后浏览器 Ctrl+F5 打开登录页，不勾选条款点「使用 Google 继续」应弹出提醒
`
);

console.log({ b64: b64.length, mid });
