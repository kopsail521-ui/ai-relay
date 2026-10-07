import fs from "fs";
import zlib from "zlib";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function pack(rel) {
  return zlib.gzipSync(fs.readFileSync(path.join(root, rel))).toString("base64");
}

const files = [
  {
    key: "shell",
    rel: "scripts/geoflow-article-shell.php",
    dest: "/opt/ai-relay/scripts/geoflow-article-shell.php",
  },
  {
    key: "rebuild",
    rel: "scripts/geoflow-rebuild-blog.php",
    dest: "/opt/ai-relay/scripts/geoflow-rebuild-blog.php",
  },
  {
    key: "agent",
    rel: "static/brand/blog/geoflow-agent/index.php",
    dest: "/opt/ai-relay/static/brand/blog/geoflow-agent/index.php",
  },
  {
    key: "home",
    rel: "static/seo/index.html",
    dest: "/opt/ai-relay/static/seo/index.html",
  },
];

const parts = [];
for (const f of files) {
  const b64 = pack(f.rel);
  const mid = Math.ceil(b64.length / 2);
  const tag = `OK_${f.key.toUpperCase()}`;
  parts.push(
    `echo '${b64.slice(0, mid)}' | sudo tee /tmp/geoflow-${f.key}.b64 >/dev/null && echo ${tag}_1`
  );
  parts.push(
    `echo '${b64.slice(mid)}' | sudo tee -a /tmp/geoflow-${f.key}.b64 >/dev/null && echo ${tag}_2`
  );
  parts.push(
    `base64 -d /tmp/geoflow-${f.key}.b64 | gunzip | sudo tee ${f.dest} >/dev/null && echo OK_WRITE_${f.key.toUpperCase()}`
  );
}

const verify = `python3 -c "import urllib.request as u; h=u.urlopen('https://www.keyoapi.xyz/brand/blog/article/c896hb32/',timeout=25).read().decode('utf-8','replace'); print('ART_DOCTYPE', h.lstrip().startswith('<!DOCTYPE')); print('ART_TITLE', '<title>' in h[:1200]); print('ART_H1', '<h1>' in h); print('ART_CANON', 'canonical' in h[:2000]); sm=u.urlopen('https://www.keyoapi.xyz/brand/blog/sitemap.txt',timeout=20).read().decode(); print('SITEMAP_LINES', len([x for x in sm.splitlines() if x.strip()])); home=u.urlopen('https://www.keyoapi.xyz/',timeout=20).read().decode('utf-8','replace'); print('HOME_BLOG', '/brand/blog/' in home); print('DONE_GEOFLOW_HEAD')"`;

const short = [
  "cd /opt/ai-relay",
  ...parts,
  "sudo php /opt/ai-relay/scripts/geoflow-rebuild-blog.php --sanitize-all",
  "sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh || echo BRAND_SKIP",
  verify,
].join(" && ");

if (short.includes("<<")) throw new Error("heredoc");
fs.writeFileSync(
  path.join(root, "scripts/vps-geoflow-head-short.txt"),
  short.replace(/\r\n/g, "\n") + "\n"
);
console.log({ short: Buffer.byteLength(short) });
