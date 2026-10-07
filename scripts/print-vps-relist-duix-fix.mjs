/**
 * Small follow-up: DB relist only (no marketplace tar).
 *   node scripts/print-vps-relist-duix-fix.mjs
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

const py = fs.readFileSync(path.join(__dirname, "vps-relist-duix.py"));
const pyB64 = zlib.gzipSync(py, { level: 9 }).toString("base64");

const checkPy = `#!/usr/bin/env python3
import json,os
def load(p):
    if not os.path.isfile(p):
        return None
    return json.load(open(p))
def hit(d):
    if not d: return None
    by={m.get("model_name"):m for m in (d.get("data") or [])}
    return by.get("Duix-Avatar"), bool(by.get("InfiniteTalk")), len(d.get("data") or [])
pub=load("/tmp/pricing.json")
loc=load("/tmp/pricing-local.json")
m,it,n=hit(pub)
print("public_n", n, "listed", bool(m), "infinitetalk", it)
if m:
    print("price", m.get("model_price"), "tags", m.get("tags"), "groups", m.get("enable_groups"))
ml,itl,nl=hit(loc)
print("local_n", nl, "listed", bool(ml), "infinitetalk", itl)
print("DONE_RELIST_DUIX")
`;
const checkB64 = zlib.gzipSync(Buffer.from(checkPy, "utf8"), { level: 9 }).toString("base64");

const short = [
  "cd /opt/ai-relay",
  "sudo mkdir -p /opt/ai-relay/scripts",
  `echo '${pyB64}' | sudo tee /tmp/duix-py.b64 >/dev/null`,
  "base64 -d /tmp/duix-py.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-relist-duix.py >/dev/null",
  `echo '${checkB64}' | sudo tee /tmp/duix-check.b64 >/dev/null`,
  "base64 -d /tmp/duix-check.b64 | gunzip | sudo tee /opt/ai-relay/scripts/vps-check-relist-duix.py >/dev/null",
  "sudo docker run --rm -e KEYO_ROOT=/opt/ai-relay -v /opt/ai-relay:/opt/ai-relay:rw -v /opt/ai-relay/data/new-api:/data -w /opt/ai-relay python:3.12-alpine python scripts/vps-relist-duix.py /data/one-api.db",
  "sudo docker restart ai-relay-new-api",
  "sudo docker restart ai-relay-creem-moderation",
  "sleep 12",
  "curl -sS -o /tmp/pricing-local.json -w 'local=%{http_code} ' http://127.0.0.1:3000/api/pricing",
  "curl -sS -o /tmp/pricing.json -w 'pricing=%{http_code}\\n' https://www.keyoapi.xyz/api/pricing",
  "python3 /opt/ai-relay/scripts/vps-check-relist-duix.py",
].join(" && ");

if (short.includes("<<") || short.includes("\n")) throw new Error("bad short");
writeLf(path.join(root, "scripts/vps-relist-duix-fix-short.txt"), short + "\n");
console.log({ pyB64: pyB64.length, short: short.length });
