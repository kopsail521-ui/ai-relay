import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const listen = async (server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
};
const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};
const hash = (body) => createHash("sha256").update(body).digest("hex");
const close = async (server) => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
};

// fetch itself refuses Expect/chunked headers, so send real client HTTP framing.
function upload(url, body, headers, chunked = false) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "POST", headers }, async (res) => {
      try {
        resolve({ status: res.statusCode, body: JSON.parse((await readBody(res)).toString()) });
      } catch (error) { reject(error); }
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("Local upload timed out")));
    if (headers.expect) {
      req.once("continue", () => req.end(body));
      req.flushHeaders();
    } else if (chunked) {
      req.write(body.subarray(0, 65536));
      req.end(body.subarray(65536));
    } else req.end(body);
  });
}

test("large multipart uploads preserve bytes and submit once across HTTP framing", { timeout: 20000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keyo-gitee-http-"));
  // The temporary copy keeps production routing/helpers intact while preventing
  // the service from discovering a developer or VPS .env during this test.
  const source = fs.readFileSync(path.join(serviceDir, "server.mjs"), "utf8");
  fs.writeFileSync(path.join(dir, "server.mjs"), source.replace("loadEnvFile();", "// no environment files in offline tests"));
  for (const file of ["decisions.mjs", "fix-marketplace-meta.mjs", "catalog.json"]) {
    fs.copyFileSync(path.join(serviceDir, file), path.join(dir, file));
  }
  const guard = path.join(dir, "local-fetch-only.mjs");
  fs.writeFileSync(guard, `const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('Offline test forbids external fetch');
  return original(input, init);
};`);
  const received = [];
  let pollMode = "ok";
  const upstream = http.createServer(async (req, res) => {
    const body = await readBody(req);
    received.push({ url: req.url, headers: req.headers, body });
    if (req.url.startsWith("/v1/task/")) {
      if (pollMode === "reset") { req.socket.destroy(); return; }
      if (pollMode === "hang") return;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ task_id: "local-task", status: "success", output: { file_url: "https://example.invalid/result.wav" } }));
      return;
    }
    res.writeHead(202, { "content-type": "application/json" });
    res.end(JSON.stringify({ task_id: "local-task", status: "waiting" }));
  });
  let authProbeObserved;
  const auth = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"data":[]}');
    authProbeObserved?.();
  });
  const upPort = await listen(upstream), authPort = await listen(auth);
  const probe = http.createServer(), servicePort = await listen(probe);
  await close(probe);
  const child = spawn(process.execPath, ["--import", pathToFileURL(guard).href, path.join(dir, "server.mjs")], {
    cwd: dir,
    env: {
      ...process.env, PORT: String(servicePort), LISTEN_HOST: "127.0.0.1",
      GITEE_API_KEY: "local-upstream-only", GITEE_BASE_URL: `http://127.0.0.1:${upPort}`,
      NEW_API_BASE: `http://127.0.0.1:${authPort}`, NEW_API_DB: path.join(dir, "absent-test.db"),
      CATALOG: path.join(dir, "catalog.json"), GITEE_TASK_QUERY_TIMEOUT_MS: "1000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    await close(upstream);
    await close(auth);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Service startup failed: ${output}`)), 5000);
    child.stdout.on("data", () => {
      if (output.includes("Gitee passthrough on")) { clearTimeout(timer); resolve(); }
    });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Service exited (${code}): ${output}`)); });
  });
  const boundary = "keyo-large-upload-regression";
  const image = Buffer.alloc(Math.ceil(1.2 * 1024 * 1024), 0xa5);
  const scenarios = [
    { name: "control: 1.2MiB document", model: "MinerU2.5-Pro", route: "/v1/async/documents/parse", field: "file" },
    { name: "curl Expect: 1.2MiB document", model: "MinerU2.5-Pro", route: "/v1/async/documents/parse", field: "file", expect: true },
    { name: "chunked: 1.2MiB vision image", model: "RMBG-2.0", route: "/v1/images/mattings", field: "image", chunked: true },
    { name: "Connection-nominated headers", model: "MinerU2.5-Pro", route: "/v1/async/documents/parse", field: "file", connection: true },
  ];
  for (const scenario of scenarios) await t.test(scenario.name, async () => {
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${scenario.model}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="${scenario.field}"; filename="fixture.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      image, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const headers = {
      authorization: "Bearer sk-local-client-only", "content-type": `multipart/form-data; boundary=${boundary}`,
      "idempotency-key": `local-${scenario.name}`, "x-failover-enabled": "false",
      ...(scenario.chunked ? { "transfer-encoding": "chunked" } : { "content-length": body.length }),
      ...(scenario.expect ? { expect: "100-continue" } : {}),
      ...(scenario.connection ? {
        connection: "close, X-Client-Only", "x-client-only": "must-not-forward",
        "keep-alive": "timeout=999", "proxy-connection": "keep-alive", te: "trailers",
        "proxy-authorization": "local-proxy-only", "proxy-authenticate": "Basic",
      } : {}),
    };
    const before = received.length;
    const response = await upload(`http://127.0.0.1:${servicePort}${scenario.route}`, body, headers, scenario.chunked);
    assert.equal(response.status, 202, JSON.stringify(response));
    assert.equal(response.body.task_id, "local-task");
    assert.equal(received.length - before, 1, "a client upload must create only one upstream request");
    const forwarded = received.at(-1);
    assert.equal(forwarded.url, scenario.route);
    assert.equal(forwarded.body.length, body.length);
    assert.equal(hash(forwarded.body), hash(body), "multipart bytes must arrive unchanged");
    assert.equal(forwarded.headers["content-type"], headers["content-type"]);
    assert.equal(forwarded.headers["idempotency-key"], headers["idempotency-key"]);
    assert.equal(forwarded.headers["x-failover-enabled"], "false");
    assert.equal(forwarded.headers.authorization, "Bearer local-upstream-only");
    assert.equal(forwarded.headers.host, `127.0.0.1:${upPort}`);
    assert.equal(Number(forwarded.headers["content-length"]), body.length);
    for (const name of ["expect", "transfer-encoding", "x-client-only", "keep-alive", "proxy-connection", "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate"]) {
      assert.equal(forwarded.headers[name], undefined, `${name} belongs to the incoming connection`);
    }
  });
  await t.test("task query disconnect returns recoverable 502 and the same task can be queried again", async () => {
    const submissions = received.filter((request) => !request.url.startsWith("/v1/task/")).length;
    pollMode = "reset";
    const url = `http://127.0.0.1:${servicePort}/v1/task/local-task`;
    const options = { headers: { authorization: "Bearer sk-local-client-only" }, signal: AbortSignal.timeout(3000) };
    const failed = await fetch(url, options);
    const error = await failed.json();
    assert.equal(failed.status, 502);
    assert.equal(error.error.code, "task_query_unavailable");
    assert.equal(error.error.task_id, "local-task");
    assert.match(error.error.message, /same task ID/i);
    assert.match(error.error.message, /do not submit/i);
    assert.equal(child.exitCode, null, "a temporary query error must not terminate the gateway");
    pollMode = "ok";
    const retry = await fetch(url, { ...options, signal: AbortSignal.timeout(3000) });
    const result = await retry.json();
    assert.equal(retry.status, 200);
    assert.equal(result.task_id, "local-task");
    assert.equal(result.status, "completed");
    assert.equal(result.url, "https://example.invalid/result.wav");
    assert.equal(received.filter((request) => !request.url.startsWith("/v1/task/")).length, submissions,
      "query recovery must not create a replacement task");
    assert.equal(child.exitCode, null);
  });
  await t.test("a stalled task query has a deadline and keeps its task ID recoverable", async () => {
    pollMode = "hang";
    const before = received.length;
    const started = Date.now();
    const response = await fetch(`http://127.0.0.1:${servicePort}/v1/task/local-task`, {
      headers: { authorization: "Bearer sk-local-client-only" }, signal: AbortSignal.timeout(3000),
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error.code, "task_query_unavailable");
    assert.equal(body.error.task_id, "local-task");
    assert.equal(response.headers.get("retry-after"), "3");
    assert.ok(Date.now() - started < 2500, "the gateway must bound a query that receives no response");
    assert.equal(received.length - before, 1, "the gateway must not retry a timed-out query internally");
    assert.equal(child.exitCode, null);
  });
  await t.test("an interrupted upload keeps the gateway alive and never submits a task", async () => {
    const authObserved = new Promise((resolve) => { authProbeObserved = resolve; });
    const before = received.length;
    const request = http.request(`http://127.0.0.1:${servicePort}/v1/async/documents/parse`, {
      method: "POST",
      headers: { authorization: "Bearer sk-local-client-only", "content-type": "application/octet-stream", "content-length": 1048576 },
    });
    request.on("error", () => {});
    request.setTimeout(3000, () => request.destroy(new Error("Local partial upload timed out")));
    request.write(Buffer.alloc(1024));
    await authObserved;
    authProbeObserved = undefined;
    const healthUrl = `http://127.0.0.1:${servicePort}/healthz`;
    assert.equal((await fetch(healthUrl, { signal: AbortSignal.timeout(3000) })).status, 200);
    const closed = new Promise((resolve) => request.once("close", resolve));
    request.destroy();
    await closed;
    const health = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) }).catch((error) => {
      throw new Error(`Gateway failed after interrupted upload: ${output}`, { cause: error });
    });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    assert.equal(child.exitCode, null, "a client abandoning an upload must not terminate the gateway");
    assert.equal(received.length, before, "an incomplete upload must never be forwarded");
  });
});
