/**
 * Print Workbench one-liner to install brand pages WITHOUT wiping SEO Caddy handles.
 * Brand files only + reload; if Caddy lacks SEO blocks, run print-vps-seo-caddy.mjs.
 *   node scripts/print-vps-brand-install.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const brandDir = path.join(root, "static/brand");

const files = [
  "keyo-home.html",
  "keyo-docs.html",
  "aup.html",
  "privacy.html",
  "terms.html",
  "faq.html",
  "status.html",
  "integrations.html",
];
const parts = files
  .filter((name) => fs.existsSync(path.join(brandDir, name)))
  .map((name) => {
    const b64 = fs.readFileSync(path.join(brandDir, name)).toString("base64");
    return `echo '${b64}' | base64 -d | sudo tee /opt/ai-relay/static/brand/${name} >/dev/null`;
  });

const cmd = [
  "sudo mkdir -p /opt/ai-relay/static/brand",
  ...parts,
  "wc -c /opt/ai-relay/static/brand/*.html",
  "curl -sI https://www.keyoapi.xyz/brand/keyo-home.html | head -n 3",
  "curl -sI https://www.keyoapi.xyz/brand/aup.html | head -n 3",
  'echo "NOTE: This script does not rewrite Caddyfile. For SEO routes use: node scripts/print-vps-seo-caddy.mjs"',
].join(" && ");

fs.writeFileSync(path.join(root, "scripts/vps-one-liner.txt"), cmd);
console.log("Wrote scripts/vps-one-liner.txt (" + cmd.length + " chars)");
console.log("\nPaste the contents of scripts/vps-one-liner.txt on the VPS Workbench.");
