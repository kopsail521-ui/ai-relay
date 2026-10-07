import fs from "fs";
import zlib from "zlib";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function pack(rel) {
  return zlib.gzipSync(fs.readFileSync(path.join(root, rel))).toString("base64");
}

const files = [
  ["shell", "scripts/geoflow-article-shell.php", "/opt/ai-relay/scripts/geoflow-article-shell.php"],
  ["rebuild", "scripts/geoflow-rebuild-blog.php", "/opt/ai-relay/scripts/geoflow-rebuild-blog.php"],
  ["home", "static/seo/index.html", "/opt/ai-relay/static/seo/index.html"],
];

const parts = [];
for (const [key, rel, dest] of files) {
  const b64 = pack(rel);
  const mid = Math.ceil(b64.length / 2);
  const tag = key.toUpperCase();
  parts.push(
    `echo '${b64.slice(0, mid)}' | sudo tee /tmp/geo-${key}.b64 >/dev/null && echo ${tag}_1`
  );
  parts.push(
    `echo '${b64.slice(mid)}' | sudo tee -a /tmp/geo-${key}.b64 >/dev/null && echo ${tag}_2`
  );
  parts.push(
    `base64 -d /tmp/geo-${key}.b64 | gunzip | sudo tee ${dest} >/dev/null && echo OK_WRITE_${tag}`
  );
}

const short = [
  "cd /opt/ai-relay",
  ...parts,
  "sudo php /opt/ai-relay/scripts/geoflow-rebuild-blog.php --sanitize-all",
  "head -c 80 /opt/ai-relay/static/brand/blog/article/c896hb32/index.html",
  "echo",
  "grep -c /brand/blog/ /opt/ai-relay/static/seo/index.html",
  "wc -l /opt/ai-relay/static/brand/blog/sitemap.txt",
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc");
fs.writeFileSync(
  path.join(root, "scripts/vps-geoflow-wrap-disk-short.txt"),
  short.replace(/\r\n/g, "\n") + "\n"
);
console.log({ short: Buffer.byteLength(short) });
