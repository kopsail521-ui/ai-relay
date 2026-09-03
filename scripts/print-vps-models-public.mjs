/**
 * 生成「模型广场未登录可访问」Workbench 部署包：只更新 moderation proxy server.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const server = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/server.mjs"),
  "utf8"
);

if (!server.includes("redirectModelsToPricing")) {
  throw new Error("server.mjs missing redirectModelsToPricing");
}
if (!server.includes("keyo-models-public")) {
  throw new Error("server.mjs missing keyo-models-public inject");
}

const b64 = zlib.gzipSync(Buffer.from(server, "utf8"), { level: 9 }).toString("base64");
const CHUNK = 2200;
const parts = [];
for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

parts.forEach((p, idx) => {
  const n = idx + 1;
  const op = idx === 0 ? "sudo tee" : "sudo tee -a";
  writeLf(
    path.join(__dirname, `vps-models-public-p${n}.txt`),
    `echo '${p}' | ${op} /tmp/vps-models-public.b64 >/dev/null && echo OK_PART${n}`
  );
});

writeLf(
  path.join(__dirname, "vps-models-public-deploy.txt"),
  `set -e
sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy
base64 -d /tmp/vps-models-public.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null
cd /opt/ai-relay
sudo docker build -t keyo-creem-moderation ./services/creem-moderation-proxy
sudo docker rm -f ai-relay-creem-moderation 2>/dev/null || true
sudo docker run -d --name ai-relay-creem-moderation --restart always --network host \\
  --env-file /opt/ai-relay/.env.moderation \\
  -e UPSTREAM_URL=http://127.0.0.1:3000 \\
  -e LISTEN_HOST=127.0.0.1 \\
  -e PORT=3001 \\
  keyo-creem-moderation
sleep 2
code=$(curl -sS -o /dev/null -w "%{http_code}" -L --max-redirs 0 http://127.0.0.1:3001/models || true)
loc=$(curl -sS -o /dev/null -w "%{redirect_url}" -L --max-redirs 0 http://127.0.0.1:3001/models || true)
echo "models_http=$code loc=$loc"
curl -sS http://127.0.0.1:3001/ | grep -oE 'keyo-models-public|keyo-pricing-sort-v6' | sort -u
echo DONE_MODELS_PUBLIC`
);

writeLf(
  path.join(__dirname, "vps-models-public-readme.txt"),
  `模型广场未登录开放（Workbench）
1) 依次粘贴 vps-models-public-p1.txt … p${parts.length}.txt
2) 粘贴 vps-models-public-deploy.txt
3) 看到 DONE_MODELS_PUBLIC 后，无痕/退出登录访问：
   https://www.keyoapi.xyz/pricing  （应直接看广场）
   https://www.keyoapi.xyz/models   （应跳到 /pricing，不再进登录）
`
);

console.log(
  JSON.stringify(
    { parts: parts.length, b64Chars: b64.length, out: "scripts/vps-models-public-*" },
    null,
    2
  )
);
