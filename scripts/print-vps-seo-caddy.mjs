/**
 * Print a VPS one-liner that:
 * 1) syncs static/seo (base64 tarball)
 * 2) installs durable Caddyfile with SEO handles BEFORE SPA proxy
 *
 * Usage: node scripts/print-vps-seo-caddy.mjs
 * Then paste scripts/vps-seo-deploy-one-liner.txt into Aliyun Workbench.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { caddyFullSite } from "./caddy-seo-shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const seoDir = path.join(root, "static/seo");

if (!fs.existsSync(path.join(seoDir, "index.html"))) {
  console.error("Missing static/seo/index.html — run: node scripts/build-seo-model-pages-content.mjs && node scripts/gen-seo-pages.mjs");
  process.exit(1);
}

const tarPath = path.join(root, "scripts/_seo-bundle.tar.gz");
execSync(`tar -czf "${tarPath}" -C "${path.join(root, "static")}" seo`, {
  stdio: "inherit",
  shell: true,
});
const tarB64 = fs.readFileSync(tarPath).toString("base64");
fs.unlinkSync(tarPath);

const caddy = caddyFullSite({ gitee: true });

const cmd = `set -e
sudo mkdir -p /opt/ai-relay/static
echo '${tarB64}' | base64 -d | sudo tar -xzf - -C /opt/ai-relay/static
sudo cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.seo-$(date +%Y%m%d%H%M%S)" || true
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
${caddy}EOF
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
echo '--- DoD checks ---'
curl -sI https://www.keyoapi.xyz/robots.txt | tr -d '\\r' | head -n 8
echo '---'
curl -fsS https://www.keyoapi.xyz/robots.txt | head -n 8
echo '---'
curl -fsS https://www.keyoapi.xyz/sitemap.xml | head -n 15
echo '---'
curl -fsS https://www.keyoapi.xyz/ | grep -E '<h1|cheap llm api|ai api relay' | head -n 5
echo '---'
curl -fsS https://www.keyoapi.xyz/compare | grep -E '<h1|AI API price comparison' | head -n 3
echo '---'
curl -fsS https://www.keyoapi.xyz/model/whisper-large-v3 | grep -E '<h1|Whisper' | head -n 3
echo DONE_SEO_DEPLOY
`;

const out = path.join(root, "scripts/vps-seo-deploy-one-liner.txt");
fs.writeFileSync(out, cmd);
console.log("Wrote", out, "(" + cmd.length + " chars, tar b64", tarB64.length, ")");
console.log("Paste the file contents into Aliyun Workbench on the VPS.");
