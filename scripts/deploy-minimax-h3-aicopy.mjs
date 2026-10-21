/**
 * Generate VPS deployment commands for MiniMax-H3 aicopy integration
 * Usage: node scripts/deploy-minimax-h3-aicopy.mjs
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
const contractsB64 = b64gz("services/apimart-passthrough/video-contracts.mjs");
const catalogB64 = b64gz("services/apimart-passthrough/catalog.json");
const cfgB64 = b64gz("config/apimart-selected-models.json");
const copyB64 = b64gz("config/marketplace-model-copy.json");
const iconB64 = b64gz("config/model-icon-map.json");
const pyB64 = b64gz("scripts/vps-add-apimart-videos.py");

const deployScript = `set -e
cd /opt/ai-relay
sudo mkdir -p /opt/ai-relay/services/apimart-passthrough /opt/ai-relay/config /opt/ai-relay/scripts /opt/ai-relay/services/creem-moderation-proxy

# --- 1. Decode payloads ---
echo '${serverB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/apimart-passthrough/server.mjs >/dev/null
echo '${contractsB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/apimart-passthrough/video-contracts.mjs >/dev/null
echo '${catalogB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/apimart-passthrough/catalog.json >/dev/null
echo '${cfgB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/config/apimart-selected-models.json >/dev/null
echo '${copyB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/config/marketplace-model-copy.json >/dev/null
echo '${copyB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json >/dev/null
echo '${iconB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/config/model-icon-map.json >/dev/null
echo '${iconB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/services/creem-moderation-proxy/model-icon-map.json >/dev/null
echo '${pyB64}' | base64 -d | gunzip | sudo tee /opt/ai-relay/scripts/vps-add-apimart-videos.py >/dev/null
echo "OK: files decoded"

# --- 2. Ensure AICOPY credentials in .env.apimart ---
sudo touch /opt/ai-relay/.env.apimart
if ! sudo grep -q '^AICOPY_API_KEY=' /opt/ai-relay/.env.apimart 2>/dev/null; then
  echo 'AICOPY_API_KEY=sk-yKD9AN8fNzdqTyfluYubzGpOvURSgGQkDuSsZItvBHmCGYyj' | sudo tee -a /opt/ai-relay/.env.apimart >/dev/null
else
  sudo sed -i 's/^AICOPY_API_KEY=.*/AICOPY_API_KEY=sk-yKD9AN8fNzdqTyfluYubzGpOvURSgGQkDuSsZItvBHmCGYyj/' /opt/ai-relay/.env.apimart
fi
if ! sudo grep -q '^AICOPY_BASE_URL=' /opt/ai-relay/.env.apimart 2>/dev/null; then
  echo 'AICOPY_BASE_URL=https://api.aicopy.top' | sudo tee -a /opt/ai-relay/.env.apimart >/dev/null
fi
echo "OK: .env.apimart configured"

# --- 3. Rebuild and restart ai-relay-apimart-passthrough (:3011) ---
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

# --- 4. Sync marketplace & database ---
sudo python3 /opt/ai-relay/scripts/vps-add-apimart-videos.py /opt/ai-relay/data/new-api/one-api.db

# --- 5. Update moderation proxy ---
if sudo docker ps --format '{{.Names}}' | grep -q '^ai-relay-creem-moderation$'; then
  sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/marketplace-model-copy.json ai-relay-creem-moderation:/app/marketplace-model-copy.json 2>/dev/null || true
  sudo docker cp /opt/ai-relay/services/creem-moderation-proxy/model-icon-map.json ai-relay-creem-moderation:/app/model-icon-map.json 2>/dev/null || true
  sudo docker restart ai-relay-creem-moderation 2>/dev/null || true
  echo "OK: creem moderation updated"
fi

echo "DEPLOY COMPLETED SUCCESSFULLY!"
`;

fs.writeFileSync(path.join(root, "scripts/vps-deploy-minimax-h3.sh"), deployScript, "utf8");
console.log("Written scripts/vps-deploy-minimax-h3.sh successfully!");
