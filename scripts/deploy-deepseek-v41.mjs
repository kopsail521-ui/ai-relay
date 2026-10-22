/**
 * Generate VPS deployment script for DeepSeek V4.1 Flash 1017 (Paid + Gift-credit twins)
 * Usage: node scripts/deploy-deepseek-v41.mjs
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

const copyB64 = b64gz("config/marketplace-model-copy.json");
const iconB64 = b64gz("config/model-icon-map.json");
const unoCfgB64 = b64gz("config/unorouter-paid-models.json");
const proxyServerB64 = b64gz("services/creem-moderation-proxy/server.mjs");
const pyB64 = b64gz("scripts/vps-add-deepseek-v41.py");

const deployScript = `set -e
cd /opt/ai-relay
sudo mkdir -p /opt/ai-relay/config /opt/ai-relay/scripts /opt/ai-relay/services/creem-moderation-proxy

echo "==> 1. 解码配置文件与脚本..."
echo '${copyB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/config/marketplace-model-copy.json >/dev/null
echo '${copyB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null
echo '${iconB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/config/model-icon-map.json >/dev/null
echo '${iconB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/model-icon-map.json >/dev/null
echo '${unoCfgB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/config/unorouter-paid-models.json >/dev/null
echo '${proxyServerB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/server.mjs >/dev/null
echo '${pyB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-deepseek-v41.py >/dev/null
echo "OK: 文件解码完成"

echo "==> 2. 执行数据库上架 (one-api.db)..."
sudo python3 /opt/ai-relay/scripts/vps-add-deepseek-v41.py /opt/ai-relay/data/new-api/one-api.db

echo "==> 3. 更新并重启 Creem Moderation Proxy..."
if sudo docker ps --format '{{.Names}}' | grep -q '^ai-relay-creem-moderation$'; then
  sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json 2>/dev/null || true
  sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/model-icon-map.json ai-relay-creem-moderation:/app/model-icon-map.json 2>/dev/null || true
  sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/server.mjs ai-relay-creem-moderation:/app/server.mjs 2>/dev/null || true
  sudo docker restart ai-relay-creem-moderation 2>/dev/null || true
  echo "OK: creem-moderation-proxy 已更新并重启"
fi

echo "==> 4. 重启 New API 容器以刷新配置与缓存..."
if sudo docker ps --format '{{.Names}}' | grep -q '^ai-relay-new-api$'; then
  sudo docker restart ai-relay-new-api 2>/dev/null || true
  sleep 4
  echo "OK: ai-relay-new-api 已重启"
fi

echo "==> 5. 验证模型定价与状态..."
curl -sS http://127.0.0.1:3000/api/pricing > /tmp/pricing_verify.json || true
python3 - << 'PY'
import json
try:
    d = json.load(open("/tmp/pricing_verify.json"))
    items = {m.get("model_name"): m for m in (d.get("data") or [])}
    for name in ["deepseek-v4.1-flash-1017", "deepseek-v4.1-flash-1017:free"]:
        m = items.get(name)
        if m:
            mr = float(m.get("model_ratio") or 0)
            cr = float(m.get("completion_ratio") or 1)
            in_p = round(mr * 2.0, 4)
            out_p = round(mr * 2.0 * cr, 4)
            print(f"✓ 成功上架 {name}: 输入 $" + str(in_p) + "/1M, 输出 $" + str(out_p) + f"/1M, 比例 {mr} / {cr}")
        else:
            print(f"✗ 警告: {name} 未在 /api/pricing 中找到")
except Exception as e:
    print(f"解析验证数据失败: {e}")
PY

echo "DEPLOY COMPLETED SUCCESSFULLY!"
`;

const outPath = path.join(root, "scripts/vps-deploy-deepseek-v41.sh");
fs.writeFileSync(outPath, deployScript.replace(/\r\n/g, "\n"), "utf8");
console.log(`Generated ${outPath} successfully (${fs.statSync(outPath).size} bytes)`);
