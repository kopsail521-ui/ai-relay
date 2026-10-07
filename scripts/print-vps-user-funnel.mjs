import fs from "fs";
import zlib from "zlib";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const py = fs.readFileSync(path.join(root, "scripts/vps-user-funnel-sql.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");
const short = [
  "cd /opt/ai-relay",
  `echo '${b64}' | sudo tee /tmp/user-funnel.py.gz.b64 >/dev/null`,
  "base64 -d /tmp/user-funnel.py.gz.b64 | gunzip | sudo tee /tmp/vps-user-funnel-sql.py >/dev/null",
  "sudo python3 /tmp/vps-user-funnel-sql.py",
  "sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  "python3 -c \"import urllib.request;t=urllib.request.urlopen('https://www.keyoapi.xyz/',timeout=20).read().decode('utf-8','replace');print('LIVE_HOME_MODELS','href=\\\"/models\\\">Browse Models' in t);print('LIVE_HOME_PRICING_CTA','href=\\\"/pricing\\\">Browse Models' in t)\"",
].join(" && ");
if (short.includes("<<")) throw new Error("heredoc");
fs.writeFileSync(path.join(root, "scripts/vps-user-funnel-short.txt"), short.replace(/\r\n/g, "\n") + "\n");
console.log({ b64: b64.length, short: Buffer.byteLength(short) });
