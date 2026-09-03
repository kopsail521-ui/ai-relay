/**
 * Print Workbench one-liner to install brand pages (home/docs/aup) + reload Caddy.
 *   node scripts/print-vps-brand-install.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const brandDir = path.join(root, "static/brand");

const files = ["keyo-home.html", "keyo-docs.html", "aup.html", "privacy.html", "terms.html"];
const parts = files.map((name) => {
  const b64 = fs.readFileSync(path.join(brandDir, name)).toString("base64");
  return `echo '${b64}' | base64 -d | sudo tee /opt/ai-relay/static/brand/${name} >/dev/null`;
});

const caddy = `sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
www.keyoapi.xyz {
	encode gzip
	handle_path /brand/* {
		root * /opt/ai-relay/static/brand
		file_server
	}
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`;

const cmd = [
  "sudo mkdir -p /opt/ai-relay/static/brand",
  ...parts,
  caddy,
  "wc -c /opt/ai-relay/static/brand/*.html",
  "curl -sI https://www.keyoapi.xyz/brand/keyo-home.html | head -n 3",
  "curl -sI https://www.keyoapi.xyz/brand/aup.html | head -n 3",
].join(" && ");

fs.writeFileSync(path.join(root, "scripts/vps-one-liner.txt"), cmd);
console.log("Wrote scripts/vps-one-liner.txt (" + cmd.length + " chars)");
console.log("\nPaste the contents of scripts/vps-one-liner.txt on the VPS Workbench.");
