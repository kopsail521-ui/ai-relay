/**
 * Restore marketplace icons: Custom / missing vendor → /brand/logo.svg.
 * No git pull, no bash heredoc.
 *   node scripts/print-vps-fix-model-icons.mjs
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
  "services/creem-moderation-proxy/server.mjs",
  "services/creem-moderation-proxy/model-icon-inject.js",
  "services/creem-moderation-proxy/model-icon-map.json",
  "config/model-icon-map.json",
];
for (const rel of packList) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error("missing " + rel);
}

const tarPath = path.join(root, "tmp/_fix-model-icons.tar.gz");
fs.mkdirSync(path.dirname(tarPath), { recursive: true });
execSync(`tar -czf "${tarPath}" ${packList.map((s) => `"${s}"`).join(" ")}`, {
  cwd: root,
  stdio: "pipe",
  shell: true,
});
const tarB64 = fs.readFileSync(tarPath).toString("base64");
if (tarB64.length < 200) throw new Error("tar too small");

const checkPy = `#!/usr/bin/env python3
html=open("/tmp/pricing-page.html",encoding="utf-8",errors="ignore").read()
print("icon_v5", "__keyoModelIconsV5" in html)
print("icon_logo", "/brand/logo.svg" in html)
print("icon_custom_png", "/brand/model-icons/" in html)
print("DONE_FIX_MODEL_ICONS")
`;
const checkPath = path.join(root, "scripts/vps-fix-model-icons-check.py");
writeLf(checkPath, checkPy);

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/config /opt/ai-relay/scripts",
  `echo '${tarB64}' | sudo tee /tmp/fix-icons.b64 >/dev/null`,
  "base64 -d /tmp/fix-icons.b64 | sudo tee /tmp/fix-icons.tar.gz >/dev/null",
  "sudo tar -xzf /tmp/fix-icons.tar.gz -C /opt/ai-relay",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/model-icon-inject.js ai-relay-creem-moderation:/app/model-icon-inject.js",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/model-icon-map.json ai-relay-creem-moderation:/app/model-icon-map.json",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 3",
  "curl -sS -o /tmp/pricing-page.html -w 'pricing=%{http_code} ' https://www.keyoapi.xyz/pricing",
  "curl -sS -o /dev/null -w 'logo=%{http_code} ' https://www.keyoapi.xyz/brand/logo.svg",
  `python3 -c "html=open('/tmp/pricing-page.html',encoding='utf-8',errors='ignore').read();print('icon_v5', '__keyoModelIconsV5' in html);print('icon_logo', '/brand/logo.svg' in html);print('icon_custom_png', '/brand/model-icons/' in html);print('DONE_FIX_MODEL_ICONS')"`,
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc leaked");
if (short.includes("\n")) throw new Error("short must be one line");

writeLf(path.join(root, "scripts/vps-fix-model-icons-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-fix-model-icons-readme.txt"),
  `# 找不到供应商图标 → 站点 logo（不再显示字母 C）

粘贴：scripts/vps-fix-model-icons-short.txt（一整行）
期望：icon_v5 True · icon_logo True · icon_custom_png False · DONE_FIX_MODEL_ICONS
刷新 /pricing 后 VajraV1 / InfiniteTalk / video-enhance-pro 等应是 Keyo 标志，不是 C。
`
);
console.log({ tarB64: tarB64.length, short: short.length });
