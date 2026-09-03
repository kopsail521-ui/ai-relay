/** Upload fixed GEO static assets and print Workbench one-liner. */
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
    const body = Buffer.concat([
      Buffer.from(chunks.join("")),
      buf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
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

async function upload(name, buf) {
  const attempts = [
    ["litterbox.catbox.moe", "/resources/internals/api.php", { reqtype: "fileupload", time: "72h" }],
    ["catbox.moe", "/user/api.php", { reqtype: "fileupload" }],
  ];
  for (const [host, p, fields] of attempts) {
    try {
      const url = await post(host, p, fields, "fileToUpload", name, buf);
      if (/^https?:\/\//.test(url)) {
        console.log(name, url, `(via ${host})`);
        return url;
      }
      console.warn(name, host, url);
    } catch (e) {
      console.warn(name, host, e.message);
    }
  }
  throw new Error(`upload failed: ${name}`);
}

const robots = await upload(
  "keyo-robots.txt",
  fs.readFileSync(path.join(root, "new-api/web/public/robots.txt"))
);
const sitemap = await upload(
  "keyo-sitemap.xml",
  fs.readFileSync(path.join(root, "new-api/web/public/sitemap.xml"))
);
const blogIndex = await upload(
  "keyo-blog-index.html",
  fs.readFileSync(path.join(root, "static/brand/blog/index.html"))
);

const cmd = `set -e
sudo mkdir -p /opt/ai-relay/static/seo /opt/ai-relay/static/brand/blog
sudo curl -fsSL '${robots}' -o /opt/ai-relay/static/seo/robots.txt
sudo curl -fsSL '${sitemap}' -o /opt/ai-relay/static/seo/sitemap.xml
sudo curl -fsSL '${blogIndex}' -o /opt/ai-relay/static/brand/blog/index.html
curl -fsSI https://www.keyoapi.xyz/robots.txt | head -n 3
curl -fsS https://www.keyoapi.xyz/sitemap.xml | head -n 12
curl -fsSI https://www.keyoapi.xyz/brand/blog/ | head -n 5
echo DONE_GEO_FIX
`;

fs.writeFileSync(path.join(root, "scripts/vps-geo-fix-sitemap-blog.txt"), cmd.trim() + "\n");
console.log("\nWrote scripts/vps-geo-fix-sitemap-blog.txt");
