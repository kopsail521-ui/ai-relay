/**
 * 生成「脱敏透传」分步 Workbench 命令（短行，避免断连）
 * 用法：node scripts/print-vps-gitee-passthrough-redeploy.mjs
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

function gzipB64(buf) {
  return zlib.gzipSync(buf, { level: 9 }).toString("base64");
}

function splitParts(b64, chunk = 2200) {
  const parts = [];
  for (let i = 0; i < b64.length; i += chunk) parts.push(b64.slice(i, i + chunk));
  return parts;
}

const serverGz = gzipB64(
  fs.readFileSync(path.join(root, "services/gitee-passthrough/server.mjs"))
);
const fixGz = gzipB64(
  fs.readFileSync(path.join(root, "services/gitee-passthrough/fix-marketplace-meta.mjs"))
);
const dockerSrc = fs.readFileSync(
  path.join(root, "services/gitee-passthrough/Dockerfile"),
  "utf8"
);

const serverParts = splitParts(serverGz);
const fixParts = splitParts(fixGz);

const outDir = path.join(root, "scripts");
const files = [];

serverParts.forEach((p, i) => {
  const n = i + 1;
  const tee = i === 0 ? "sudo tee" : "sudo tee -a";
  const cmd = `echo '${p}' | ${tee} /tmp/pt-server.b64 >/dev/null && echo OK_SERVER_${n}_OF_${serverParts.length}`;
  const name = `vps-passthrough-server-p${n}.txt`;
  writeLf(path.join(outDir, name), cmd + "\n");
  files.push(name);
});

writeLf(
  path.join(outDir, "vps-passthrough-server-decode.txt"),
  "sudo mkdir -p /opt/ai-relay/services/gitee-passthrough && base64 -d /tmp/pt-server.b64 | gunzip | sudo tee /opt/ai-relay/services/gitee-passthrough/server.mjs >/dev/null && echo OK_SERVER_FILE\n"
);
files.push("vps-passthrough-server-decode.txt");

fixParts.forEach((p, i) => {
  const n = i + 1;
  const tee = i === 0 ? "sudo tee" : "sudo tee -a";
  const cmd = `echo '${p}' | ${tee} /tmp/pt-fix.b64 >/dev/null && echo OK_FIX_${n}_OF_${fixParts.length}`;
  const name = `vps-passthrough-fix-p${n}.txt`;
  writeLf(path.join(outDir, name), cmd + "\n");
  files.push(name);
});

writeLf(
  path.join(outDir, "vps-passthrough-fix-decode.txt"),
  "sudo mkdir -p /opt/ai-relay/services/gitee-passthrough && base64 -d /tmp/pt-fix.b64 | gunzip | sudo tee /opt/ai-relay/services/gitee-passthrough/fix-marketplace-meta.mjs >/dev/null && ls -la /opt/ai-relay/services/gitee-passthrough/ && echo OK_FIX_FILE\n"
);
files.push("vps-passthrough-fix-decode.txt");

writeLf(
  path.join(outDir, "vps-passthrough-dockerfile.txt"),
  `sudo tee /opt/ai-relay/services/gitee-passthrough/Dockerfile >/dev/null <<'EOF'
${dockerSrc.trim()}
EOF
echo OK_DOCKERFILE
`
);
files.push("vps-passthrough-dockerfile.txt");

// 重建前先检查三个文件都在；缺 catalog 就从旧容器拷
writeLf(
  path.join(outDir, "vps-passthrough-rebuild.txt"),
  `set -e
DIR=/opt/ai-relay/services/gitee-passthrough
sudo mkdir -p "$DIR"
cd "$DIR"
echo "=== files before build ==="
ls -la
test -f server.mjs || { echo "MISSING server.mjs — 重跑 server p1~p3 + decode"; exit 1; }
test -f fix-marketplace-meta.mjs || { echo "MISSING fix-marketplace-meta.mjs — 重跑 fix p1~p2 + decode"; exit 1; }
if ! test -f catalog.json; then
  echo "catalog.json missing, try copy from old image..."
  sudo docker run --rm --entrypoint cat keyo-gitee-passthrough /app/catalog.json 2>/dev/null | sudo tee catalog.json >/dev/null || true
fi
test -f catalog.json || { echo "MISSING catalog.json"; exit 1; }
cd /opt/ai-relay
sudo docker build -t keyo-gitee-passthrough ./services/gitee-passthrough
sudo docker rm -f ai-relay-gitee-passthrough 2>/dev/null || true
sudo docker run -d --name ai-relay-gitee-passthrough --restart always --network host \\
  --env-file /opt/ai-relay/.env.gitee \\
  -v /opt/ai-relay/data/new-api:/data:rw \\
  -e NEW_API_DB=/data/one-api.db \\
  -e CATALOG=/app/catalog.json \\
  keyo-gitee-passthrough
sleep 2
curl -sS http://127.0.0.1:3010/healthz || true
echo
sudo docker logs --tail 20 ai-relay-gitee-passthrough
echo DONE_PASSTHROUGH_PRIVACY
`
);
files.push("vps-passthrough-rebuild.txt");

const readme = `# 透传脱敏重新部署

第9步失败原因：构建时没有 fix-marketplace-meta.mjs（B 步没写完或断连）。

## 重新连接后，只补这几步

1. scripts/vps-passthrough-fix-p1.txt → OK_FIX_1_OF_2
2. scripts/vps-passthrough-fix-p2.txt → OK_FIX_2_OF_2
3. scripts/vps-passthrough-fix-decode.txt → 应看到文件列表 + OK_FIX_FILE
4. scripts/vps-passthrough-rebuild.txt → DONE_PASSTHROUGH_PRIVACY

若提示 MISSING server.mjs，再重跑 server p1~p3 + decode。
`;

writeLf(path.join(outDir, "vps-passthrough-privacy-readme.txt"), readme);

console.log({
  serverParts: serverParts.length,
  fixParts: fixParts.length,
  files,
});
