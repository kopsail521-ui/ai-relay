/**
 * Short LaunchVault badge deploy (patch existing creem server.mjs + brand footers).
 * Usage: node scripts/emit-launchvault-badge-short.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

function pack(rel) {
  return zlib.gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 }).toString("base64");
}

const CHUNK = 3500;
function chunkParts(b64, prefix) {
  const parts = [];
  for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
  parts.forEach((p, idx) => {
    const n = idx + 1;
    const op = idx === 0 ? "sudo tee" : "sudo tee -a";
    writeLf(
      path.join(__dirname, `vps-launchvault-${prefix}-p${n}.txt`),
      `echo '${p}' | ${op} /tmp/lv-${prefix}.b64 >/dev/null && echo OK_LV_${prefix.toUpperCase()}_P${n}`
    );
  });
  return parts.length;
}

// Tiny Python patch: insert badge inject if missing (no full server.mjs upload).
const py = `import pathlib
p=pathlib.Path('/opt/ai-relay/services/creem-moderation-proxy/server.mjs')
t=p.read_text(encoding='utf-8')
if 'keyo-launchvault-badge' in t:
    print('ALREADY_HAS_LAUNCHVAULT')
else:
    needle='      if (changed) {'+chr(10)+'        buf = Buffer.from(html, "utf8");'
    insert='''      // LaunchVault badge: dofollow HTML on non-auth SPA shells (homepage verify).
      if (
        wantPricingPatches &&
        html.includes("</body>") &&
        !html.includes("keyo-launchvault-badge")
      ) {
        const badge = \`<!--keyo-launchvault-badge--><div id="keyo-launchvault-badge" style="position:fixed;right:12px;bottom:12px;z-index:40;line-height:0"><a href="https://www.launchvault.dev" target="_blank" title="Featured on LaunchVault"><img src="https://www.launchvault.dev/images/badges/launch-valut-badge.svg" alt="Featured on LaunchVault" style="width:195px;height:auto" /></a></div>\`;
        html = html.replace("</body>", \`\${badge}</body>\`);
        changed = true;
      }
      if (changed) {
        buf = Buffer.from(html, "utf8");'''
    if needle not in t:
        raise SystemExit('NEEDLE_NOT_FOUND')
    t=t.replace(needle, insert, 1)
    p.write_text(t,encoding='utf-8')
    print('PATCHED_LAUNCHVAULT')
`;

const pyB64 = Buffer.from(py, "utf8").toString("base64");
const homeN = chunkParts(pack("static/brand/keyo-home.html"), "home");
const faqN = chunkParts(pack("static/brand/faq.html"), "faq");

writeLf(
  path.join(__dirname, "vps-launchvault-p0-patch.txt"),
  `echo '${pyB64}' | base64 -d | sudo tee /tmp/lv-patch.py >/dev/null && sudo python3 /tmp/lv-patch.py && grep -o 'keyo-launchvault-badge' /opt/ai-relay/services/creem-moderation-proxy/server.mjs | head -1 && echo OK_LV_PATCH`
);

const deploy = `set -e
cd /opt/ai-relay
sudo mkdir -p /opt/ai-relay/static/brand
base64 -d /tmp/lv-home.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-home.html >/dev/null
base64 -d /tmp/lv-faq.b64 | gunzip | sudo tee /opt/ai-relay/static/brand/faq.html >/dev/null
grep -o 'launchvault.dev' /opt/ai-relay/static/brand/keyo-home.html | head -1
grep -o 'launchvault.dev' /opt/ai-relay/static/brand/faq.html | head -1
sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs
if [ -f /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ]; then
  sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ai-relay-creem-moderation:/app/billing-unit-inject.js
fi
if [ -f /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ]; then
  sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json
fi
sudo docker restart ai-relay-creem-moderation
if [ -d /opt/ai-relay/data/new-api ]; then
  sudo mkdir -p /opt/ai-relay/data/new-api/brand
  sudo cp -f /opt/ai-relay/static/brand/keyo-home.html /opt/ai-relay/static/brand/faq.html /opt/ai-relay/data/new-api/brand/
fi
if sudo docker inspect ai-relay-new-api >/dev/null 2>&1; then
  sudo docker cp /opt/ai-relay/static/brand/keyo-home.html ai-relay-new-api:/app/web/dist/brand/keyo-home.html 2>/dev/null || true
  sudo docker cp /opt/ai-relay/static/brand/faq.html ai-relay-new-api:/app/web/dist/brand/faq.html 2>/dev/null || true
fi
sleep 4
curl -sS -H 'Cache-Control: no-cache' https://www.keyoapi.xyz/ | tr -d '\\n' | grep -o 'keyo-launchvault-badge\\|launchvault.dev' | head -3
curl -sS -H 'Cache-Control: no-cache' https://www.keyoapi.xyz/brand/faq.html | tr -d '\\n' | grep -o 'launchvault.dev' | head -1
echo DONE_LAUNCHVAULT_BADGE
`;

writeLf(path.join(__dirname, "vps-launchvault-deploy.txt"), deploy);

const order = ["vps-launchvault-p0-patch.txt"];
for (let i = 1; i <= homeN; i++) order.push(`vps-launchvault-home-p${i}.txt`);
for (let i = 1; i <= faqN; i++) order.push(`vps-launchvault-faq-p${i}.txt`);
order.push("vps-launchvault-deploy.txt");

// remove old full-server chunks if present
for (const f of fs.readdirSync(__dirname)) {
  if (/^vps-launchvault-srv-p\d+\.txt$/.test(f)) fs.unlinkSync(path.join(__dirname, f));
}

writeLf(
  path.join(__dirname, "vps-launchvault-README.txt"),
  `# LaunchVault badge — paste on VPS in order:\n${order.map((f, i) => `${i + 1}) scripts/${f}`).join("\n")}\n\nExpect OK_LV_PATCH / OK_LV_HOME_* / OK_LV_FAQ_* then DONE_LAUNCHVAULT_BADGE\nHard-open https://www.keyoapi.xyz/ → click Verify badge.\n`
);

console.log(JSON.stringify({ homeN, faqN, order }, null, 2));
