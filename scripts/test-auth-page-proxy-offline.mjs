#!/usr/bin/env node

/**
 * Regression test for the public proxy's HTML injections.
 * It uses a local mock upstream and never calls the real site or any model.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proxyFile = path.join(
  repoRoot,
  "services",
  "creem-moderation-proxy",
  "server.mjs"
);
const html =
  '<!doctype html><html><head><title>test</title></head><body><div id="root"></div></body></html>';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function waitForExitOrOutput(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("proxy did not start")), timeoutMs);
    const onData = (chunk) => {
      const text = String(chunk);
      if (text.includes("creem-moderation-proxy on")) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`proxy exited before start (${code})`));
    });
  });
}

let finishChatStream;
let lastChatBody;
const upstream = http.createServer(async (req, res) => {
  if (req.url === "/v1/chat/completions") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    lastChatBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"choices":[{"delta":{"content":"first"}}]}\n\n');
    finishChatStream = () => res.end("data: [DONE]\n\n");
    return;
  }
  res.writeHead(req.url === "/api/status" ? 200 : 200, {
    "content-type": req.url?.startsWith("/api/")
      ? "application/json"
      : "text/html; charset=utf-8",
  });
  res.end(req.url?.startsWith("/api/") ? '{"success":true}' : html);
});
const upstreamPort = await listen(upstream);
const proxyPort = await new Promise((resolve, reject) => {
  const probe = http.createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});

const child = spawn(process.execPath, [proxyFile], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PORT: String(proxyPort),
    LISTEN_HOST: "127.0.0.1",
    UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}`,
    CREEM_API_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForExitOrOutput(child);
  const wrongBaseUrlResponse = await fetch(
    `http://127.0.0.1:${proxyPort}/chat/completions`,
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
  );
  const wrongBaseUrlBody = await wrongBaseUrlResponse.json();
  assert.equal(wrongBaseUrlResponse.status, 404);
  assert.equal(wrongBaseUrlBody?.error?.code, "base_url_missing_v1");

  const authResponse = await fetch(`http://127.0.0.1:${proxyPort}/sign-up`);
  const authBody = await authResponse.text();
  assert.equal(authResponse.status, 200);
  assert.match(authBody, /keyo-oauth-enable/);
  assert.doesNotMatch(authBody, /keyo-pricing-sort-v\d+|keyo-model-icons-v3|keyo-locale-desc/);

  const pricingResponse = await fetch(`http://127.0.0.1:${proxyPort}/pricing`);
  const pricingBody = await pricingResponse.text();
  assert.equal(pricingResponse.status, 200);
  assert.ok(/keyo-pricing-sort-v\d+/.test(pricingBody));
  assert.match(pricingBody, /keyo-model-icons-v3/);

  const streamedResponse = await Promise.race([
    fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "nemotron-3-ultra-550b-a55b:free",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
        enable_thinking: true,
        extra_body: { enable_thinking: true, keep: "yes" },
      }),
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("SSE headers were buffered")), 1500)),
  ]);
  assert.equal(streamedResponse.status, 200);
  assert.match(streamedResponse.headers.get("content-type"), /text\/event-stream/);
  assert.equal(lastChatBody.enable_thinking, undefined);
  assert.equal(lastChatBody.extra_body.enable_thinking, undefined);
  assert.equal(lastChatBody.extra_body.keep, "yes");
  assert.equal(lastChatBody.messages[0].content, "hello");
  assert.equal(lastChatBody.stream, true);
  const reader = streamedResponse.body.getReader();
  const firstChunk = await Promise.race([
    reader.read(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("SSE content was buffered")), 1500)),
  ]);
  assert.match(new TextDecoder().decode(firstChunk.value), /"content":"first"/);
  finishChatStream();
  finishChatStream = null;
  const lastChunk = await reader.read();
  assert.match(new TextDecoder().decode(lastChunk.value), /\[DONE\]/);

  const otherModelResponse = await fetch(
    `http://127.0.0.1:${proxyPort}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "other-model", messages: [], enable_thinking: true }),
    }
  );
  assert.equal(lastChatBody.enable_thinking, true);
  finishChatStream();
  finishChatStream = null;
  await otherModelResponse.text();

  console.log("AUTH_PROXY_INJECTION_TEST_OK", {
    authBytes: Buffer.byteLength(authBody),
    pricingBytes: Buffer.byteLength(pricingBody),
  });
} finally {
  finishChatStream?.();
  child.kill();
  await close(upstream);
}
