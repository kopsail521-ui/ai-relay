import fs from "fs";
import https from "https";

const body = JSON.stringify({
  model: "gpt-image-2",
  prompt: [
    "Clean English KeyoAPI model detail CARD screenshot (card only, no sidebar).",
    "White SaaS UI, blue accents, sharp readable sans-serif.",
    "Title: DeepSeek-V4.1-Flash with DeepSeek whale logo.",
    "Pills: 1M and Cache support.",
    "Buttons: solid blue Try in console; outline Get API key; outline API Docs.",
    "Pricing section, dropdown Pay-as-you-go.",
    "Table: Interface | Price (USD / 1M tokens) Input | Output.",
    "Row MUST read exactly: Chat completions | $0.45 | $1.80",
    "CRITICAL: output price is $1.80 (one dollar eighty). Never write $0.80.",
    "Details: Type Chat; Concurrency Unlimited, load-balanced; Model ID deepseek-v4.1-flash; Endpoint https://www.keyoapi.xyz/v1",
    "Small KeyoAPI brand mark. No Chinese. No Moark. No fake logos.",
  ].join(" "),
  size: "1536x1024",
  n: 1,
});

const apiKey = process.env.KEYO_API_KEY;
if (!apiKey) {
  console.error("missing KEYO_API_KEY");
  process.exit(1);
}

const req = https.request(
  {
    hostname: "www.keyoapi.xyz",
    path: "/v1/images/generations",
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    timeout: 180000,
  },
  (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      fs.writeFileSync("tmp/gpt-image-2-ds41-resp-v2.json", data);
      console.log("status", res.statusCode);
      const j = JSON.parse(data);
      const item = j.data && j.data[0];
      if (item?.b64_json) {
        fs.writeFileSync(
          "tmp/keyo-deepseek-v4.1-flash-en-v2.png",
          Buffer.from(item.b64_json, "base64"),
        );
        console.log("saved_b64");
      } else if (item?.url) {
        console.log("url", item.url);
        https
          .get(item.url, (r) => {
            const chunks = [];
            r.on("data", (d) => chunks.push(d));
            r.on("end", () => {
              fs.writeFileSync(
                "tmp/keyo-deepseek-v4.1-flash-en-v2.png",
                Buffer.concat(chunks),
              );
              console.log(
                "saved_url",
                fs.statSync("tmp/keyo-deepseek-v4.1-flash-en-v2.png").size,
              );
            });
          })
          .on("error", (e) => console.error(e.message));
      } else {
        console.log(data.slice(0, 800));
      }
    });
  },
);

req.on("error", (e) => console.error(e.message));
req.on("timeout", () => {
  console.error("timeout");
  req.destroy();
});
req.write(body);
req.end();
