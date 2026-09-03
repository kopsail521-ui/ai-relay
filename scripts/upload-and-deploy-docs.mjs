/**
 * 发版 KeyoAPI 文档页：
 * 1) 尝试上传临时托管拿到公网 URL（给 VPS curl）
 * 2) 若本机有 SSH，直接 scp + 配置 Caddy
 * 3) 最后调用 apply-site-branding 逻辑写入 docs_link / About
 *
 * 用法：node scripts/upload-and-deploy-docs.mjs
 * 可选：VPS_HOST=47.79.232.233 VPS_USER=root
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

function multipart(fields, fileField, filename, buf) {
  const boundary = "----KeyoBoundary" + Date.now();
  const chunks = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
    );
  }
  chunks.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: text/html\r\n\r\n`
  );
  const head = Buffer.from(chunks.join(""));
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    boundary,
    body: Buffer.concat([head, buf, tail]),
  };
}

function postForm(hostname, postPath, fields, fileField, filename, buf) {
  return new Promise((resolve, reject) => {
    const { boundary, body } = multipart(fields, fileField, filename, buf);
    const req = https.request(
      {
        hostname,
        path: postPath,
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
    req.setTimeout(25000, () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function tryUpload(buf) {
  const attempts = [
    async () => {
      const r = await postForm(
        "litterbox.catbox.moe",
        "/resources/internals/api.php",
        { reqtype: "fileupload", time: "24h" },
        "fileToUpload",
        "keyo-docs.html",
        buf
      );
      if (r.status === 200 && /^https?:\/\//.test(r.body)) return r.body;
      throw new Error(`litterbox ${r.status} ${r.body.slice(0, 120)}`);
    },
    async () => {
      const r = await postForm(
        "catbox.moe",
        "/user/api.php",
        { reqtype: "fileupload" },
        "fileToUpload",
        "keyo-docs.html",
        buf
      );
      if (r.status === 200 && /^https?:\/\//.test(r.body)) return r.body;
      throw new Error(`catbox ${r.status} ${r.body.slice(0, 120)}`);
    },
  ];
  for (const fn of attempts) {
    try {
      const url = await fn();
      console.log("Uploaded:", url);
      return url;
    } catch (e) {
      console.warn("Upload attempt failed:", e.message);
    }
  }
  return null;
}

function writeRemoteInstaller(docsB64, homeB64, tmpUrl) {
  const out = path.join(root, "scripts", "vps-install-docs.sh");
  const fetchPart = tmpUrl
    ? `curl -fsSL "${tmpUrl}" -o /opt/ai-relay/static/brand/keyo-docs.html`
    : `echo "${docsB64}" | base64 -d > /opt/ai-relay/static/brand/keyo-docs.html`;
  const homePart = `echo "${homeB64}" | base64 -d > /opt/ai-relay/static/brand/keyo-home.html`;
  const sh = `#!/bin/bash
set -euo pipefail
DOMAIN="\${DOMAIN:-www.keyoapi.xyz}"
mkdir -p /opt/ai-relay/static/brand
${fetchPart}
${homePart}
cat >/etc/caddy/Caddyfile <<'EOF'
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
# also allow apex if used
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
curl -sI "https://\${DOMAIN}/brand/keyo-docs.html" | head -n 8
echo "DONE"
`;
  fs.writeFileSync(out, sh.replace("www.keyoapi.xyz", "${DOMAIN}").replace(
    "www.keyoapi.xyz {",
    "${DOMAIN} {\n".replace("${DOMAIN}", "www.keyoapi.xyz")
  ));
  // rewrite cleanly without the botched replace above
  const clean = `#!/bin/bash
set -euo pipefail
DOMAIN="\${DOMAIN:-www.keyoapi.xyz}"
mkdir -p /opt/ai-relay/static/brand
${fetchPart}
${homePart}
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
echo "==> headers"
curl -sI "https://\${DOMAIN}/brand/keyo-docs.html" | head -n 10
wc -c /opt/ai-relay/static/brand/keyo-docs.html
echo DONE
`;
  fs.writeFileSync(out, clean);
  console.log("Wrote", out);
  return out;
}

function tryScp() {
  const r = spawnSync(
    "scp",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=8",
      "-o",
      "StrictHostKeyChecking=accept-new",
      docsPath,
      homePath,
      `${vpsUser}@${vpsHost}:/opt/ai-relay/static/brand/`,
    ],
    { encoding: "utf8" }
  );
  console.log("scp status", r.status, r.stderr || r.stdout);
  return r.status === 0;
}

function trySshInstall() {
  const cmd = `mkdir -p /opt/ai-relay/static/brand && cat >/etc/caddy/Caddyfile <<'EOF'
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
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy && curl -sI https://www.keyoapi.xyz/brand/keyo-docs.html | head -n 8`;
  const r = spawnSync(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=8",
      `${vpsUser}@${vpsHost}`,
      cmd,
    ],
    { encoding: "utf8" }
  );
  console.log("ssh status", r.status, r.stderr || r.stdout);
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
  if (!lj.success) throw new Error("login failed: " + JSON.stringify(lj));
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
    return j.success;
  }

  const docsUrl = `${publicBase}/brand/keyo-docs.html`;
  const homeUrl = `${publicBase}/brand/keyo-home.html`;
  const probe = await fetch(docsUrl, { method: "GET", redirect: "manual" });
  const text = await probe.text();
  const ok =
    probe.status >= 200 &&
    probe.status < 400 &&
    text.includes("一键") === false &&
    text.includes("btn-copy") &&
    text.length > 5000;

  console.log("Probe docs", probe.status, "len", text.length, "ok", ok);
  if (!ok) {
    console.warn("Static docs not live yet — skip pointing docs_link to /brand");
    return false;
  }
  await put("general_setting.docs_link", docsUrl);
  await put("About", docsUrl);
  await put("HomePageContent", homeUrl);
  await put("SystemName", "KeyoAPI");
  return true;
}

const docsBuf = fs.readFileSync(docsPath);
const homeBuf = fs.readFileSync(homePath);
const docsB64 = docsBuf.toString("base64");
const homeB64 = homeBuf.toString("base64");

const tmpUrl = await tryUpload(docsBuf);
writeRemoteInstaller(docsB64, homeB64, tmpUrl);

let deployed = false;
if (tryScp()) {
  deployed = trySshInstall();
}

if (!deployed) {
  const installHint = tmpUrl
    ? `curl -fsSL "${tmpUrl}" -o /tmp/keyo-docs.html
mkdir -p /opt/ai-relay/static/brand
cp /tmp/keyo-docs.html /opt/ai-relay/static/brand/keyo-docs.html
echo "${homeB64}" | base64 -d > /opt/ai-relay/static/brand/keyo-home.html`
    : "echo Use scripts/vps-install-docs.sh after copying brand files";

  console.log(
    [
      "============================================================",
      `本机无法 SSH 到 ${vpsHost}（无密钥或 22 被拦）。`,
      "",
      "请你打开阿里云 Workbench（远程连接），粘贴执行：",
      "",
      installHint,
      "",
      "然后配置 Caddy /brand 并 reload（见 scripts/deploy-brand-static.sh）。",
      "",
      "完成后回复「装好了」，我再帮你切文档链接。",
      "============================================================",
    ].join("\n")
  );
  // Also print a compact one-liner if upload worked
  if (tmpUrl) {
    const one = `sudo mkdir -p /opt/ai-relay/static/brand && sudo curl -fsSL "${tmpUrl}" -o /opt/ai-relay/static/brand/keyo-docs.html && echo "${homeB64}" | base64 -d | sudo tee /opt/ai-relay/static/brand/keyo-home.html >/dev/null && sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
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
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy && curl -sI https://www.keyoapi.xyz/brand/keyo-docs.html | head`;
    fs.writeFileSync(path.join(root, "scripts", "vps-one-liner.txt"), one);
    console.log("One-liner saved to scripts/vps-one-liner.txt");
  }
  process.exitCode = 2;
} else {
  const ok = await applyBranding();
  console.log(ok ? "Deploy + branding OK" : "Deployed files but branding probe failed");
}
