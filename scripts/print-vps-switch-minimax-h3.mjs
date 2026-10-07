/**
 * Generate VPS paste pack: switch MiniMax-H3 to inventory-C (×3), scrub, rebuild 3011.
 * Usage: node scripts/print-vps-switch-minimax-h3.mjs
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

const serverB64 = b64gz("services/apimart-passthrough/server.mjs");
const taskResponsesB64 = b64gz("services/apimart-passthrough/task-responses.mjs");
const catalogB64 = b64gz("services/apimart-passthrough/catalog.json");
const cfgB64 = b64gz("config/apimart-selected-models.json");
const pyB64 = b64gz("scripts/vps-add-apimart-videos.py");
const copyB64 = b64gz("config/marketplace-model-copy.json");

// split large payloads for Workbench paste limits
function parts(b64, name, n = 3) {
  const size = Math.ceil(b64.length / n);
  const files = [];
  for (let i = 0; i < n; i++) {
    const chunk = b64.slice(i * size, (i + 1) * size);
    const op = i === 0 ? ">" : ">>";
    const f = path.join(root, `scripts/vps-mmh3-${name}-p${i + 1}.txt`);
    fs.writeFileSync(
      f,
      `echo '${chunk}' | sudo tee ${op} /tmp/vps-mmh3-${name}.b64 >/dev/null && echo OK_${name.toUpperCase()}_${i + 1}_OF_${n}\n`
    );
    files.push(f);
  }
  return files;
}

const outFiles = [
  ...parts(serverB64, "server", 4),
  ...parts(taskResponsesB64, "task-responses", 1),
  ...parts(catalogB64, "catalog", 2),
  ...parts(cfgB64, "cfg", 2),
  ...parts(copyB64, "copy", 4),
];

const pyFile = path.join(root, "scripts/vps-mmh3-py.txt");
fs.writeFileSync(
  pyFile,
  `echo '${pyB64}' | sudo tee /tmp/vps-mmh3-py.b64 >/dev/null && echo OK_PY_B64\n`
);
outFiles.push(pyFile);

const deploy = `set -e
cd /opt/ai-relay
sudo mkdir -p /opt/ai-relay/services/apimart-passthrough /opt/ai-relay/config /opt/ai-relay/scripts /opt/ai-relay/services/creem-moderation-proxy

# --- decode payloads (run p1..pn first) ---
base64 -d /tmp/vps-mmh3-server.b64 | gunzip | sudo tee /opt/ai-relay/services/apimart-passthrough/server.mjs >/dev/null
base64 -d /tmp/vps-mmh3-task-responses.b64 | gunzip | sudo tee /opt/ai-relay/services/apimart-passthrough/task-responses.mjs >/dev/null
base64 -d /tmp/vps-mmh3-catalog.b64 | gunzip | sudo tee /opt/ai-relay/services/apimart-passthrough/catalog.json >/dev/null
base64 -d /tmp/vps-mmh3-cfg.b64 | gunzip | sudo tee /opt/ai-relay/config/apimart-selected-models.json >/dev/null
base64 -d /tmp/vps-mmh3-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-apimart-videos.py >/dev/null
base64 -d /tmp/vps-mmh3-copy.b64 | gunzip | sudo tee /opt/ai-relay/config/marketplace-model-copy.json >/dev/null
base64 -d /tmp/vps-mmh3-copy.b64 | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null
echo OK_DECODE

# --- ensure inventory-C key in video env (from root .env; never print) ---
sudo touch /opt/ai-relay/.env.apimart
if ! sudo grep -q '^GRSAI_API_KEY=.' /opt/ai-relay/.env.apimart 2>/dev/null; then
  sudo grep -E '^GRSAI_(API_KEY|BASE_URL)=' /opt/ai-relay/.env 2>/dev/null | sudo tee -a /opt/ai-relay/.env.apimart >/dev/null || true
fi
if ! sudo grep -q '^GRSAI_BASE_URL=' /opt/ai-relay/.env.apimart 2>/dev/null; then
  echo 'GRSAI_BASE_URL=https://grsaiapi.com' | sudo tee -a /opt/ai-relay/.env.apimart >/dev/null
fi
echo "inventory_c_key=$(sudo grep -c '^GRSAI_API_KEY=.' /opt/ai-relay/.env.apimart || true)"

# --- rebuild 3011 (COPY source; restart alone is not enough) ---
sudo docker build -t keyo-apimart-passthrough ./services/apimart-passthrough
sudo docker rm -f ai-relay-apimart-passthrough 2>/dev/null || true
sudo docker run -d --name ai-relay-apimart-passthrough --restart always --network host \\
  --env-file /opt/ai-relay/.env.apimart \\
  -v /opt/ai-relay/data:/data:rw \\
  -e NEW_API_DB=/data/new-api/one-api.db \\
  -e NEW_API_BASE=http://127.0.0.1:3000 \\
  -e CATALOG=/app/catalog.json \\
  -e LISTEN_HOST=127.0.0.1 \\
  -e PORT=3011 \\
  keyo-apimart-passthrough
sleep 2
curl -sS http://127.0.0.1:3011/healthz; echo

# --- ModelPrice / marketplace rows ---
sudo python3 /opt/ai-relay/scripts/vps-add-apimart-videos.py /opt/ai-relay/data/new-api/one-api.db

# --- marketplace copy into moderation (json only; restart picks up if volume-mounted; else rebuild) ---
if sudo docker ps --format '{{.Names}}' | grep -q '^ai-relay-creem-moderation$'; then
  sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json 2>/dev/null || true
  sudo docker restart ai-relay-creem-moderation >/dev/null || true
fi
sudo docker restart ai-relay-new-api >/dev/null || true
sleep 3

KEY=$(python3 - <<'PY'
import sqlite3
k=sqlite3.connect("/opt/ai-relay/data/new-api/one-api.db").execute(
  "SELECT key FROM tokens WHERE id=2 AND status=1"
).fetchone()[0]
print(k if str(k).startswith("sk-") else "sk-"+k)
PY
)

echo "=== smoke MiniMax-H3 submit ==="
curl -sS -o /tmp/mmh3.json -w "mmh3=%{http_code}\\n" -m 90 \\
  -X POST https://www.keyoapi.xyz/v1/videos/generations \\
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"model":"MiniMax-H3","prompt":"a red balloon floating in blue sky, cinematic","duration":5,"resolution":"768p","aspect_ratio":"16:9"}'
# scrub any vendor names from smoke output display
python3 - <<'PY'
import re
t=open("/tmp/mmh3.json","r",encoding="utf-8",errors="ignore").read()
t=re.sub(r"(?i)grsai|dakka|apimart|openlux|gitee|moark","provider",t)
print(t[:400])
PY

echo "=== pricing row ==="
python3 - <<'PY'
import json,sqlite3
con=sqlite3.connect("/opt/ai-relay/data/new-api/one-api.db")
mp=json.loads(con.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()[0] or "{}")
print("MiniMax-H3 ModelPrice", mp.get("MiniMax-H3"))
con.close()
PY

echo DONE_SWITCH_MINIMAX_H3
`;

const deployFile = path.join(root, "scripts/vps-mmh3-deploy.txt");
fs.writeFileSync(deployFile, deploy);
outFiles.push(deployFile);

const readme = path.join(root, "scripts/vps-mmh3-readme.txt");
fs.writeFileSync(
  readme,
  `# MiniMax-H3 切换（Workbench 粘贴顺序）
1. vps-mmh3-server-p1.txt … p4.txt
2. vps-mmh3-catalog-p1.txt … p2.txt
3. vps-mmh3-cfg-p1.txt … p2.txt
4. vps-mmh3-copy-p1.txt … p4.txt
5. vps-mmh3-py.txt
6. vps-mmh3-deploy.txt

成功标志：DONE_SWITCH_MINIMAX_H3；healthz inventory_c=true；提交返回 task_id。
售价：成本×3（480p $0.02055 / 768p $0.02877 / 1080p $0.04110 /秒）。
`
);
outFiles.push(readme);

console.log("Wrote:");
for (const f of outFiles) {
  console.log(" ", path.basename(f), fs.statSync(f).size);
}
