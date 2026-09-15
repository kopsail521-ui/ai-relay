import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const src =
  process.env.SRC_IMAGE ||
  "C:/Users/rsfqq/.cursor/projects/e-01-ai-relay/assets/c__Users_rsfqq_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_e1e32b5cb6611f09e770b73a805d93c7-1f490e83-9dcc-4f84-b31c-0164ec01fba2.png";
const outPath = path.join(root, "tmp/rmbg-2.0-cutout.png");
const giteeKey = process.env.GITEE_API_KEY;
const giteeBase = (process.env.GITEE_BASE_URL || "https://ai.gitee.com/v1").replace(
  /\/$/,
  "",
);

const buf = fs.readFileSync(src);
const form = new FormData();
form.append("model", "RMBG-2.0");
form.append("image", new Blob([buf], { type: "image/png" }), "source.png");

const url = `${giteeBase}/images/mattings`;
console.log("post", url.replace(/https?:\/\/[^/]+/, "https://[upstream]"));
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${giteeKey}` },
  body: form,
});
const ctype = res.headers.get("content-type") || "";
const body = Buffer.from(await res.arrayBuffer());
console.log("status", res.status, "ctype", ctype, "bytes", body.length);

if (!res.ok) {
  fs.writeFileSync(path.join(root, "tmp/rmbg-2.0-resp.json"), body);
  console.error(body.toString("utf8").slice(0, 800));
  process.exit(1);
}

if (ctype.includes("json") || body[0] === 0x7b) {
  const j = JSON.parse(body.toString("utf8"));
  fs.writeFileSync(
    path.join(root, "tmp/rmbg-2.0-resp.json"),
    JSON.stringify(j, null, 2),
  );
  const item = j.data?.[0] || j;
  const b64 = item.b64_json || item.image || j.image;
  const fileUrl = item.url || j.url;
  if (b64) {
    fs.writeFileSync(
      outPath,
      Buffer.from(String(b64).replace(/^data:image\/\w+;base64,/, ""), "base64"),
    );
    console.log("saved_b64", fs.statSync(outPath).size);
  } else if (fileUrl) {
    const img = Buffer.from(await (await fetch(fileUrl)).arrayBuffer());
    fs.writeFileSync(outPath, img);
    console.log("saved_url", img.length);
  } else {
    console.error("unknown json keys", Object.keys(j));
    process.exit(1);
  }
} else {
  fs.writeFileSync(outPath, body);
  console.log("saved_raw", body.length);
}
