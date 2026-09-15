import fs from "fs";

const key = process.env.KEYO_API_KEY;
const src = process.env.SRC_IMAGE;
fs.mkdirSync("tmp", { recursive: true });

async function hit(name, url, init) {
  const res = await fetch(url, init);
  const buf = Buffer.from(await res.arrayBuffer());
  const ctype = res.headers.get("content-type") || "";
  console.log(`[${name}] ${res.status} ${ctype} ${buf.length}`);
  if (ctype.includes("json") || buf[0] === 0x7b) {
    console.log(buf.toString("utf8").slice(0, 400));
  }
  fs.writeFileSync(`tmp/probe-${name}.bin`, buf);
  return { res, buf, ctype };
}

await hit("models", "https://www.keyoapi.xyz/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});

await hit("gitee-upscale-no-file", "https://www.keyoapi.xyz/v1/images/upscaling", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}` },
});

const form = new FormData();
form.append("model", "RMBG-2.0");
form.append("image", new Blob([fs.readFileSync(src)], { type: "image/png" }), "source.png");
const m = await hit("matting", "https://www.keyoapi.xyz/v1/images/mattings", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}` },
  body: form,
});

if (m.res.ok) {
  if (m.ctype.includes("json")) {
    const j = JSON.parse(m.buf.toString("utf8"));
    const item = j.data?.[0] || j;
    if (item.b64_json) {
      fs.writeFileSync("tmp/rmbg-2.0-cutout.png", Buffer.from(item.b64_json, "base64"));
      console.log("saved_b64");
    } else if (item.url) {
      const img = Buffer.from(await (await fetch(item.url)).arrayBuffer());
      fs.writeFileSync("tmp/rmbg-2.0-cutout.png", img);
      console.log("saved_url", item.url, img.length);
    }
  } else {
    fs.writeFileSync("tmp/rmbg-2.0-cutout.png", m.buf);
    console.log("saved_raw");
  }
}
