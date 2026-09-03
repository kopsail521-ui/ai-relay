/**
 * 测试 Grsai 上游是否通（不经过 New API）
 * node scripts/test-grsai.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) {
    console.error("缺少 .env");
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const base = (env.GRSAI_BASE_URL || "https://grsaiapi.com").replace(/\/$/, "");
const key = env.GRSAI_API_KEY;

if (!key) {
  console.error("GRSAI_API_KEY 未设置");
  process.exit(1);
}

async function testChat() {
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-terra",
      stream: false,
      messages: [{ role: "user", content: "reply with exactly: ok" }],
    }),
  });
  const text = await res.text();
  console.log("[chat]", res.status, text.slice(0, 300));
  return res.ok;
}

async function testImage() {
  const res = await fetch(`${base}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nano-banana-2",
      prompt: "a red circle on white background",
      size: "1024x1024",
      response_format: "url",
    }),
  });
  const text = await res.text();
  console.log("[image]", res.status, text.slice(0, 400));
  return res.ok;
}

console.log("Testing Grsai at", base);
const chatOk = await testChat();
console.log("---");
const imgOk = await testImage();
console.log("---");
console.log(chatOk && imgOk ? "ALL OK" : "SOME FAILED (check balance / model name)");
