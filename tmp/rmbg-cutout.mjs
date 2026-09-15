import fs from "fs";
import path from "path";
import { FormData, File, Blob } from "buffer";

const apiKey = process.env.KEYO_API_KEY;
if (!apiKey) {
  console.error("missing KEYO_API_KEY");
  process.exit(1);
}

const src =
  process.argv[2] ||
  "C:/Users/rsfqq/.cursor/projects/e-01-ai-relay/assets/c__Users_rsfqq_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_e1e32b5cb6611f09e770b73a805d93c7-1f490e83-9dcc-4f84-b31c-0164ec01fba2.png";
const outPath = process.argv[3] || "tmp/rmbg-2.0-cutout.png";

const buf = fs.readFileSync(src);
const form = new FormData();
form.append("model", "RMBG-2.0");
form.append("image", new Blob([buf], { type: "image/png" }), "source.png");

const res = await fetch("https://www.keyoapi.xyz/v1/images/mattings", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}` },
  body: form,
});

const ctype = res.headers.get("content-type") || "";
console.log("status", res.status, "content-type", ctype);

if (!res.ok) {
  const text = await res.text();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath + ".err.txt", text);
  console.error(text.slice(0, 1000));
  process.exit(1);
}

const ab = await res.arrayBuffer();
const bytes = Buffer.from(ab);

// JSON with url/b64, or raw image bytes
if (ctype.includes("application/json")) {
  const j = JSON.parse(bytes.toString("utf8"));
  fs.writeFileSync(outPath + ".json", JSON.stringify(j, null, 2));
  const item = j.data?.[0] || j;
  if (item.b64_json) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(item.b64_json, "base64"));
    console.log("saved_b64", outPath, fs.statSync(outPath).size);
  } else if (item.url) {
    const img = await fetch(item.url);
    const imgBuf = Buffer.from(await img.arrayBuffer());
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, imgBuf);
    console.log("saved_url", outPath, imgBuf.length, item.url);
  } else {
    console.log("unexpected_json", Object.keys(j));
    process.exit(1);
  }
} else {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, bytes);
  console.log("saved_raw", outPath, bytes.length);
}
