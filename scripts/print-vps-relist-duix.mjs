/**
 * Relist Duix-Avatar at cost×5 with resolution×duration price table.
 * No git pull, no bash heredoc.
 *   node scripts/print-vps-relist-duix.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function writeLf(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

const py = fs.readFileSync(path.join(__dirname, "vps-relist-duix.py"));
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const checkPy = `#!/usr/bin/env python3
import json,re
d=json.load(open("/tmp/pricing.json"))
by={m.get("model_name"):m for m in (d.get("data") or [])}
m=by.get("Duix-Avatar")
print("listed", bool(m))
if m:
    print("price", m.get("model_price"))
    print("tags", m.get("tags"))
    print("vendor", m.get("vendor_name"))
else:
    print("names", [x.get("model_name") for x in (d.get("data") or []) if "Duix" in str(x.get("model_name") or "") or "Talk" in str(x.get("model_name") or "")])
it=by.get("InfiniteTalk")
print("infinitetalk", bool(it))
html=open("/tmp/pricing-page.html",encoding="utf-8",errors="ignore").read()
print("table_720", "0.06849" in html)
print("table_1080", "0.20548" in html)
print("bill_marker", "__keyoBillV15" in html)
blob=json.dumps(d,ensure_ascii=False)
print("public_leak", bool(re.search(r"unorouter|openlux|apimart|grsai|SenseNova|模力|上游|passthrough|进货|二道|转售|gitee", blob, re.I)))
print("DONE_RELIST_DUIX")
`;
const checkB64 = zlib.gzipSync(Buffer.from(checkPy, "utf8"), { level: 9 }).toString("base64");

const packList = [
  "config/marketplace-model-copy.json",
  "services/creem-moderation-proxy/marketplace-model-copy.json",
  "services/creem-moderation-proxy/server.mjs",
  "services/creem-moderation-proxy/billing-unit-inject.js",
  "services/gitee-passthrough/server.mjs",
  "services/gitee-passthrough/catalog.json",
];
for (const rel of packList) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error("missing " + rel);
}
const tarPath = path.join(root, "tmp/_relist-duix.tar.gz");
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
  "sudo mkdir -p /opt/ai-relay/scripts /opt/ai-relay/config /opt/ai-relay/services/creem-moderation-proxy /opt/ai-relay/services/gitee-passthrough",
  `echo '${pyB64}' | sudo tee /tmp/duix-py.b64 >/dev/null`,
  "base64 -d /tmp/duix-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-relist-duix.py >/dev/null",
  `echo '${checkB64}' | sudo tee /tmp/duix-check.b64 >/dev/null`,
  "base64 -d /tmp/duix-check.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-check-relist-duix.py >/dev/null",
  `echo '${tarB64}' | sudo tee /tmp/duix-copy.b64 >/dev/null`,
  "base64 -d /tmp/duix-copy.b64 | sudo tee /tmp/duix-copy.tar.gz >/dev/null",
  "sudo tar -xzf /tmp/duix-copy.tar.gz -C /opt/ai-relay",
  "sudo docker run --rm -e KEYO_ROOT=/opt/ai-relay -v /opt/ai-relay:/opt/ai-relay:rw -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-relist-duix.py /data/one-api.db",
  "sudo docker cp /opt/ai-relay/services/gitee-passthrough/server.mjs ai-relay-gitee-passthrough:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/gitee-passthrough/catalog.json ai-relay-gitee-passthrough:/app/catalog.json",
  "sudo docker restart ai-relay-gitee-passthrough",
  "sudo docker restart ai-relay-new-api",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs",
  "sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/billing-unit-inject.js ai-relay-creem-moderation:/app/billing-unit-inject.js",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 8",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code} ' https://www.keyoapi.xyz/api/pricing",
  "curl -sS -o /tmp/pricing-page.html -w 'page=%{http_code}\\n' https://www.keyoapi.xyz/pricing",
  "python3 /opt/ai-relay/scripts/vps-check-relist-duix.py",
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc leaked");
if (short.includes("\n")) throw new Error("short must be one line");

writeLf(path.join(root, "scripts/vps-relist-duix-short.txt"), short + "\n");
writeLf(
  path.join(root, "scripts/vps-relist-duix-readme.txt"),
  `# 重新上架 Duix-Avatar（成本×5，分辨率×时长分档）

粘贴：scripts/vps-relist-duix-short.txt（一整行）
期望：
  listed True · price 0.06849 · tags 数字人
  table_720 True · table_1080 True · bill_marker True
  public_leak False · DONE_RELIST_DUIX
硬开 /pricing 详情看「分组价格」四档（分辨率 × 时长）。调用必须 multipart 上传 ref_audio + ref_video。
透传容器须保持挂载：-v /opt/ai-relay/data/new-api:/data:rw 且 NEW_API_DB=/data/one-api.db。
`
);
console.log({
  pyB64: pyB64.length,
  tarB64: tarB64.length,
  short: short.length,
});
