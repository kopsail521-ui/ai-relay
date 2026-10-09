/**
 * unofree-pool 自测：不起真实上游，用本地 mock 验证
 *   1) 429 → 自动切下一个模型
 *   2) 流中途断开 → 下一个模型带着已写内容续写（中文/重叠裁剪）
 *   3) 流式 / 非流式两种下游
 *   4) 直连模式、鉴权、全限路 429、/health、/v1/models
 * 运行：node selftest.mjs   （退出码 0 = 全部通过）
 */
import http from "http";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { trimOverlap, OverlapTrimmer, buildContinuation } from "./server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_PORT = 3999;
const POOL_PORT = 3998;
const POOL2_PORT = 3997;
const BASE = `http://127.0.0.1:${POOL_PORT}`;
const KEY = "fan-key-1";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.error(`  ❌ ${name} ${detail}`);
  }
}

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}
function chunk(model, delta, finish = null) {
  return { id: "x", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }] };
}

// ---------------------------------------------------------------------------
// mock 上游
const mock = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let j = {};
    try { j = JSON.parse(body); } catch {}
    const model = j.model || "";
    if (model === "bad-429:free") {
      res.writeHead(429, { "Retry-After": "60", "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "rate limited" } }));
      return;
    }
    if (model === "neterr:free") {
      res.destroy();
      return;
    }
    if (model !== "half:free" && model !== "good:free" && model !== "direct-ok:free") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: `unknown model ${model}` } }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    if (model === "half:free") {
      // 写两个字然后连接直接断掉（无 DONE、无 finish_reason）
      sse(res, chunk(model, { role: "assistant" }));
      sse(res, chunk(model, { content: "你好，" }));
      setTimeout(() => res.destroy(), 50);
      return;
    }
    if (model === "good:free" || model === "direct-ok:free") {
      // 如果是续写请求，最后一条 user 消息里会有续写指令
      const msgs = j.messages || [];
      const isCont = msgs.length > 0 && msgs[msgs.length - 1].role === "user" && /继续|断开|Continue/.test(String(msgs[msgs.length - 1].content));
      const text = isCont ? "世界！这是续写。" : "这是完整的回答。";
      sse(res, chunk(model, { role: "assistant" }));
      for (const piece of [text.slice(0, 5), text.slice(5)]) {
        sse(res, chunk(model, { content: piece }));
      }
      sse(res, chunk(model, {}, "stop"));
      sse(res, { id: "x", object: "chat.completion.chunk", created: 1, model, choices: [], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    // 走不到这里：未知模型在上方已提前返回
    res.destroy();
  });
});

// ---------------------------------------------------------------------------
function waitListening(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(url);
        if (r.status < 500) return resolve();
      } catch {}
      if (Date.now() > deadline) return reject(new Error(`timeout waiting ${url}`));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function spawnServer(port, extraEnv) {
  // 关键：清除从 .env 泄漏进来的 POOL_* / UNO_* / CHANNEL_FREE_*，避免子进程打到真实上游
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("POOL_") || k.startsWith("UNO_") || k.startsWith("CHANNEL_FREE")) continue;
    env[k] = v;
  }
  env.PORT = String(port);
  env.LISTEN_HOST = "127.0.0.1";
  env.POOL_1_ALIAS = "keyo-flash:free";
  env.POOL_1_UPSTREAMS = ""; // 阻断 .env 泄漏的多上游配置，强制走单上游简写
  env.POOL_1_BASE_URL = `http://127.0.0.1:${MOCK_PORT}/v1`;
  env.POOL_1_API_KEYS = "sk-test-1";
  env.POOL_1_MODELS = "bad-429:free,half:free,good:free,direct-ok:free,neterr:free,not-exist:free";
  env.POOL_2_ALIAS = ""; // 停在第 1 池，避免加载真实 pro 池
  env.POOL_API_KEYS = KEY;
  env.FIRST_TOKEN_TIMEOUT_MS = "3000";
  env.IDLE_TIMEOUT_MS = "2000";
  env.ERR_COOLDOWN_MS = "1200";
  env.MODEL_COOLDOWN_MS = "60000";
  env.CATALOG = path.join(__dirname, "catalog.json");
  Object.assign(env, extraEnv || {});
  const child = spawn(process.execPath, [path.join(__dirname, "server.mjs")], { env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => process.env.SELFTEST_VERBOSE && console.log(`  [pool] ${d}`.trimEnd()));
  child.stderr.on("data", (d) => console.error(`  [pool:err] ${d}`.trimEnd()));
  return child;
}

