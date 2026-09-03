/**
 * Generate scripts/vps-install-docs.sh with embedded brand HTML (base64)
 * and try upload + SSH deploy + branding.
 */
import dns from "dns";
import fs from "fs";
import https from "https";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const docsPath = path.join(root, "static", "brand", "keyo-docs.html");
const homePath = path.join(root, "static", "brand", "keyo-home.html");
const publicBase = "https://www.keyoapi.xyz";
const vpsHost = process.env.VPS_HOST || "47.79.232.233";
const vpsUser = process.env.VPS_USER || "root";

const docsBuf = fs.readFileSync(docsPath);
const homeBuf = fs.readFileSync(homePath);
const docsB64 = docsBuf.toString("base64");
const homeB64 = homeBuf.toString("base64");

const installer = `#!/bin/bash
set -euo pipefail
DOMAIN="\${DOMAIN:-www.keyoapi.xyz}"
mkdir -p /opt/ai-relay/static/brand
echo "${docsB64}" | base64 -d > /opt/ai-relay/static/brand/keyo-docs.html
echo "${homeB64}" | base64 -d > /opt/ai-relay/static/brand/keyo-home.html
cat >/etc/caddy/Caddyfile <<EOF
\${DOMAIN} {
	encode gzip

	handle_path /brand/* {
		root * /opt/ai-relay/static/brand
		file_server
	}

	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
EOF
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
echo "==> file sizes"
wc -c /opt/ai-relay/static/brand/keyo-*.html
echo "==> probe"
curl -sI "https://\${DOMAIN}/brand/keyo-docs.html" | head -n 12
echo DONE
`;

const installerPath = path.join(root, "scripts", "vps-install-docs.sh");
fs.writeFileSync(installerPath, installer);
console.log("Wrote", installerPath, "bytes", installer.length);

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function postMultipart(hostname, urlPath, fields, fileField, filename, buf) {
  return new Promise((resolve, reject) => {
    const boundary = "----Keyo" + Date.now();
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
    }
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: text/html\r\n\r\n`
    );
    const body = Buffer.concat([
      Buffer.from(parts.join("")),
      buf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const req = https.request(
      {
        hostname,
        path: urlPath,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
          "User-Agent": "KeyoAPI-Deploy/1.0",
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, body: d.trim() }));
      }
    );
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function tryUpload() {
  try {
    const r = await postMultipart(
      "litterbox.catbox.moe",
      "/resources/internals/api.php",
      { reqtype: "fileupload", time: "24h" },
      "fileToUpload",
      "keyo-docs.html",
      docsBuf
    );
    console.log("litterbox:", r.status, r.body.slice(0, 200));
    if (r.status === 200 && /^https?:\/\//.test(r.body)) return r.body;
  } catch (e) {
    console.warn("litterbox fail:", e.message);
  }
  return null;
}

function sshOk() {
  const r = spawnSync(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "ConnectTimeout=6", `${vpsUser}@${vpsHost}`, "echo ok"],
    { encoding: "utf8" }
  );
  console.log("ssh probe:", r.status, (r.stderr || r.stdout || "").slice(0, 200));
  return r.status === 0;
}

async function applyBranding() {
  const env = loadEnv();
  const loginRes = await fetch(`${publicBase}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: env.NEW_API_ADMIN_USER,
      password: env.NEW_API_ADMIN_PASSWORD,
    }),
  });
  const setCookie = loginRes.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const lj = await loginRes.json();
  if (!lj.success) throw new Error("login failed");
  const h = {
    Authorization: `Bearer ${lj.data.access_token}`,
    "Content-Type": "application/json",
  };
  if (cookie) h.Cookie = cookie;

  async function put(key, value) {
    const r = await fetch(`${publicBase}/api/option/`, {
      method: "PUT",
      headers: h,
      body: JSON.stringify({ key, value }),
    });
    const j = await r.json();
    console.log(key, j.success ? "OK" : j.message || JSON.stringify(j));
  }

  const docsUrl = `${publicBase}/brand/keyo-docs.html`;
  const homeUrl = `${publicBase}/brand/keyo-home.html`;
  const probe = await fetch(docsUrl);
  const text = await probe.text();
  const ok = text.includes("btn-copy") && text.length > 5000;
  console.log("probe", probe.status, text.length, ok);
  if (!ok) return false;
  await put("general_setting.docs_link", docsUrl);
  await put("About", docsUrl);
  await put("HomePageContent", homeUrl);
  return true;
}

const tmpUrl = await tryUpload();
if (tmpUrl) {
  const oneLiner = `sudo bash -c 'mkdir -p /opt/ai-relay/static/brand && curl -fsSL "${tmpUrl}" -o /opt/ai-relay/static/brand/keyo-docs.html && echo "${homeB64}" | base64 -d > /opt/ai-relay/static/brand/keyo-home.html && cat >/etc/caddy/Caddyfile <<EOF
www.keyoapi.xyz {
  encode gzip
  handle_path /brand/* {
    root * /opt/ai-relay/static/brand
    file_server
  }
  handle {
    reverse_proxy 127.0.0.1:3000
  }
}
EOF
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy && curl -sI https://www.keyoapi.xyz/brand/keyo-docs.html | head -n 12'`;
  fs.writeFileSync(path.join(root, "scripts", "vps-one-liner.txt"), oneLiner);
  console.log("Wrote scripts/vps-one-liner.txt");
}

if (sshOk()) {
  const scp = spawnSync(
    "scp",
    [
      "-o",
      "BatchMode=yes",
      installerPath,
      docsPath,
      homePath,
      `${vpsUser}@${vpsHost}:/tmp/`,
    ],
    { encoding: "utf8" }
  );
  console.log("scp", scp.status, scp.stderr || "");
  const ssh = spawnSync(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      `${vpsUser}@${vpsHost}`,
      "sudo bash /tmp/vps-install-docs.sh",
    ],
    { encoding: "utf8" }
  );
  console.log(ssh.stdout || "");
  console.log(ssh.stderr || "");
  if (ssh.status === 0) {
    const ok = await applyBranding();
    console.log(ok ? "FULL DEPLOY OK" : "files installed but branding probe failed");
    process.exit(ok ? 0 : 1);
  }
}

console.log(`
============================================================
无法从本机直连 SSH（${vpsHost}）。

请打开阿里云控制台 → 轻量服务器 → 远程连接 / Workbench，
用 root 或 sudo，执行下面二选一：

A) 若已生成临时链（见上方 litterbox URL），用 scripts/vps-one-liner.txt 整段粘贴

B) 把本机 scripts/vps-install-docs.sh 内容贴到服务器：
   sudo bash vps-install-docs.sh

装完后回复「装好了」，我帮你切换文档链接到
  https://www.keyoapi.xyz/brand/keyo-docs.html
============================================================
`);
process.exit(2);
