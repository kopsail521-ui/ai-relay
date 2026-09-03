/**
 * 仅更新 creem-moderation-proxy（含 /api/pricing 重排），分步粘贴防断连
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

const serverGz = zlib
  .gzipSync(fs.readFileSync(path.join(root, "services/creem-moderation-proxy/server.mjs")), {
    level: 9,
  })
  .toString("base64");

const chunk = 2200;
const parts = [];
for (let i = 0; i < serverGz.length; i += chunk) parts.push(serverGz.slice(i, i + chunk));

parts.forEach((p, i) => {
  const n = i + 1;
  const tee = i === 0 ? "sudo tee" : "sudo tee -a";
  writeLf(
    path.join(root, `scripts/vps-pricing-sort-p${n}.txt`),
    `echo '${p}' | ${tee} /tmp/mod-server.b64 >/dev/null && echo OK_MOD_${n}_OF_${parts.length}\n`
  );
});

writeLf(
  path.join(root, "scripts/vps-pricing-sort-deploy.txt"),
  `set -e
sudo mkdir -p /opt/ai-relay/services/creem-moderation-proxy
base64 -d /tmp/mod-server.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null
cd /opt/ai-relay
sudo docker build -t keyo-creem-moderation ./services/creem-moderation-proxy
sudo docker rm -f ai-relay-creem-moderation 2>/dev/null || true
sudo docker run -d --name ai-relay-creem-moderation --restart always --network host \\
  --env-file /opt/ai-relay/.env.moderation \\
  -e UPSTREAM_URL=http://127.0.0.1:3000 \\
  -e LISTEN_HOST=127.0.0.1 \\
  -e PORT=3001 \\
  keyo-creem-moderation
sleep 2
curl -sS http://127.0.0.1:3001/api/pricing | head -c 400
echo
echo DONE_PRICING_SORT
`
);

writeLf(
  path.join(root, "scripts/vps-pricing-sort-readme.txt"),
  `# 修复模型广场排序（Array.sort 劫持版）

## 现状
- /api/pricing 已正确（OpenAI 在前）
- 页面仍按名称字母序（AnimeSharp 第一）
- 旧版只做 DOM 挪卡片，会被 React 盖回去

## 本版
劫持 Array.prototype.sort：名称/推荐排序时保留或恢复接口顺序；价格排序不变。

## 步骤（Workbench 依次粘贴）
${parts.map((_, i) => `${i + 1}. vps-pricing-sort-p${i + 1}.txt → OK_MOD_${i + 1}_OF_${parts.length}`).join("\n")}
${parts.length + 1}. vps-pricing-sort-deploy.txt → DONE_PRICING_SORT

然后无痕窗口 Ctrl+F5。第一张应是 gpt-5.6-terra，不是 AnimeSharp。

自检：
curl -sS http://127.0.0.1:3001/ | grep -o 'Array.prototype.sort=sortHook' | head -1
# 应输出 Array.prototype.sort=sortHook（若仍是 climbCard 则旧容器未换掉）
`
);

console.log({ parts: parts.length, b64: serverGz.length });
