/**
 * Short VPS: delist leftover free twins + glm-5.3 (b64, no pull required).
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const py = fs.readFileSync(path.join(__dirname, "vps-delist-free-twins.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const short = [
  "cd /opt/ai-relay",
  `echo '${b64}' | sudo tee /tmp/delist-free.b64 >/dev/null`,
  "base64 -d /tmp/delist-free.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-delist-free-twins.py >/dev/null",
  "sudo docker run --rm -v /opt/ai-relay/data/new-api:/data -v /opt/ai-relay/scripts/vps-delist-free-twins.py:/fix.py:ro python:3.12-alpine python /fix.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api && sleep 4",
  "curl -sS -o /tmp/pricing.json https://www.keyoapi.xyz/api/pricing",
  `python3 - <<'PY'
import json
gone={"glm-5.3","glm-5.2-free","kimi-k3-free","deepseek-v4-flash-free","deepseek-v4-pro-free"}
names={m.get("model_name") for m in json.load(open("/tmp/pricing.json")).get("data") or []}
print("still_listed", sorted(gone & names) or "NONE")
print("DONE_DELIST_FREE_TWINS")
PY`,
].join(" && ");

const out = path.join(root, "scripts/vps-delist-free-twins-short.txt");
fs.writeFileSync(out, short.replace(/\r\n/g, "\n") + "\n", "utf8");
console.log("wrote", out, fs.statSync(out).size);
