/** Generate a secret-free deployment command with both services' runtime sources.
 * Existing configured containers and the wallet database are required on the VPS.
 * No .env/key reads, production calls, or generated files until explicitly run.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "scripts/vps-deploy-images.py",
  ...["Dockerfile", "server.mjs", "video-contracts.mjs", "task-responses.mjs", "image-contracts.mjs", "image-ledger.mjs", "image-service.mjs", "catalog.json"].map((name) => `services/apimart-passthrough/${name}`),
  ...["Dockerfile", "server.mjs", "media-input.mjs", "video-routing.mjs", "rankings-synthetic.mjs", "marketplace-model-copy.json", "model-icon-map.json", "billing-unit-inject.js", "model-icon-inject.js"].map((name) => `services/creem-moderation-proxy/${name}`),
];
export function imageDeployCommand(action = "moderation") {
  if (!["moderation", "native", "deploy", "all"].includes(action)) throw new Error("Invalid deploy action");
  const lines = ["set -euo pipefail", "sudo mkdir -p /opt/ai-relay/scripts /opt/ai-relay/services/apimart-passthrough /opt/ai-relay/services/creem-moderation-proxy"];
  for (const file of files) {
    const encoded = zlib.gzipSync(fs.readFileSync(path.join(root, file))).toString("base64");
    lines.push(`printf '%s' '${encoded}' | base64 -d | gunzip | sudo tee '/opt/ai-relay/${file}' >/dev/null`);
  }
  lines.push(`sudo python3 /opt/ai-relay/scripts/vps-deploy-images.py ${action}`);
  return lines.join("\n");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--moderation-only") && process.argv.includes("--native-only")) throw new Error("Choose one service action");
  const action = process.argv.includes("--moderation-only") ? "moderation" : process.argv.includes("--native-only") ? "native" : "deploy";
  const command = "# Existing configured containers and persistent wallet database are required.\n" + imageDeployCommand(action) + "\n" +
    "# READ ONLY diagnostics: sudo python3 /opt/ai-relay/scripts/vps-deploy-images.py diagnostics\n" +
    "# Rollback: sudo python3 /opt/ai-relay/scripts/vps-deploy-images.py rollback\n";
  if (process.argv.includes("--stdout")) process.stdout.write(command);
  else {
    const output = path.join(root, "scripts/vps-image-fixes.txt");
    fs.writeFileSync(output, command);
    console.log(`Wrote ${output}. Review before updating existing containers on VPS.`);
  }
}
