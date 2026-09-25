#!/usr/bin/env node

/**
 * Offline regression test for the InfiniteTalk compatibility adapter.
 * It only uses local mock servers and never calls a real model.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serviceFile = path.join(repoRoot, "services", "gitee-passthrough", "server.mjs");

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

function waitForStart(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("passthrough did not start")), 5000);
    const onData = (chunk) => {
      if (String(chunk).includes("Gitee passthrough on")) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`passthrough exited before start (${code})`));
    });
  });
}

let upstreamBody = Buffer.alloc(0);
let upstreamStatus = 200;
let upstreamDelayMs = 0;
let upstreamOmitTaskId = false;
let quotaAtRejectedRequest = null;
const upstream = http.createServer(async (req, res) => {
  upstreamBody = Buffer.alloc(0);
  for await (const chunk of req) upstreamBody = Buffer.concat([upstreamBody, chunk]);
  if (upstreamDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, upstreamDelayMs));
  }
  if (upstreamStatus === 400) quotaAtRejectedRequest = userQuota();
  res.writeHead(upstreamStatus, { "content-type": "application/json" });
  if (upstreamStatus === 200) {
    res.end(
      JSON.stringify(
        upstreamOmitTaskId
          ? { status: "submitted" }
          : { id: "mock-task", status: "submitted" }
      )
    );
  } else {
    res.end(JSON.stringify({ error: { message: "invalid request" } }));
  }
});
const upstreamPort = await listen(upstream);

const newApi = http.createServer((req, res) => {
  if (req.url === "/api/usage/token/") {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end('{"data":[]}');
});
const newApiPort = await listen(newApi);

const probe = http.createServer();
const servicePort = await listen(probe);
await close(probe);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "keyo-infinitetalk-test-"));
const dbPath = path.join(tempDir, "one-api.db");
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, quota INTEGER, used_quota INTEGER, request_count INTEGER);
  CREATE TABLE tokens (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, status INTEGER, remain_quota INTEGER, used_quota INTEGER, unlimited_quota INTEGER, key TEXT, deleted_at INTEGER);
  CREATE TABLE logs (user_id INTEGER, created_at INTEGER, type INTEGER, content TEXT, username TEXT, token_name TEXT, model_name TEXT, quota INTEGER, prompt_tokens INTEGER, completion_tokens INTEGER, use_time INTEGER, is_stream INTEGER, channel_id INTEGER, token_id INTEGER, "group" TEXT, ip TEXT, request_id TEXT, upstream_request_id TEXT, other TEXT);
  INSERT INTO users VALUES (1, 1000000, 0, 0);
  INSERT INTO tokens VALUES (1, 1, 'test', 1, 1000000, 0, 0, 'mock', NULL);
`);
db.close();

function userQuota() {
  const connection = new DatabaseSync(dbPath, { readOnly: true });
  try { return connection.prepare("SELECT quota FROM users WHERE id = 1").get().quota; }
  finally { connection.close(); }
}

async function waitForQuota(expected) {
  for (let i = 0; i < 50; i++) {
    if (userQuota() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(userQuota(), expected);
}

function latestLogQuota() {
  const connection = new DatabaseSync(dbPath, { readOnly: true });
  try { return connection.prepare("SELECT quota FROM logs ORDER BY rowid DESC LIMIT 1").get()?.quota; }
  finally { connection.close(); }
}

function wavSeconds(seconds) {
  const sampleRate = 16000;
  const dataBytes = sampleRate * 2 * seconds;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

const child = spawn(process.execPath, [serviceFile], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PORT: String(servicePort),
    LISTEN_HOST: "127.0.0.1",
    GITEE_API_KEY: "mock-upstream-key",
    GITEE_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
    NEW_API_BASE: `http://127.0.0.1:${newApiPort}`,
    NEW_API_DB: dbPath,
    CATALOG: path.join(repoRoot, "services", "gitee-passthrough", "catalog.json"),
    INFINITETALK_SUBMIT_TIMEOUT_MS: "80",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
  await waitForStart(child);
  const boundary = "----keyo-test-boundary";
  const bodyForAudio = (audio) => Buffer.from(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="model"\r\n\r\n' +
      "InfiniteTalk\r\n" +
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="prompt"\r\n\r\n' +
      "natural talking-head delivery\r\n" +
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="image"; filename="face.png"\r\n' +
      "Content-Type: image/png\r\n\r\n" +
      "mock-image\r\n" +
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="audio"; filename="voice.wav"\r\n' +
      "Content-Type: audio/wav\r\n\r\n" +
      audio.toString("latin1") + "\r\n" +
      `--${boundary}--\r\n`,
    "latin1"
  );
  const body = bodyForAudio(wavSeconds(1));
  const response = await fetch(
    `http://127.0.0.1:${servicePort}/v1/async/videos/image-to-video`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-mock",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    }
  );
  assert.equal(response.status, 200, await response.text());
  assert.ok(userQuota() < 1000000);
  const quotaAfterSuccess = userQuota();
  assert.match(upstreamBody.toString("latin1"), /name="cond_video"/);
  assert.match(upstreamBody.toString("latin1"), /name="cond_audio"/);
  assert.doesNotMatch(upstreamBody.toString("latin1"), /name="image"/);
  assert.doesNotMatch(upstreamBody.toString("latin1"), /name="audio"/);
  const upstreamBytes = upstreamBody.length;
  const withoutPrompt = Buffer.from(
    body
      .toString("latin1")
      .replace(
        `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\nnatural talking-head delivery\r\n`,
        ""
      ),
    "latin1"
  );
  const invalidResponse = await fetch(
    `http://127.0.0.1:${servicePort}/v1/async/videos/image-to-video`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-mock",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: withoutPrompt,
    }
  );
  assert.equal(invalidResponse.status, 400);
  assert.equal((await invalidResponse.json()).error.code, "missing_infinitetalk_field");
  assert.equal(upstreamBody.length, upstreamBytes);
  assert.equal(userQuota(), quotaAfterSuccess);

  // Upstream Gitee caps audio at 15s — Keyo rejects longer clips up front.
  const longResponse = await fetch(
    `http://127.0.0.1:${servicePort}/v1/async/videos/image-to-video`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-mock",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyForAudio(wavSeconds(16)),
    }
  );
  assert.equal(longResponse.status, 400);
  assert.equal(
    (await longResponse.json()).error.code,
    "infinitetalk_audio_too_long"
  );
  assert.equal(upstreamBody.length, upstreamBytes);
  assert.equal(userQuota(), quotaAfterSuccess);

  upstreamStatus = 400;
  const rejectedResponse = await fetch(
    `http://127.0.0.1:${servicePort}/v1/async/videos/image-to-video`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-mock",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    }
  );
  assert.equal(rejectedResponse.status, 400);
  // Bill-after-task_id: no precharge before upstream, so quota unchanged on 400.
  assert.equal(quotaAtRejectedRequest, quotaAfterSuccess);
  assert.equal(userQuota(), quotaAfterSuccess);

  upstreamStatus = 200;
  upstreamOmitTaskId = true;
  const missingIdResponse = await fetch(
    `http://127.0.0.1:${servicePort}/v1/async/videos/image-to-video`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-mock",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    }
  );
  assert.equal(missingIdResponse.status, 502);
  assert.equal((await missingIdResponse.json()).error.code, "missing_task_id");
  assert.equal(userQuota(), quotaAfterSuccess);
  upstreamOmitTaskId = false;

  upstreamDelayMs = 200;
  const timeoutResponse = await fetch(
    `http://127.0.0.1:${servicePort}/v1/async/videos/image-to-video`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-mock",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    }
  );
  assert.equal(timeoutResponse.status, 504);
  assert.equal(
    (await timeoutResponse.json()).error.code,
    "submission_status_unknown"
  );
  assert.equal(userQuota(), quotaAfterSuccess);
  upstreamDelayMs = 0;

  const currentBody = Buffer.from(
    body.toString("latin1")
      .replace('name="image"', 'name="cond_video"')
      .replace('name="audio"', 'name="cond_audio"'),
    "latin1"
  );
  const currentResponse = await fetch(
    `http://127.0.0.1:${servicePort}/v1/async/videos/image-to-video`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-mock",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: currentBody,
    }
  );
  assert.equal(currentResponse.status, 200);
  assert.match(upstreamBody.toString("latin1"), /name="cond_video"/);
  assert.match(upstreamBody.toString("latin1"), /name="cond_audio"/);
  assert.ok(userQuota() < quotaAfterSuccess);

  const pollResponse = await fetch(
    `http://127.0.0.1:${servicePort}/v1/task/mock-task`,
    { headers: { Authorization: "Bearer sk-mock" } }
  );
  assert.equal(pollResponse.status, 200);
  assert.equal((await pollResponse.json()).status, "processing");
  console.log("GITEE_INFINITETALK_COMPAT_TEST_OK");
} finally {
  const childExited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await childExited;
  await close(upstream);
  await close(newApi);
  fs.rmSync(tempDir, { recursive: true, force: true });
}