async function chat(body, key = KEY, port = POOL_PORT) {
  return fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
}

async function readSSE(res) {
  const text = await res.text();
  const events = [];
  let content = "";
  let finish = null;
  let usage = null;
  let sawDone = false;
  let errObj = null;
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l.startsWith("data:")) continue;
    const payload = l.slice(5).trim();
    if (payload === "[DONE]") { sawDone = true; continue; }
    let j;
    try { j = JSON.parse(payload); } catch { continue; }
    events.push(j);
    if (j.error) errObj = j.error;
    if (j.usage) usage = j.usage;
    const ch = j.choices?.[0];
    if (ch?.delta?.content) content += ch.delta.content;
    if (ch?.finish_reason) finish = ch.finish_reason;
  }
  return { content, finish, usage, sawDone, errObj, events };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
async function main() {
  let pool, pool2;
  const cleanup = () => {
    try { pool?.kill(); } catch {}
    try { pool2?.kill(); } catch {}
    try { mock.close(); } catch {}
  };
  process.on("exit", cleanup);
  process.on("uncaughtException", (e) => { console.error("uncaught:", e); cleanup(); process.exit(1); });

  console.log("== 单元测试：续写工具 ==");

  const t1 = trimOverlap("最后的十二个字符是这里哦呀", "最后的十二个字符是这里哦呀然后继续写");
  check("trimOverlap 剪掉重复的 13 字重叠", t1 === "然后继续写", `got=${t1}`);

  const t2 = trimOverlap("完全不相关的结尾", "全新的开头内容");
  check("trimOverlap 无重叠时原样返回", t2 === "全新的开头内容", `got=${t2}`);

  const tr = new OverlapTrimmer("最后的十二个字符是这里哦呀");
  let out = "";
  out += tr.feed("最后的十二个字"); // 不足 160，缓存
  out += tr.feed("符是这里哦呀接着写下去");
  out += tr.flush();
  check("OverlapTrimmer 分片到达也能剪重叠", out === "接着写下去", `got=${out}`);

  const tr2 = new OverlapTrimmer("前文");
  const flushed = tr2.feed("内容很短") + tr2.flush();
  check("OverlapTrimmer 内容不足缓冲上限时 flush 全量返回", flushed === "内容很短", `got=${flushed}`);

  const cont = buildContinuation([{ role: "user", content: "写一段中文" }], "已经写了一半");
  check("buildContinuation 中文对话用中文续写指令", /继续写/.test(cont[cont.length - 1].content) && cont[1].role === "assistant" && cont[1].content === "已经写了一半");

  const contEn = buildContinuation([{ role: "user", content: "write something in english" }], "half done");
  check("buildContinuation 英文对话用英文续写指令", /Continue/.test(contEn[contEn.length - 1].content));

  console.log("== 启动 mock 上游与服务 ==");
  await new Promise((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));
  pool = spawnServer(POOL_PORT);
  pool2 = spawnServer(POOL2_PORT, { POOL_1_MODELS: "bad-429:free" });
  await waitListening(`${BASE}/health`);
  await waitListening(`http://127.0.0.1:${POOL2_PORT}/health`);
  console.log("  服务已启动");

  console.log("== 鉴权 & 元数据 ==");
  let r = await fetch(`${BASE}/v1/models`, { headers: { Authorization: `Bearer ${KEY}` } });
  let j = await r.json();
  check("/v1/models 200 且含 keyo-flash:free", r.status === 200 && j.data.some((m) => m.id === "keyo-flash:free"), JSON.stringify(j.data?.map((m) => m.id)));
  r = await fetch(`${BASE}/v1/models`, { headers: { Authorization: "Bearer wrong-key" } });
  check("错误密钥 401", r.status === 401);
  r = await chat({ model: "keyo-flash:free", messages: [{ role: "user", content: "hi" }] }, "wrong-key");
  check("聊天错误密钥 401", r.status === 401);

  console.log("== 非流式：429 → 断流续写 → 成功 ==");
  r = await chat({ model: "keyo-flash:free", stream: false, messages: [{ role: "user", content: "写一段中文" }] });
  j = await r.json();
  const content = j.choices?.[0]?.message?.content || "";
  check("接力合并出完整内容", r.status === 200 && content === "你好，世界！这是续写。", `status=${r.status} content=${JSON.stringify(content)}`);
  check("finish_reason=stop", j.choices?.[0]?.finish_reason === "stop");
  check("usage 汇总", (j.usage?.total_tokens || 0) >= 18, JSON.stringify(j.usage));

  // 等 half:free 的全局短冷却（ERR_COOLDOWN_MS=1200）过去，再测流式
  await sleep(1400);

  console.log("== 流式：断流后续写合并为一条流 ==");
  r = await chat({ model: "keyo-flash:free", stream: true, stream_options: { include_usage: true }, messages: [{ role: "user", content: "写一段中文" }] });
  const s = await readSSE(r);
  check("流式 200 且收到 [DONE]", r.status === 200 && s.sawDone);
  check("流式内容合并", s.content === "你好，世界！这是续写。", `content=${JSON.stringify(s.content)}`);
  check("流式 finish_reason=stop", s.finish === "stop");
  check("流式 include_usage 透传", !!s.usage);
  check("所有 chunk 的 model 都是对外的 keyo-flash:free", s.events.every((e) => e.model === "keyo-flash:free"));

  console.log("== 直连模式 & 错误透传 ==");
  r = await chat({ model: "direct-ok:free", stream: false, messages: [{ role: "user", content: "直接回答" }] });
  j = await r.json();
  check("直连指定模型成功", r.status === 200 && j.choices?.[0]?.message?.content === "这是完整的回答。", JSON.stringify(j).slice(0, 200));
  r = await chat({ model: "neterr:free", stream: false, messages: [{ role: "user", content: "x" }] });
  check("直连网络错误返回 502", r.status === 502);
  r = await chat({ model: "not-exist:free", stream: false, messages: [{ role: "user", content: "x" }] });
  check("未知模型透传上游 400", r.status === 400);

  console.log("== 全部候选失败 → 429 ==");
  r = await chat({ model: "keyo-flash:free", stream: false, messages: [{ role: "user", content: "x" }] }, KEY, POOL2_PORT);
  j = await r.json();
  check("单模型池 429 返回 429", r.status === 429, `status=${r.status} body=${JSON.stringify(j).slice(0, 150)}`);
  check("返回 Retry-After 头", (r.headers.get("retry-after") || "") !== "");
  r = await chat({ model: "keyo-flash:free", stream: false, messages: [{ role: "user", content: "x" }] }, KEY, POOL2_PORT);
  check("冷却中直接 429（不再打上游）", r.status === 429);

  console.log("== /health ==");
  r = await fetch(`${BASE}/health`);
  j = await r.json();
  const p0 = j.pools?.[0];
  check("health 含统计与模型冷却", j.ok === true && Array.isArray(p0?.entries) && p0.entries.length === 6 && typeof p0.stats?.failovers === "number", JSON.stringify(j).slice(0, 200));
  check("统计里有成功和接力", p0.stats.ok >= 2 && p0.stats.continuations >= 1, JSON.stringify(p0.stats));

  // 清理
  cleanup();
  await sleep(300);

  console.log(failures === 0 ? "\n全部通过 ✅" : `\n${failures} 项失败 ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("selftest crashed:", e);
  process.exit(1);
});
