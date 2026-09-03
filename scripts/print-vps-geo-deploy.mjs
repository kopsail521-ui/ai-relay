/** Generate short Workbench commands for GEO brand deploy (no Caddy wipe). */
import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function post(hostname, postPath, fields, fileField, filename, buf) {
  return new Promise((resolve, reject) => {
    const boundary = "----B" + Date.now();
    const chunks = [];
    for (const [k, v] of Object.entries(fields)) {
      chunks.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
      );
    }
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    );
    const head = Buffer.from(chunks.join(""));
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, buf, tail]);
    const req = https.request(
      {
        hostname,
        path: postPath,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d.trim()));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function upload(filename, buf) {
  const url = await post(
    "litterbox.catbox.moe",
    "/resources/internals/api.php",
    { reqtype: "fileupload", time: "72h" },
    "fileToUpload",
    filename,
    buf
  );
  if (!/^https?:\/\//.test(url)) throw new Error(`${filename}: ${url}`);
  return url;
}

const homeUrl = await upload(
  "keyo-home.html",
  fs.readFileSync(path.join(root, "static/brand/keyo-home.html"))
);
const robotsUrl = await upload(
  "robots.txt",
  fs.readFileSync(path.join(root, "new-api/web/public/robots.txt"))
);
const sitemapUrl = await upload(
  "sitemap.xml",
  fs.readFileSync(path.join(root, "new-api/web/public/sitemap.xml"))
);

console.log("home", homeUrl);
console.log("robots", robotsUrl);
console.log("sitemap", sitemapUrl);

// Step 1: brand homepage only — safe, no Caddy change
const step1 = `set -e
sudo mkdir -p /opt/ai-relay/static/brand
sudo curl -fsSL '${homeUrl}' -o /opt/ai-relay/static/brand/keyo-home.html
grep -q 'One API for Multiple AI Models' /opt/ai-relay/static/brand/keyo-home.html
grep -q 'OpenAI-Compatible API Gateway' /opt/ai-relay/static/brand/keyo-home.html
echo DONE_GEO_HOME
head -n 8 /opt/ai-relay/static/brand/keyo-home.html
`;

// Step 2: robots + sitemap — patch Caddy without wiping reverse_proxy
const step2 = `set -e
sudo mkdir -p /opt/ai-relay/static/seo
sudo curl -fsSL '${robotsUrl}' -o /opt/ai-relay/static/seo/robots.txt
sudo curl -fsSL '${sitemapUrl}' -o /opt/ai-relay/static/seo/sitemap.xml
sudo cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.geo-$(date +%Y%m%d%H%M%S)
python3 - <<'PY'
from pathlib import Path
p = Path("/etc/caddy/Caddyfile")
t = p.read_text()
if "static/seo" in t and "robots.txt" in t:
    print("Caddy already has seo handles")
else:
    block = '''
	handle /robots.txt {
		root * /opt/ai-relay/static/seo
		file_server
	}
	handle /sitemap.xml {
		root * /opt/ai-relay/static/seo
		file_server
	}
'''
    needle = "\\thandle_path /brand/*"
    if needle in t:
        t = t.replace(needle, block + needle, 1)
    else:
        needle2 = "handle_path /brand/*"
        if needle2 not in t:
            raise SystemExit("cannot find brand handle in Caddyfile; abort")
        t = t.replace(needle2, block.strip() + "\\n\\t" + needle2, 1)
    p.write_text(t)
    print("patched Caddyfile")
PY
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -fsSI https://www.keyoapi.xyz/robots.txt | head -n 5
curl -fsSI https://www.keyoapi.xyz/sitemap.xml | head -n 5
echo DONE_GEO_SEO
`;

fs.writeFileSync(path.join(root, "scripts/vps-geo-step1-home.txt"), step1.trim() + "\n");
fs.writeFileSync(path.join(root, "scripts/vps-geo-step2-seo.txt"), step2.trim() + "\n");
console.log("\nWrote scripts/vps-geo-step1-home.txt");
console.log("Wrote scripts/vps-geo-step2-seo.txt");
