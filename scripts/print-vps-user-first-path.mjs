import fs from "fs";
import zlib from "zlib";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const py = fs.readFileSync(path.join(root, "scripts/vps-user-first-path.py"));
const b64 = zlib.gzipSync(py, { level: 9 }).toString("base64");
const short = [
  "cd /opt/ai-relay",
  `echo '${b64}' | sudo tee /tmp/first-path.py.gz.b64 >/dev/null`,
  "base64 -d /tmp/first-path.py.gz.b64 | gunzip | sudo tee /tmp/vps-user-first-path.py >/dev/null",
  "sudo python3 /tmp/vps-user-first-path.py",
].join(" && ");
if (short.includes("<<")) throw new Error("heredoc");
fs.writeFileSync(
  path.join(root, "scripts/vps-user-first-path-short.txt"),
  short.replace(/\r\n/g, "\n") + "\n"
);
console.log({ b64: b64.length, short: Buffer.byteLength(short) });
