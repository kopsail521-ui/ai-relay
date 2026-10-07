/**
 * Deploy gpt-6.1-sol public SEO pages (no git pull, no bash heredoc).
 *   node scripts/print-vps-gpt61-seo.mjs
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

const packList = [
  "static/seo/model/gpt-6.1-sol.html",
  "static/seo/model/gpt-6-sol.html",
  "static/seo/model/gpt-6-luna.html",
  "static/seo/model/gpt-6-astra.html",
  "static/seo/compare.html",
  "static/seo/models.html",
  "static/seo/pricing.html",
  "static/seo/index.html",
  "static/seo/sitemap.xml",
  "static/seo/sitemap-live.xml",
  "scripts/vps-gpt61-seo-apply.py",
  "scripts/vps-gpt61-seo-check.py",
];
for (const rel of packList) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error("missing " + rel);
}

const tarPath = path.join(root, "tmp/_gpt61-seo.tar.gz");
fs.mkdirSync(path.dirname(tarPath), { recursive: true });
execSync(`tar -czf "${tarPath}" ${packList.map((s) => `"${s}"`).join(" ")}`, {
  cwd: root,
  stdio: "pipe",
  shell: true,
});
const tarB64 = fs.readFileSync(tarPath).toString("base64");
if (tarB64.length < 200) throw new Error("tar too small");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/static/seo/model /opt/ai-relay/scripts /opt/ai-relay/config /opt/ai-relay/services/creem-moderation-proxy",
  `echo '${tarB64}' | sudo tee /tmp/gpt61-seo.b64 >/dev/null`,
  "base64 -d /tmp/gpt61-seo.b64 | sudo tee /tmp/gpt61-seo.tar.gz >/dev/null",
  "sudo tar -xzf /tmp/gpt61-seo.tar.gz -C /opt/ai-relay",
  "sudo python3 /opt/ai-relay/scripts/vps-gpt61-seo-apply.py",
  "sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ai-relay-creem-moderation:/app/billing-unit-inject.js",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 4",
  "curl -sS -o /tmp/m61.html -w 'model=%{http_code} ' -H 'Cache-Control: no-cache' https://www.keyoapi.xyz/model/gpt-6.1-sol",
  "curl -sS -o /tmp/cmp.html -w 'compare=%{http_code} ' https://www.keyoapi.xyz/compare",
  "curl -sS -o /tmp/luna.html https://www.keyoapi.xyz/model/gpt-6-luna",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code} ' https://www.keyoapi.xyz/api/pricing",
  "python3 /opt/ai-relay/scripts/vps-gpt61-seo-check.py",
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc leaked into short");
if (short.includes("\n")) throw new Error("short must be one line");

writeLf(path.join(root, "scripts/vps-gpt61-seo-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-gpt61-seo-readme.txt"),
  `# 上线 gpt-6.1-sol 公开指南页（无需 git pull）

粘贴：scripts/vps-gpt61-seo-short.txt（一整行）
期望：model=200 · guide_has True · compare_has True · cogs False · sell 0.3677 / 1.8385 · DONE_GPT61_SEO
`
);
console.log({ tarB64: tarB64.length, short: Buffer.byteLength(short), tar: fs.statSync(tarPath).size });
