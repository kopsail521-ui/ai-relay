import fs from "fs";
import zlib from "zlib";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/server.mjs")
);
const b64 = zlib.gzipSync(src, { level: 9 }).toString("base64");
const mid = Math.ceil(b64.length / 2);
const out = path.join(root, "scripts");

function lf(name, text) {
  fs.writeFileSync(path.join(out, name), text.replace(/\r\n/g, "\n"));
}

lf(
  "vps-oauth-remind-p1.txt",
  `echo '${b64.slice(0, mid)}' | sudo tee /tmp/mod_server.b64 >/dev/null && echo OK_PART1\n`
);
lf(
  "vps-oauth-remind-p2.txt",
  `echo '${b64.slice(mid)}' | sudo tee -a /tmp/mod_server.b64 >/dev/null && echo OK_PART2\n`
);
lf(
  "vps-oauth-remind-run.txt",
  [
    "base64 -d /tmp/mod_server.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
    "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
    "sudo docker restart ai-relay-creem-moderation",
    "sleep 2",
    "echo DONE_OAUTH_REMIND",
  ].join(" && ") + "\n"
);
lf(
  "vps-oauth-remind-readme.txt",
  `# Google 登录：未勾选隐私条款时弹提醒

按顺序粘贴到阿里云 Workbench（每次一整行）：
1. scripts/vps-oauth-remind-p1.txt → OK_PART1
2. scripts/vps-oauth-remind-p2.txt → OK_PART2
3. scripts/vps-oauth-remind-run.txt → DONE_OAUTH_REMIND

然后登录页 Ctrl+F5。未勾选时点「使用 Google 继续」会出现红色提醒条，并高亮勾选框。
`
);

console.log({
  b64: b64.length,
  p1: mid,
  p2: b64.length - mid,
});
