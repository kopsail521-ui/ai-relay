/**
 * Print a VPS command that updates an existing configured Creem moderation proxy
 * and points Caddy to :3001. Existing container, secrets and brand pages required.
 * Usage: node scripts/print-vps-moderation-install.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { caddyFullSite } from "./caddy-seo-shared.mjs";
import { imageDeployCommand } from "./print-vps-image-fixes.mjs";

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

// SECURITY/BEHAVIOR CHANGE: this is now an existing-install update only.
// It intentionally does not read or create .env/API keys. Fresh installs must
// provision the moderation secret and container configuration separately first.
// Existing Caddy content is still replaced below as this script historically did.

const serverB64 = Buffer.from(serverSrc).toString("base64");
const routingB64 = Buffer.from(
  fs.readFileSync(path.join(root, "services/creem-moderation-proxy/video-routing.mjs"), "utf8")
).toString("base64");
const dockerB64 = Buffer.from(dockerfile).toString("base64");

const caddy = caddyFullSite({ gitee: false });
const cmd = `${imageDeployCommand("moderation")}
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
${caddy}EOF
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy && curl -sI https://www.keyoapi.xyz/robots.txt | head -n 5 && curl -sI https://www.keyoapi.xyz/ | head -n 5 && sudo docker logs --tail 20 ai-relay-creem-moderation`;

fs.writeFileSync(path.join(root, "scripts/vps-moderation-one-liner.txt"), cmd);
console.log("Wrote scripts/vps-moderation-one-liner.txt (" + cmd.length + " chars)");
console.log("Paste on VPS Workbench after brand pages are installed.");
