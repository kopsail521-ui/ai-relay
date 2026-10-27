import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RULES } from "./fix-marketplace-meta.mjs";

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
const close = async (server) => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
};

test(
  "async speech normalizes model-specific input before billing and forwards exactly once",
  { timeout: 20000 },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keyo-gitee-http-"));
    // The temporary copy keeps production routing/helpers intact while preventing
    // the service from discovering a developer or VPS .env during this test.
    const source = fs.readFileSync(path.join(serviceDir, "server.mjs"), "utf8");
    fs.writeFileSync(
      path.join(dir, "server.mjs"),
      source.replace("loadEnvFile();", "// no environment files in offline tests"),
    );
    for (const file of ["decisions.mjs", "fix-marketplace-meta.mjs", "catalog.json"]) {
      fs.copyFileSync(path.join(serviceDir, file), path.join(dir, file));
    }
    const dbPath = path.join(dir, "wallet.db");
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, quota INTEGER, gift_quota INTEGER, used_quota INTEGER, request_count INTEGER);
    CREATE TABLE tokens (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, key TEXT, status INTEGER, remain_quota INTEGER, unlimited_quota INTEGER, used_quota INTEGER, deleted_at INTEGER);
    CREATE TABLE channels (id INTEGER PRIMARY KEY, name TEXT, base_url TEXT);
    CREATE TABLE logs (id INTEGER PRIMARY KEY, user_id INTEGER, created_at INTEGER, type INTEGER, content TEXT, username TEXT, token_name TEXT, model_name TEXT, quota INTEGER, prompt_tokens INTEGER, completion_tokens INTEGER, use_time INTEGER, is_stream INTEGER, channel_id INTEGER, token_id INTEGER, "group" TEXT, ip TEXT, request_id TEXT, upstream_request_id TEXT, other TEXT);
    INSERT INTO users VALUES (1, 20000000, 20000000, 0, 0);
    INSERT INTO tokens VALUES (1, 1, 'local', 'local-client-only', 1, 20000000, 0, 0, NULL);
    INSERT INTO channels VALUES (1, 'Keyo Media fixture', 'http://127.0.0.1');`);
    const wallet = () => ({
      user: db.prepare("SELECT * FROM users WHERE id=1").get(),
      token: db.prepare("SELECT * FROM tokens WHERE id=1").get(),
      logs: db.prepare("SELECT count(*) AS total FROM logs").get().total,
    });
    const guard = path.join(dir, "local-fetch-only.mjs");
    fs.writeFileSync(
      guard,
      `const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('Offline test forbids external fetch');
  return original(input, init);
};`,
    );
    const received = [];
    const upstream = http.createServer(async (req, res) => {
      const body = await readBody(req);
      received.push({ url: req.url, headers: req.headers, body });
      if (req.url.startsWith("/v1/task/")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            task_id: "local-task",
            status: "success",
            output: { file_url: "https://example.invalid/result.wav" },
          }),
        );
        return;
      }
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ task_id: "local-task", status: "waiting" }));
    });
    const auth = http.createServer((_req, res) => {
      res.writeHead(403);
      res.end();
    });
    const upPort = await listen(upstream),
      authPort = await listen(auth);
    const probe = http.createServer(),
      servicePort = await listen(probe);
    await close(probe);
    const child = spawn(
      process.execPath,
      ["--import", pathToFileURL(guard).href, path.join(dir, "server.mjs")],
      {
        cwd: dir,
        env: {
          ...process.env,
          PORT: String(servicePort),
          LISTEN_HOST: "127.0.0.1",
          GITEE_API_KEY: "local-upstream-only",
          GITEE_BASE_URL: `http://127.0.0.1:${upPort}`,
          NEW_API_BASE: `http://127.0.0.1:${authPort}`,
          NEW_API_DB: dbPath,
          CATALOG: path.join(dir, "catalog.json"),
          GITEE_TASK_QUERY_TIMEOUT_MS: "1000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
      await close(upstream);
      await close(auth);
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Service startup failed: ${output}`)), 5000);
      child.stdout.on("data", () => {
        if (output.includes("Gitee passthrough on")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Service exited (${code}): ${output}`));
      });
    });

    const submit = async (
      body,
      contentType = "application/json",
      query = "",
      route = "/v1/async/audio/speech",
    ) => {
      const response = await fetch(`http://127.0.0.1:${servicePort}${route}${query}`, {
        method: "POST",
        headers: { authorization: "Bearer sk-local-client-only", "content-type": contentType },
        body: typeof body === "string" ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
      return { status: response.status, body: await response.json() };
    };
    await t.test(
      "Qwen accepts canonical arrays and only normalizes its legacy text/object aliases",
      async () => {
        const canonical = [
          {
            prompt: "first",
            language: "English",
            speaker: "Ryan",
            instruction: "calm",
            prompt_audio_url: "https://example.invalid/ref.wav",
            prompt_text: "reference",
          },
          { prompt: "second", language: "Chinese", speaker: "Vivian" },
        ];
        const cases = [
          {
            body: { model: "Qwen3-TTS", inputs: canonical, output_format: "mp3", seed: 0 },
            expected: { model: "Qwen3-TTS", inputs: canonical, output_format: "mp3", seed: 0 },
          },
          {
            body: { model: "Qwen3-TTS", input: "old text" },
            expected: { model: "Qwen3-TTS", inputs: [{ prompt: "old text", language: "Chinese" }] },
          },
          {
            body: { model: "Qwen3-TTS", inputs: "old plural" },
            expected: {
              model: "Qwen3-TTS",
              inputs: [{ prompt: "old plural", language: "Chinese" }],
            },
          },
          {
            body: {
              model: "Qwen3-TTS",
              input: { prompt: "old object", language: "English", speaker: "Ryan" },
            },
            expected: {
              model: "Qwen3-TTS",
              inputs: [{ prompt: "old object", language: "English", speaker: "Ryan" }],
            },
          },
          {
            body: { model: "Qwen3-TTS", inputs: { prompt: "plural object", instruction: "calm" } },
            expected: {
              model: "Qwen3-TTS",
              inputs: [{ prompt: "plural object", instruction: "calm", language: "Chinese" }],
            },
          },
        ];
        for (const { body, expected } of cases) {
          const before = received.length;
          const oldWallet = wallet();
          const result = await submit(body);
          assert.equal(result.status, 202, JSON.stringify(result));
          assert.equal(received.length - before, 1);
          assert.deepEqual(JSON.parse(received.at(-1).body.toString()), expected);
          assert.equal(
            wallet().user.request_count,
            oldWallet.user.request_count + 1,
            "one accepted submit is billed once",
          );
        }
      },
    );
    await t.test(
      "invalid JSON, Qwen entries, required fields and wrong model paths do not submit or bill",
      async () => {
        const invalid = [
          "{invalid",
          [],
          { model: "Qwen3-TTS", inputs: [] },
          { model: "Qwen3-TTS", inputs: Array.from({ length: 6 }, () => ({ prompt: "too many" })) },
          { model: "Qwen3-TTS", inputs: [null] },
          { model: "Qwen3-TTS", inputs: [{ prompt: " " }] },
          { model: "Qwen3-TTS", inputs: [{ prompt: 123 }] },
          { model: "Qwen3-TTS", inputs: [{ prompt: "text", language: "French" }] },
          { model: "Qwen3-TTS", inputs: 123 },
          { model: "GLM-TTS", inputs: "wrong endpoint" },
          { model: "Step-Audio-TTS-3B", inputs: "wrong endpoint" },
          { model: "keyo-tts", inputs: "not this catalog" },
          { model: "CosyVoice3", inputs: "missing reference" },
          {
            model: "CosyVoice3",
            inputs: [null],
            prompt_wav_url: "https://example.invalid/ref.wav",
            prompt_text: "reference",
          },
          {
            model: "CosyVoice3",
            inputs: "missing transcript",
            prompt_wav_url: "https://example.invalid/ref.wav",
          },
          { model: "IndexTTS-2", inputs: "missing reference" },
          {
            model: "IndexTTS-2",
            inputs: [{}],
            prompt_audio_url: "https://example.invalid/ref.wav",
          },
        ];
        for (const body of invalid) {
          const before = received.length;
          const oldWallet = wallet();
          const result = await submit(body);
          assert.equal(result.status, 400, JSON.stringify({ body, result }));
          assert.equal(received.length, before, "invalid request must not reach provider");
          assert.deepEqual(
            wallet(),
            oldWallet,
            "invalid request must not precharge, refund, or write usage",
          );
        }
      },
    );
    await t.test(
      "query-only model names cannot bypass speech validation or billing guards",
      async () => {
        for (const model of ["Qwen3-TTS", "CosyVoice3", "IndexTTS-2"]) {
          const before = received.length;
          const oldWallet = wallet();
          const result = await submit(
            { inputs: Array.from({ length: 6 }, () => ({ prompt: "invalid query-only model" })) },
            "application/json",
            `?model=${encodeURIComponent(model)}`,
          );
          assert.equal(result.status, 400, JSON.stringify(result));
          assert.match(result.body.error.message, /model in the JSON body/);
          assert.equal(received.length, before);
          assert.deepEqual(wallet(), oldWallet);
        }
      },
    );
    await t.test("speech path aliases cannot bypass validation or billing guards", async () => {
      for (const route of [
        "/v1/async/audio/speech/",
        "/v1/async/audio/speech/extra",
        "/v1/async/audio/%73peech",
        "/v1/async//audio/speech",
      ]) {
        const before = received.length;
        const oldWallet = wallet();
        const result = await submit(
          {
            model: "Qwen3-TTS",
            inputs: Array.from({ length: 6 }, () => ({ prompt: "must not submit" })),
          },
          "application/json",
          "",
          route,
        );
        assert.equal(result.status, 400, JSON.stringify({ route, result }));
        assert.equal(result.body.error.code, "invalid_async_speech_path");
        assert.equal(received.length, before);
        assert.deepEqual(wallet(), oldWallet);
      }
    });
    await t.test(
      "other async TTS keeps string inputs and reference/emotion parameters unchanged",
      async () => {
        const examples = [
          {
            model: "CosyVoice3",
            inputs: "hello",
            prompt_wav_url: "https://example.invalid/ref.wav",
            prompt_text: "reference",
            instruct_text: "calm",
            seed: "42",
            speed: 1,
          },
          {
            model: "IndexTTS-2",
            inputs: "hello",
            prompt_audio_url: "https://example.invalid/ref.wav",
            emo_text: "calm",
            use_emo_text: false,
            emo_alpha: 0,
          },
          { model: "Spark-TTS-0.5B", inputs: "hello", gender: "male", pitch: 3, speed: 3 },
          { model: "Spark-TTS-0.5B:free", inputs: "hello", gender: "female" },
        ];
        for (const body of examples) {
          const before = received.length;
          const result = await submit(body);
          assert.equal(result.status, 202, JSON.stringify(result));
          assert.equal(received.length - before, 1);
          assert.deepEqual(JSON.parse(received.at(-1).body.toString()), {
            ...body,
            model: body.model.replace(":free", ""),
          });
        }
      },
    );
    await t.test("task GET still needs no model or request body and never charges", async () => {
      const oldWallet = wallet();
      const before = received.length;
      const response = await fetch(`http://127.0.0.1:${servicePort}/v1/task/local-task`, {
        headers: { authorization: "Bearer sk-local-client-only" },
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, "completed");
      assert.equal(received.length - before, 1);
      assert.deepEqual(wallet(), oldWallet);
    });
  },
);

test("copyable speech contracts preserve model-specific required fields and both mirrors agree", () => {
  const root = path.resolve(serviceDir, "../..");
  const backend = JSON.parse(
    fs.readFileSync(
      path.join(root, "services/creem-moderation-proxy/model-contracts.json"),
      "utf8",
    ),
  );
  const frontend = JSON.parse(
    fs.readFileSync(
      path.join(root, "new-api/web/src/features/pricing/lib/model-contracts.json"),
      "utf8",
    ),
  );
  assert.deepEqual(frontend, backend);
  assert.deepEqual(backend["Qwen3-TTS"].requests[0].body.inputs, [
    { prompt: "Hello, welcome to KeyoAPI", language: "English", speaker: "Vivian" },
  ]);
  assert.ok(backend.CosyVoice3.requests[0].body.prompt_wav_url);
  assert.ok(backend.CosyVoice3.requests[0].body.prompt_text);
  for (const id of ["CosyVoice3", "GLM-TTS", "Step-Audio-TTS-3B", "IndexTTS-2"]) {
    for (const request of backend[id].requests) {
      assert.match(request.noteKey, /replace/i);
      assert.match(request.noteKey, /reference/i);
    }
  }
  for (const id of ["Spark-TTS-0.5B", "Spark-TTS-0.5B:free"]) {
    assert.equal(backend[id].requests[0].body.gender, "male");
  }
  assert.equal(backend["IndexTTS-2"].requests[1].path, "/v1/async/audio/speech");
  assert.equal(backend["IndexTTS-2"].requests[1].pollPath, "/v1/task/{id}");
  assert.deepEqual(backend["keyo-tts"].requests, []);
  assert.equal(
    backend["gemini-3.8-flash-tts"].requests[0].path,
    "/v1beta/models/gemini-3.8-flash-tts:generateContent",
  );
  for (const model of ["Qwen3-TTS", "CosyVoice3"]) {
    assert.equal(JSON.parse(RULES[model].endpoints).openai.path, "/v1/async/audio/speech");
  }
});
