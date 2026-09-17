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
  "keyo-api-ref.md",
  "keyo-api-ref.en.md",
  "keyo-api-ref.html",
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
  "sudo mkdir -p /opt/ai-relay/static/brand /opt/ai-relay/static/uploads",
  "sudo chmod 755 /opt/ai-relay/static/uploads",
  ...parts,
  "wc -c /opt/ai-relay/static/brand/keyo-docs.html /opt/ai-relay/static/brand/keyo-api-ref.md /opt/ai-relay/static/brand/keyo-api-ref.en.md 2>/dev/null || true",
  "curl -sI https://www.keyoapi.xyz/brand/keyo-docs.html | head -n 3",
  'echo "NOTE: For POST /v1/uploads runtime, run: node scripts/print-vps-enable-uploads.mjs"',
].join(" && ");

fs.writeFileSync(path.join(root, "scripts/vps-one-liner.txt"), cmd);
console.log("Wrote scripts/vps-one-liner.txt (" + cmd.length + " chars)");
console.log("\nPaste the contents of scripts/vps-one-liner.txt on the VPS Workbench.");
