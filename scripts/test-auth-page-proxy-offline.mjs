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

const upstream = http.createServer((req, res) => {
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
  const authResponse = await fetch(`http://127.0.0.1:${proxyPort}/sign-up`);
  const authBody = await authResponse.text();
  assert.equal(authResponse.status, 200);
  assert.match(authBody, /keyo-oauth-enable/);
  assert.doesNotMatch(authBody, /keyo-pricing-sort-v14|keyo-model-icons-v3|keyo-locale-desc/);

  const pricingResponse = await fetch(`http://127.0.0.1:${proxyPort}/pricing`);
  const pricingBody = await pricingResponse.text();
  assert.equal(pricingResponse.status, 200);
  assert.match(pricingBody, /keyo-pricing-sort-v14/);
  assert.match(pricingBody, /keyo-model-icons-v3/);

  console.log("AUTH_PROXY_INJECTION_TEST_OK", {
    authBytes: Buffer.byteLength(authBody),
    pricingBytes: Buffer.byteLength(pricingBody),
  });
} finally {
  child.kill();
  await close(upstream);
}
