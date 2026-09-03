/**
 * Upload fixed multilingual brand pages and point the live site at them.
 * Works without SSH (paste/catbox mirror + New API options API).
 *
 *   node scripts/deploy-brand-i18n-fix.mjs
 */
import dns from "dns";
import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicBase = "https://www.keyoapi.xyz";
const homePath = path.join(root, "static", "brand", "keyo-home.html");
const docsPath = path.join(root, "static", "brand", "keyo-docs.html");

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
    req.setTimeout(30000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function uploadHtml(filename, buf) {
  const attempts = [
    async () => {
      const r = await postForm(
        "litterbox.catbox.moe",
        "/resources/internals/api.php",
        { reqtype: "fileupload", time: "72h" },
        "fileToUpload",
        filename,
        buf
      );
      if (r.status === 200 && /^https?:\/\//.test(r.body)) return r.body;
      throw new Error(`litterbox ${r.status} ${r.body.slice(0, 160)}`);
    },
    async () => {
      const r = await postForm(
        "catbox.moe",
        "/user/api.php",
        { reqtype: "fileupload" },
        "fileToUpload",
        filename,
        buf
      );
      if (r.status === 200 && /^https?:\/\//.test(r.body)) return r.body;
      throw new Error(`catbox ${r.status} ${r.body.slice(0, 160)}`);
    },
  ];
  for (const fn of attempts) {
    try {
      const url = await fn();
      console.log("Uploaded", filename, "->", url);
      return url;
    } catch (e) {
      console.warn("Upload failed:", e.message);
    }
  }
  throw new Error(`Could not upload ${filename}`);
}

async function putOption(h, key, value) {
  const r = await fetch(`${publicBase}/api/option/`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ key, value }),
  });
  const j = await r.json();
  console.log(key, j.success ? "OK" : j.message || JSON.stringify(j));
  if (!j.success) throw new Error(`put failed: ${key}`);
}

const homeBuf = fs.readFileSync(homePath);
const docsBuf = fs.readFileSync(docsPath);

for (const [name, buf] of [
  ["home", homeBuf],
  ["docs", docsBuf],
]) {
  const text = buf.toString("utf8");
  if (!text.includes("keyo-brand-ready") || !text.includes("readQueryLang")) {
    throw new Error(`${name} missing i18n sync hooks — abort`);
  }
}

const homeUrl = await uploadHtml("keyo-home.html", homeBuf);
const docsUrl = await uploadHtml("keyo-docs.html", docsBuf);

for (const [name, url] of [
  ["home", homeUrl],
  ["docs", docsUrl],
]) {
  const r = await fetch(url);
  const t = await r.text();
  console.log(
    `probe ${name}`,
    r.status,
    "len",
    t.length,
    "ready",
    t.includes("keyo-brand-ready"),
    "queryLang",
    t.includes("readQueryLang")
  );
  if (!r.ok || !t.includes("keyo-brand-ready")) {
    throw new Error(`${name} mirror unusable: ${url}`);
  }
}

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

await putOption(h, "SystemName", "KeyoAPI");
await putOption(h, "HomePageContent", homeUrl);
await putOption(h, "About", docsUrl);
await putOption(h, "general_setting.docs_link", docsUrl);
await putOption(h, "Footer", "KeyoAPI · One endpoint, many models");

const verify = await fetch(`${publicBase}/api/home_page_content`).then((r) => r.json());
console.log("\nHomePageContent now:", verify.data);
console.log("Hard-refresh https://www.keyoapi.xyz and switch 文A — hero must follow.");
console.log(
  "\nLater (on VPS), copy static/brand into /opt/ai-relay/static/brand and run:\n  node scripts/apply-site-branding.mjs"
);
