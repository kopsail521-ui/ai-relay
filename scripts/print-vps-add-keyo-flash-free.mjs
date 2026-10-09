/**
 * 生成 VPS 一键上架脚本（带真实 key 的完整版）：部署 keyo-flash:free 接力池 + 渠道 + 广场
 * 用法：node scripts/print-vps-add-keyo-flash-free.mjs
 *
 * 大白话：仓库是 public 的，key 不能提交；本脚本从本地 .env 读出
 * POOL_1_API_KEYS_UNO / INTERN / SENSENOVA 和 POOL_API_KEYS，
 * 在终端打印出可直接粘贴到 VPS 执行的完整脚本（key 只经过终端，不进 git）。
 * 无 key 的占位版本见 scripts/vps-add-keyo-flash-free.txt。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const KEYS = {
  UNO: env.POOL_1_API_KEYS_UNO || "",
  INTERN: env.POOL_1_API_KEYS_INTERN || "",
  SENSENOVA: env.POOL_1_API_KEYS_SENSENOVA || "",
  POOL: env.POOL_API_KEYS || "",
};
for (const [k, v] of Object.entries(KEYS)) {
  if (!v.startsWith("sk-")) {
    console.error(`缺少 ${k} 的 key（.env 里 POOL_1_API_KEYS_${k} / POOL_API_KEYS）`);
    process.exit(1);
  }
}

const script = `#!/usr/bin/env bash
# VPS 一键上架 keyo-flash:free（生成于本地，含真实 key —— 勿存回仓库/勿截图外传）
# 跨 UnoRouter + intern-ai(discovery-api) + sensenova 三家 13 模型接力；广场 \$0、扣赠送金
set -e
cd /opt/ai-relay
sudo bash scripts/vps-safe-pull-preserve-blog.sh

# 0) 写入全部池配置（含 key，幂等：只在缺失时追加）
add_env() { sudo grep -q "^\$1" /opt/ai-relay/.env 2>/dev/null || echo "\$2" | sudo tee -a /opt/ai-relay/.env >/dev/null; }
add_env '^POOL_1_ALIAS='        'POOL_1_ALIAS=keyo-flash:free'
add_env '^POOL_1_UPSTREAMS='    'POOL_1_UPSTREAMS=uno,intern,sensenova'
add_env '^POOL_1_BASE_URL_UNO=' 'POOL_1_BASE_URL_UNO=https://api.unorouter.com/v1'
add_env '^POOL_1_API_KEYS_UNO=' 'POOL_1_API_KEYS_UNO=${KEYS.UNO}'
add_env '^POOL_1_MODELS_UNO='   'POOL_1_MODELS_UNO=agnes-3.0-flash:free,gemma-4-26b:free,glm-4.7-flash:free,minimax-m2.7:free,nemotron-3-super-120b-a12b:free,k2-horizon:free,nemotron-3.5-lightning-30b-a3b:free,nemotron-3.5-lightning:free,mistral-7b-instruct:free,diffusiongemma-26b-a4b-it:free'
add_env '^POOL_1_BASE_URL_INTERN='    'POOL_1_BASE_URL_INTERN=https://discovery-api.intern-ai.org.cn/v1'
add_env '^POOL_1_API_KEYS_INTERN='    'POOL_1_API_KEYS_INTERN=${KEYS.INTERN}'
add_env '^POOL_1_MODELS_INTERN='      'POOL_1_MODELS_INTERN=glm-5.3'
add_env '^POOL_1_BASE_URL_SENSENOVA=' 'POOL_1_BASE_URL_SENSENOVA=https://token.sensenova.cn/v1'
add_env '^POOL_1_API_KEYS_SENSENOVA=' 'POOL_1_API_KEYS_SENSENOVA=${KEYS.SENSENOVA}'
add_env '^POOL_1_MODELS_SENSENOVA='   'POOL_1_MODELS_SENSENOVA=sensenova-6.8-flash-lite,glm-5.2'
add_env '^POOL_API_KEYS='             'POOL_API_KEYS=${KEYS.POOL}'

# 1) 构建 + 启动接力池容器
sudo docker build -t keyo-unofree-pool ./services/unofree-pool
sudo docker rm -f ai-relay-unofree-pool 2>/dev/null || true
sudo docker run -d --name ai-relay-unofree-pool --restart always --network host \\
  --env-file /opt/ai-relay/.env -e PORT=3020 -e LISTEN_HOST=0.0.0.0 keyo-unofree-pool
sleep 2
echo "--- 池健康（应 13 entries: uno×10 intern×1 sensenova×2）---"
curl -sS http://127.0.0.1:3020/health | head -c 300 || true; echo

# 2) 注册渠道 + 定价（ModelPrice=0 → 广场 \$0，赠送金扣费）+ 广场条目
sudo python3 /opt/ai-relay/scripts/vps-add-keyo-relay-pool.py /opt/ai-relay/data/new-api/one-api.db

# 3) 广场 7 语言文案热更新
MOD=\$(sudo docker ps --format '{{.Names}}' | grep -E 'creem|moderation' | head -1 || true)
if [ -n "\$MOD" ]; then
  sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json "\$MOD":/app/marketplace-model-copy.json
  sudo docker restart "\$MOD" && echo "moderation_copy_updated=\$MOD"
fi

# 4) 重生 /free-models 静态页 + 部署
sudo node /opt/ai-relay/scripts/gen-seo-pages.mjs
sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh

# 5) 重启 new-api 生效（约 3 秒中断）
sudo docker restart ai-relay-new-api; sleep 4

echo "--- smoke ---"
curl -sS https://www.keyoapi.xyz/api/pricing | grep -q '"model_name":"keyo-flash:free"' \\
  && echo "pricing_ok=keyo-flash:free" || echo "pricing_MISSING=keyo-flash:free"
curl -sS -o /dev/null -w "free_page_http=%{http_code}\\n" https://www.keyoapi.xyz/free-models
curl -sS -o /dev/null -w "pool_direct_http=%{http_code}\\n" -X POST http://127.0.0.1:3020/v1/chat/completions \\
  -H "Content-Type: application/json" -H "Authorization: Bearer ${KEYS.POOL}" \\
  -d '{"model":"keyo-flash:free","stream":false,"messages":[{"role":"user","content":"hi"}]}'
echo DONE_ADD_KEYO_FLASH_FREE
`;

console.log(script);
console.error(`\n✅ 生成完毕（${script.length} 字符）。复制上面整段到 VPS 终端执行即可。`);
console.error(`提醒：本输出含真实 API key —— 不要提交进仓库（public），不要发到公开场合。`);
