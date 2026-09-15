import fs from "fs";
import zlib from "zlib";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const CHUNK = 1800;

const files = [
  ["index.html", "static/seo/index.html", "/opt/ai-relay/static/seo/index.html"],
  ["about.html", "static/seo/about.html", "/opt/ai-relay/static/seo/about.html"],
  [
    "keyo-home.html",
    "static/brand/keyo-home.html",
    "/opt/ai-relay/static/brand/keyo-home.html",
  ],
];

const lines = [
  "set -e",
  "cd /opt/ai-relay",
  "TMP=/tmp/keyo-home-compat",
  'rm -rf "$TMP" && mkdir -p "$TMP"',
];

for (const [name, local, dest] of files) {
  const b64 = zlib
    .gzipSync(fs.readFileSync(path.join(root, local)))
    .toString("base64");
  const parts = [];
  for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
  lines.push(`echo "=== write ${name} (${parts.length} parts) ==="`);
  parts.forEach((p, i) => {
    const op = i === 0 ? "tee" : "tee -a";
    lines.push(`echo '${p}' | sudo ${op} "$TMP/${name}.b64" >/dev/null`);
  });
  lines.push(
    `base64 -d "$TMP/${name}.b64" | gunzip | sudo tee ${dest} >/dev/null`
  );
  lines.push(`wc -c ${dest}`);
}

lines.push(
  "sudo docker cp /opt/ai-relay/static/brand/keyo-home.html ai-relay-new-api:/app/web/dist/brand/keyo-home.html 2>/dev/null || true"
);
lines.push(
  "sudo docker cp /opt/ai-relay/static/brand/keyo-home.html ai-relay-new-api:/app/web/public/brand/keyo-home.html 2>/dev/null || true"
);
lines.push(
  "curl -sS https://www.keyoapi.xyz/ | grep -o 'OpenAI-compatible on chat[^<]*' | head -n1 || true"
);
lines.push(
  "curl -sS https://www.keyoapi.xyz/about | grep -o 'dedicated REST[^<]*' | head -n1 || true"
);
lines.push("echo DONE_HOME_COMPAT_INLINE");

const out = path.join(root, "scripts/vps-home-compat-inline.txt");
fs.writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log("wrote", out, "bytes", fs.statSync(out).size);
