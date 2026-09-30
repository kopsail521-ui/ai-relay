/**
 * Emit VPS paste commands for GEOFlow gate deploy (no GitHub required).
 * Run: node scripts/print-vps-geoflow-gate.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "scripts");

function pack(rel) {
  const abs = path.join(root, rel);
  const raw = fs.readFileSync(abs);
  return zlib.gzipSync(raw).toString("base64");
}

const files = [
  {
    key: "agent",
    rel: "static/brand/blog/geoflow-agent/index.php",
    dest: "/opt/ai-relay/static/brand/blog/geoflow-agent/index.php",
  },
  {
    key: "rebuild",
    rel: "scripts/geoflow-rebuild-blog.php",
    dest: "/opt/ai-relay/scripts/geoflow-rebuild-blog.php",
  },
  {
    key: "publish",
    rel: "scripts/geoflow-publish-article.php",
    dest: "/opt/ai-relay/scripts/geoflow-publish-article.php",
  },
  {
    key: "claude",
    rel: "static/seo/claude-api-pricing.html",
    dest: "/opt/ai-relay/static/seo/claude-api-pricing.html",
  },
];

const packs = Object.fromEntries(files.map((f) => [f.key, pack(f.rel)]));

function splitEcho(b64, tmpName, okTag) {
  const mid = Math.ceil(b64.length / 2);
  const p1 = b64.slice(0, mid);
  const p2 = b64.slice(mid);
  return [
    `echo '${p1}' | sudo tee /tmp/${tmpName}.b64 >/dev/null && echo ${okTag}_1`,
    `echo '${p2}' | sudo tee -a /tmp/${tmpName}.b64 >/dev/null && echo ${okTag}_2`,
  ];
}

const lines = [];
lines.push("# GEOFlow gate deploy — paste in order on VPS");
lines.push("# Expect: OK_* then DONE_GEOFLOW_GATE");
lines.push("");

for (const f of files) {
  const [a, b] = splitEcho(packs[f.key], `geoflow-${f.key}`, `OK_${f.key.toUpperCase()}`);
  lines.push(a);
  lines.push(b);
  lines.push(
    `base64 -d /tmp/geoflow-${f.key}.b64 | gunzip | sudo tee ${f.dest} >/dev/null && echo OK_WRITE_${f.key.toUpperCase()}`
  );
  lines.push("");
}

lines.push(`sudo python3 - <<'PY'
import json, os
p="/opt/ai-relay/data/geoflow-agent/config.json"
g="/opt/ai-relay/data/geoflow-agent/gate.json"
os.makedirs("/opt/ai-relay/data/geoflow-agent", exist_ok=True)
if os.path.isfile(p):
    cfg=json.load(open(p))
    cfg["auto_publish"]=False
    cfg["sitemap_include_articles"]=False
    cfg["max_publish_per_week"]=5
    cfg["require_previous_batch_ok"]=True
    json.dump(cfg, open(p,"w"), indent=2, ensure_ascii=False)
    open(p,"a").write("\\n")
    print("OK_CONFIG_PATCH")
else:
    print("WARN_NO_CONFIG")
gate={
  "auto_publish": False,
  "sitemap_include_articles": False,
  "max_publish_per_week": 5,
  "require_previous_batch_ok": True,
  "previous_batch_ok": False,
  "notes": "GSC ack before next publish; articles stay draft until publish CLI"
}
if os.path.isfile(g):
    old=json.load(open(g))
    if isinstance(old, dict):
        gate={**gate, **old}
        gate["auto_publish"]=False
        gate["sitemap_include_articles"]=False
json.dump(gate, open(g,"w"), indent=2)
open(g,"a").write("\\n")
print("OK_GATE_SEED")
PY`);
lines.push("");
lines.push(
  "cd /opt/ai-relay && sudo php scripts/geoflow-rebuild-blog.php --delete-smoke --sanitize-all"
);
lines.push("");
lines.push(`# Optional — only if TDK reviewed + volume evidence for Claude 529 (already live, re-flag OK):`);
lines.push(
  `# sudo php scripts/geoflow-publish-article.php --slug=ncx234u2 --tdk-ok --keyword-volume=170 --ack-previous-batch`
);
lines.push("");
lines.push(
  "sudo bash /opt/ai-relay/scripts/deploy-brand-static.sh 2>/dev/null || sudo systemctl reload caddy 2>/dev/null || true"
);
lines.push(
  `curl -sS -o /dev/null -w 'claude_http=%{http_code}\\n' https://www.keyoapi.xyz/claude-api-pricing`
);
lines.push(
  `curl -sS https://www.keyoapi.xyz/claude-api-pricing | grep -o 'brand/blog/article/ncx234u2' | head -1`
);
lines.push(
  `curl -sS https://www.keyoapi.xyz/brand/blog/sitemap.txt | head -10`
);
lines.push("echo DONE_GEOFLOW_GATE");

const readme = lines.join("\n") + "\n";
fs.writeFileSync(path.join(outDir, "vps-geoflow-gate-deploy.txt"), readme);

// Also split into small paste parts for Windows clipboard limits
const parts = [];
let buf = [];
let n = 1;
for (const line of lines) {
  buf.push(line);
  const joined = buf.join("\n");
  if (joined.length > 12000) {
    parts.push(buf.slice(0, -1).join("\n"));
    buf = [line];
    n++;
  }
}
if (buf.length) parts.push(buf.join("\n"));
parts.forEach((p, i) => {
  fs.writeFileSync(
    path.join(outDir, `vps-geoflow-gate-p${i + 1}.txt`),
    p + (i === parts.length - 1 ? "" : "\n")
  );
});

console.log(
  JSON.stringify(
    {
      files: files.map((f) => ({ key: f.key, b64: packs[f.key].length })),
      deploy_txt: "scripts/vps-geoflow-gate-deploy.txt",
      parts: parts.length,
      total_chars: readme.length,
    },
    null,
    2
  )
);
