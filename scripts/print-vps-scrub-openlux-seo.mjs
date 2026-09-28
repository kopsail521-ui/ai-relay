/**
 * Scrub public OpenLux string from creem inject + redeploy SEO sell rates.
 *   node scripts/print-vps-scrub-openlux-seo.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pack = (rel) =>
  zlib.gzipSync(fs.readFileSync(path.join(root, rel)), { level: 9 }).toString("base64");

const injectSrc = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/billing-unit-inject.js"),
  "utf8"
);
if (/OpenLux|openlux|buildOpenLux/i.test(injectSrc)) {
  throw new Error("inject still contains OpenLux");
}
if (!injectSrc.includes("buildGroupPriceTable")) {
  throw new Error("missing buildGroupPriceTable");
}

const injectB64 = pack("services/creem-moderation-proxy/billing-unit-inject.js");
const serverB64 = pack("services/creem-moderation-proxy/server.mjs");

// Pack changed SEO pages as a small tar.gz via node (no shell tar needed on Windows emit)
import { execSync } from "child_process";
const seoList = [
  "static/seo/about.html",
  "static/seo/compare.html",
  "static/seo/deepseek-api-pricing.html",
  "static/seo/index.html",
  "static/seo/models.html",
  "static/seo/openai-api-pricing.html",
  "static/seo/pricing.html",
  "static/seo/model/deepseek-v4.1-flash.html",
  "static/seo/model/deepseek-v4-flash.html",
  "static/seo/model/deepseek-v4-flash-0731.html",
  "static/seo/model/deepseek-v4-pro.html",
];
for (const rel of seoList) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error("missing " + rel);
}
const tarPath = path.join(root, "tmp/_seo-ds-sync.tar.gz");
fs.mkdirSync(path.dirname(tarPath), { recursive: true });
// Use powershell Compress? Prefer node tar via zlib+manual — use git archive style with tar if available
try {
  execSync(`tar -czf "${tarPath}" ${seoList.map((s) => `"${s}"`).join(" ")}`, {
    cwd: root,
    stdio: "pipe",
    shell: true,
  });
} catch {
  // Windows may lack tar flags; fall back to individual b64 files in short
}
const useTar = fs.existsSync(tarPath) && fs.statSync(tarPath).size > 100;
const seoTarB64 = useTar ? fs.readFileSync(tarPath).toString("base64") : "";

const shortParts = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/static/seo/model",
  `echo '${injectB64}' | sudo tee /tmp/creem-bill.b64 >/dev/null`,
  "base64 -d /tmp/creem-bill.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js >/dev/null",
  `echo '${serverB64}' | sudo tee /tmp/creem-srv.b64 >/dev/null`,
  "base64 -d /tmp/creem-srv.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null",
];

if (useTar) {
  shortParts.push(
    `echo '${seoTarB64}' | sudo tee /tmp/seo-ds.b64 >/dev/null`,
    "base64 -d /tmp/seo-ds.b64 | sudo tar -xzf - -C /opt/ai-relay",
  );
} else {
  for (const rel of seoList) {
    const b64 = pack(rel);
    const tmp = "/tmp/" + path.basename(rel) + ".b64";
    shortParts.push(
      `echo '${b64}' | sudo tee ${tmp} >/dev/null`,
      `base64 -d ${tmp} | gunzip | sudo tee /opt/ai-relay/${rel} >/dev/null`
    );
  }
}

shortParts.push(
  "grep -qiE 'OpenLux|openlux|buildOpenLux' /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js && echo INJECT_LEAK || echo INJECT_CLEAN",
  "grep -o '~\\$0.07 / \\$0.28' /opt/ai-relay/static/seo/model/deepseek-v4.1-flash.html | head -1",
  "grep -o '~\\$0.44 / \\$1.32' /opt/ai-relay/static/seo/model/deepseek-v4-flash.html | head -1",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ai-relay-creem-moderation:/app/billing-unit-inject.js",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 4",
  "sudo bash scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "curl -sS -H 'Cache-Control: no-cache' -o /tmp/pricing.html https://www.keyoapi.xyz/pricing",
  "curl -sS -H 'Cache-Control: no-cache' -o /tmp/ds41.html https://www.keyoapi.xyz/model/deepseek-v4.1-flash",
  "curl -sS -H 'Cache-Control: no-cache' -o /tmp/dsflash.html https://www.keyoapi.xyz/model/deepseek-v4-flash",
  "curl -sS -H 'Cache-Control: no-cache' -o /tmp/dspage.html https://www.keyoapi.xyz/deepseek-api-pricing",
  `python3 - <<'PY'
import re
p=open('/tmp/pricing.html',encoding='utf-8',errors='ignore').read()
d41=open('/tmp/ds41.html',encoding='utf-8',errors='ignore').read()
df=open('/tmp/dsflash.html',encoding='utf-8',errors='ignore').read()
dp=open('/tmp/dspage.html',encoding='utf-8',errors='ignore').read()
print('inject_openlux', bool(re.search(r'OpenLux|openlux|buildOpenLux', p)))
print('ds41_new', '~$0.07 / $0.28' in d41)
print('ds41_old', '~$0.01 / $0.04' in d41)
print('dsflash_new', '~$0.44 / $1.32' in df)
print('dsflash_old', '~$0.09 / $0.17' in df)
print('hub_new', '~$0.07 / $0.28' in dp and '~$0.44 / $1.32' in dp)
print('public_leak', bool(re.search(r'unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough|gitee', p+d41+df+dp, re.I)))
print('DONE_SCRUB_OPENLUX_SEO')
PY`
);

const short = shortParts.join(" && ");
const out = path.join(root, "scripts/vps-scrub-openlux-seo-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
fs.writeFileSync(
  path.join(root, "scripts/vps-scrub-openlux-seo-readme.txt"),
  `# 抹掉公开页 OpenLux 字样 + SEO DeepSeek 售价对齐 live

- creem inject: OpenLux → group price table
- SEO: deepseek-v4.1-flash ~$0.07/$0.28；deepseek-v4-flash ~$0.44/$1.32；0731 ~$0.04/$0.09

粘贴：scripts/vps-scrub-openlux-seo-short.txt
→ INJECT_CLEAN / ds41_new True / public_leak False
→ DONE_SCRUB_OPENLUX_SEO
`
);
console.log({
  out,
  bytes: Buffer.byteLength(short),
  useTar,
  tarBytes: useTar ? fs.statSync(tarPath).size : 0,
});
