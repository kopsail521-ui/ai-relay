/**
 * 生成文档同步部署粘贴包（Workbench）。
 * 同步内容：keyo-docs.html（kimi-k3/kimi-k2.7-code 价格行修复、claude-sonnet-5-5 补录、
 *           gemma-4-26B-A4B-it / Fun-ASR-Nano-2512 下架行删除）、
 *           keyo-api-ref.md / .en.md（同步模型清单）、客户接入一页纸.md。
 * 用法：node scripts/print-vps-deploy-docs-sync.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function b64gz(rel) {
  return zlib.gzipSync(fs.readFileSync(path.join(root, rel))).toString("base64");
}

const docsB64 = b64gz("static/brand/keyo-docs.html");
const refZhB64 = b64gz("static/brand/keyo-api-ref.md");
const refEnB64 = b64gz("static/brand/keyo-api-ref.en.md");
const onePagerB64 = b64gz("docs/客户接入一页纸.md");

const cmd = `set -e
sudo mkdir -p /opt/ai-relay/static/brand /opt/ai-relay/docs
echo '${docsB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-docs.html >/dev/null
echo '${refZhB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.md >/dev/null
echo '${refEnB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/static/brand/keyo-api-ref.en.md >/dev/null
echo '${onePagerB64}' | base64 -d | gunzip | sudo tee "/opt/ai-relay/docs/客户接入一页纸.md" >/dev/null
echo '--- verify live docs ---'
curl -sS -o /dev/null -w "docs=%{http_code}\\n" https://www.keyoapi.xyz/brand/keyo-docs.html || true
curl -sS -o /dev/null -w "ref_md=%{http_code}\\n" https://www.keyoapi.xyz/brand/keyo-api-ref.md || true
curl -sS https://www.keyoapi.xyz/brand/keyo-docs.html 2>/dev/null | grep -o 'data-copy="kimi-k3">kimi-k3</button></td><td class="price">[^<]*</td><td class="price">[^<]*' | head -1
curl -sS https://www.keyoapi.xyz/brand/keyo-docs.html 2>/dev/null | grep -c 'gemma-4-26B-A4B-it\|Fun-ASR-Nano-2512' || true
echo DONE_DOCS_SYNC
`;

const out = path.join(root, "scripts/vps-deploy-docs-sync.txt");
fs.writeFileSync(out, cmd);
console.log("Wrote", out, "(" + cmd.length + " chars)");
console.log("Paste scripts/vps-deploy-docs-sync.txt on the VPS Workbench.");
