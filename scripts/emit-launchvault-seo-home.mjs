/**
 * Emit one-liner to deploy LaunchVault badge on SEO homepage (Caddy serves / → static/seo/index.html).
 * Usage: node scripts/emit-launchvault-seo-home.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const raw = fs.readFileSync(path.join(root, "static/seo/index.html"));
const b64 = zlib.gzipSync(raw, { level: 9 }).toString("base64");

const CHUNK = 3500;
const parts = [];
for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

parts.forEach((p, idx) => {
  const n = idx + 1;
  const op = idx === 0 ? "sudo tee" : "sudo tee -a";
  writeLf(
    path.join(__dirname, `vps-launchvault-seo-p${n}.txt`),
    `echo '${p}' | ${op} /tmp/lv-seo.b64 >/dev/null && echo OK_LV_SEO_P${n}`
  );
});

writeLf(
  path.join(__dirname, "vps-launchvault-seo-deploy.txt"),
  `set -e
base64 -d /tmp/lv-seo.b64 | gunzip | sudo tee /opt/ai-relay/static/seo/index.html >/dev/null
grep -o 'launchvault.dev' /opt/ai-relay/static/seo/index.html | head -1
curl -sS -H 'Cache-Control: no-cache' https://www.keyoapi.xyz/ | tr -d '\\n' | grep -o 'launchvault.dev' | head -3
echo DONE_LAUNCHVAULT_SEO
`
);

const order = [
  ...parts.map((_, i) => `vps-launchvault-seo-p${i + 1}.txt`),
  "vps-launchvault-seo-deploy.txt",
];
writeLf(
  path.join(__dirname, "vps-launchvault-seo-README.txt"),
  `# Fix: LaunchVault checks SEO / (static/seo/index.html), not SPA inject.\nPaste in order:\n${order.map((f, i) => `${i + 1}) scripts/${f}`).join("\n")}\n`
);

console.log(JSON.stringify({ parts: parts.length, order, bytes: raw.length }, null, 2));
