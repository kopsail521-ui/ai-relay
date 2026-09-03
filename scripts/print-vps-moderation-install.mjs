/**
 * Print a VPS one-liner that installs the Creem moderation proxy + points Caddy to :3001
 * Usage:
 *   set CREEM_API_KEY=creem_test_xxx
 *   set CREEM_TEST_MODE=true
 *   node scripts/print-vps-moderation-install.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const serverSrc = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/server.mjs"),
  "utf8"
);
const dockerfile = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/Dockerfile"),
  "utf8"
);

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
const key = process.env.CREEM_API_KEY || env.CREEM_API_KEY || "";
const testMode = process.env.CREEM_TEST_MODE || env.CREEM_TEST_MODE || "true";
if (!key) {
  console.error("Missing CREEM_API_KEY in env or .env");
  process.exit(1);
}

const serverB64 = Buffer.from(serverSrc).toString("base64");
const dockerB64 = Buffer.from(dockerfile).toString("base64");

const cmd = `sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy && echo '${serverB64}' | base64 -d | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null && echo '${dockerB64}' | base64 -d | sudo tee /opt/ai-relay/services/creem-moderation-proxy/Dockerfile >/dev/null && printf 'CREEM_API_KEY=${key}\\nCREEM_TEST_MODE=${testMode}\\n' | sudo tee /opt/ai-relay/.env.moderation >/dev/null && cd /opt/ai-relay && sudo docker build -t keyo-creem-moderation ./services/creem-moderation-proxy && sudo docker rm -f ai-relay-creem-moderation 2>/dev/null; sudo docker run -d --name ai-relay-creem-moderation --restart always --network host --env-file /opt/ai-relay/.env.moderation -e UPSTREAM_URL=http://127.0.0.1:3000 -e LISTEN_HOST=127.0.0.1 -e PORT=3001 keyo-creem-moderation && sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
www.keyoapi.xyz {
	encode gzip
	handle_path /brand/* {
		root * /opt/ai-relay/static/brand
		file_server
	}
	handle /static/* {
		reverse_proxy 127.0.0.1:3000 {
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
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy && curl -sI https://www.keyoapi.xyz/ | head -n 5 && sudo docker logs --tail 20 ai-relay-creem-moderation`;

fs.writeFileSync(path.join(root, "scripts/vps-moderation-one-liner.txt"), cmd);
console.log("Wrote scripts/vps-moderation-one-liner.txt (" + cmd.length + " chars)");
console.log("Paste on VPS Workbench after brand pages are installed.");
