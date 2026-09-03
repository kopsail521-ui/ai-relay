/** Emit Workbench command with base64 payloads (no external upload). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const b64 = (p) => fs.readFileSync(p).toString("base64");

const robots = b64(path.join(root, "new-api/web/public/robots.txt"));
const sitemap = b64(path.join(root, "new-api/web/public/sitemap.xml"));
const blog = b64(path.join(root, "static/brand/blog/index.html"));

const cmd = `set -e
sudo mkdir -p /opt/ai-relay/static/seo /opt/ai-relay/static/brand/blog
echo '${robots}' | base64 -d | sudo tee /opt/ai-relay/static/seo/robots.txt >/dev/null
echo '${sitemap}' | base64 -d | sudo tee /opt/ai-relay/static/seo/sitemap.xml >/dev/null
echo '${blog}' | base64 -d | sudo tee /opt/ai-relay/static/brand/blog/index.html >/dev/null
curl -fsS https://www.keyoapi.xyz/sitemap.xml | head -n 15
curl -fsSI https://www.keyoapi.xyz/brand/blog/ | head -n 5
echo DONE_GEO_FIX
`;

const out = path.join(root, "scripts/vps-geo-fix-sitemap-blog.txt");
fs.writeFileSync(out, cmd);
console.log("wrote", out, "bytes", cmd.length);
