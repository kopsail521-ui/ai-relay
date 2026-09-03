/**
 * 生成 VPS Workbench 一键安装命令：部署 Gitee 透传 + 改 Caddy 分流
 * 用法：node scripts/print-vps-gitee-passthrough-install.mjs
 *
 * 大白话：在云服务器控制台粘贴生成的命令，就会：
 * 1) 装上透传小服务（端口 3010）
 * 2) 告诉大门（Caddy）：特殊路径走 3010，其它照旧走审核代理 3001
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const key = process.env.GITEE_API_KEY || env.GITEE_API_KEY || "";
if (!key || /your|changeme|placeholder/i.test(key)) {
  console.error("缺少 GITEE_API_KEY（.env 或环境变量）");
  process.exit(1);
}

const serverSrc = fs.readFileSync(
  path.join(root, "services/gitee-passthrough/server.mjs"),
  "utf8"
);
const dockerfile = fs.readFileSync(
  path.join(root, "services/gitee-passthrough/Dockerfile"),
  "utf8"
);
const catalog = fs.readFileSync(
  path.join(root, "config/gitee-selected-models.json"),
  "utf8"
);
const fixMeta = fs.readFileSync(
  path.join(root, "services/gitee-passthrough/fix-marketplace-meta.mjs"),
  "utf8"
);

const serverB64 = Buffer.from(serverSrc).toString("base64");
const dockerB64 = Buffer.from(dockerfile).toString("base64");
const catalogB64 = Buffer.from(catalog).toString("base64");
const fixMetaB64 = Buffer.from(fixMeta).toString("base64");

// Escape single quotes for embedding in bash single-quoted echo is avoided via base64
const cmd = `set -e
sudo mkdir -p /opt/ai-relay/services/gitee-passthrough
echo '${serverB64}' | base64 -d | sudo tee /opt/ai-relay/services/gitee-passthrough/server.mjs >/dev/null
echo '${dockerB64}' | base64 -d | sudo tee /opt/ai-relay/services/gitee-passthrough/Dockerfile >/dev/null
echo '${catalogB64}' | base64 -d | sudo tee /opt/ai-relay/services/gitee-passthrough/catalog.json >/dev/null
echo '${fixMetaB64}' | base64 -d | sudo tee /opt/ai-relay/services/gitee-passthrough/fix-marketplace-meta.mjs >/dev/null
sudo tee /opt/ai-relay/.env.gitee >/dev/null <<EOF
GITEE_API_KEY=${key}
GITEE_BASE_URL=https://ai.gitee.com
NEW_API_BASE=http://127.0.0.1:3000
NEW_API_DB=/data/one-api.db
CATALOG=/app/catalog.json
PORT=3010
LISTEN_HOST=127.0.0.1
EOF
cd /opt/ai-relay
sudo docker build -t keyo-gitee-passthrough ./services/gitee-passthrough
sudo docker rm -f ai-relay-gitee-passthrough 2>/dev/null || true
sudo docker run -d --name ai-relay-gitee-passthrough --restart always --network host \\
  --env-file /opt/ai-relay/.env.gitee \\
  -v /opt/ai-relay/data/new-api:/data:rw \\
  -e NEW_API_DB=/data/one-api.db \\
  -e CATALOG=/app/catalog.json \\
  keyo-gitee-passthrough
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
www.keyoapi.xyz {
	encode gzip
	handle_path /brand/* {
		root * /opt/ai-relay/static/brand
		file_server
	}
	# 静态资源直连 New API，避免 gzip 叠压导致官网白屏
	handle /static/* {
		reverse_proxy 127.0.0.1:3000 {
			header_up Accept-Encoding identity
		}
	}
	# Gitee 特殊能力：检测/分割/超分/抠图/异步文档视频语音
	@gitee_special path /v1/images/object-detection* /v1/images/segmentation* /v1/images/pose-detection* /v1/images/upscaling* /v1/images/unwarping* /v1/images/mattings* /v1/async/* /v1/task/*
	handle @gitee_special {
		reverse_proxy 127.0.0.1:3010 {
			header_up Accept-Encoding identity
		}
	}
	handle {
		reverse_proxy 127.0.0.1:3001 {
			header_up Accept-Encoding identity
		}
	}
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
sleep 2
curl -sS http://127.0.0.1:3010/healthz || true
echo
sudo docker logs --tail 30 ai-relay-gitee-passthrough
echo DONE_GITEE_PASSTHROUGH
`;

const out = path.join(root, "scripts/vps-gitee-passthrough-one-liner.txt");
fs.writeFileSync(out, cmd);
console.log("Wrote", out, "(" + cmd.length + " chars)");
console.log("在阿里云 Workbench 打开 VPS 终端，整段粘贴执行即可。");
