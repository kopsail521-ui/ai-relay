/**
 * 出海站模型简介 7 语 + 计费单位：打包 moderation 代理部署
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

spawnSync(process.execPath, [path.join(__dirname, "_gen-marketplace-copy.mjs")], {
  stdio: "inherit",
});
spawnSync(process.execPath, [path.join(__dirname, "rebuild-moderation-i18n.mjs")], {
  stdio: "inherit",
});

const serverGz = zlib
  .gzipSync(fs.readFileSync(path.join(root, "services/creem-moderation-proxy/server.mjs")), {
    level: 9,
  })
  .toString("base64");
const copyGz = zlib
  .gzipSync(
    fs.readFileSync(
      path.join(root, "services/creem-moderation-proxy/marketplace-model-copy.json")
    ),
    { level: 9 }
  )
  .toString("base64");
const dockerGz = zlib
  .gzipSync(fs.readFileSync(path.join(root, "services/creem-moderation-proxy/Dockerfile")), {
    level: 9,
  })
  .toString("base64");
const pyGz = zlib
  .gzipSync(fs.readFileSync(path.join(root, "scripts/vps-update-marketplace-copy.py")), {
    level: 9,
  })
  .toString("base64");

const chunk = 2200;
function partsOf(b64, prefix) {
  const parts = [];
  for (let i = 0; i < b64.length; i += chunk) parts.push(b64.slice(i, i + chunk));
  parts.forEach((p, i) => {
    const n = i + 1;
    const tee = i === 0 ? "sudo tee" : "sudo tee -a";
    writeLf(
      path.join(root, `scripts/${prefix}-p${n}.txt`),
      `echo '${p}' | ${tee} /tmp/${prefix}.b64 >/dev/null && echo OK_${prefix.toUpperCase().replace(/-/g, "_")}_${n}_OF_${parts.length}\n`
    );
  });
  return parts.length;
}

// clean old mod parts
for (const f of fs.readdirSync(path.join(root, "scripts"))) {
  if (/^vps-mkt-mod-p\d+\.txt$/.test(f)) fs.unlinkSync(path.join(root, "scripts", f));
}

const nMod = partsOf(serverGz, "vps-mkt-mod");
writeLf(
  path.join(root, "scripts/vps-mkt-copy.txt"),
  `echo '${copyGz}' | sudo tee /tmp/vps-mkt-copy.b64 >/dev/null && echo OK_COPY_B64\n`
);
writeLf(
  path.join(root, "scripts/vps-mkt-docker.txt"),
  `echo '${dockerGz}' | sudo tee /tmp/vps-mkt-docker.b64 >/dev/null && echo OK_DOCKER_B64\n`
);
writeLf(
  path.join(root, "scripts/vps-mkt-py.txt"),
  `echo '${pyGz}' | sudo tee /tmp/vps-mkt-py.b64 >/dev/null && echo OK_PY_B64\n`
);

writeLf(
  path.join(root, "scripts/vps-mkt-deploy.txt"),
  `set -e
sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/config /opt/ai-relay/scripts
base64 -d /tmp/vps-mkt-mod.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null
base64 -d /tmp/vps-mkt-copy.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null
base64 -d /tmp/vps-mkt-copy.b64 | gunzip | sudo tee /opt/ai-relay/config/marketplace-model-copy.json >/dev/null
base64 -d /tmp/vps-mkt-docker.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/Dockerfile >/dev/null
base64 -d /tmp/vps-mkt-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-update-marketplace-copy.py >/dev/null
sudo python3 /opt/ai-relay/scripts/vps-update-marketplace-copy.py /opt/ai-relay/data/new-api/one-api.db /opt/ai-relay/config/marketplace-model-copy.json
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
curl -sS http://127.0.0.1:3001/api/pricing | python3 -c "import sys,json;d=json.load(sys.stdin);m=next(x for x in d['data'] if x['model_name']=='gemma-4-26B-A4B-it');print((m.get('description') or '')[:160])"
echo
curl -sS http://127.0.0.1:3001/ | grep -oE 'keyo-pricing-sort-v6|keyo-locale-desc|keyo-billing-unit' | sort -u
echo DONE_MARKETPLACE_COPY
`
);

writeLf(
  path.join(root, "scripts/vps-mkt-readme.txt"),
  `# 模型简介跟随右上角全部语言（7 语）

简体中文 / 繁體中文 / English / Français / Русский / 日本語 / Tiếng Việt
切换语言会自动刷新页面简介。

Workbench 依次粘贴：
${Array.from({ length: nMod }, (_, i) => `${i + 1}. vps-mkt-mod-p${i + 1}.txt`).join("\n")}
${nMod + 1}. vps-mkt-copy.txt
${nMod + 2}. vps-mkt-docker.txt
${nMod + 3}. vps-mkt-py.txt
${nMod + 4}. vps-mkt-deploy.txt → DONE_MARKETPLACE_COPY

自检：右上角切 中文 / English / 日本語，打开 gemma-4-26B-A4B-it，简介语言应一致。
`
);

console.log({ nMod, serverB64: serverGz.length, copyB64: copyGz.length });
