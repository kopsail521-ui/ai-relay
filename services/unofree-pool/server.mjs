/**
 * Keyo 模型接力池（multi-pool，每池可多上游）
 *
 * 一个进程服务多个虚拟模型（别名）。每个别名是一组"模型条目"，每条目带自己的上游
 * 与密钥：某模型失败 / 超时 / 流断在半路 → 自动切下一个条目（可跨上游平台），
 * 把已写内容带上让它"接着写"，下游看到一条完整回复。对外是标准 OpenAI 兼容 API。
 *
 * 典型：keyo-flash:free 跨 UnoRouter + intern-ai + sensenova 三家免费/低价模型接力。
 *
 * Pool 配置（.env，按 POOL_1 / POOL_2 / ... 递增，缺失 ALIAS 即停止）：
 *   POOL_${i}_ALIAS=keyo-flash:free
 *   POOL_${i}_UPSTREAMS=uno,intern,sensenova            # 多上游（逗号分隔）
 *   POOL_${i}_BASE_URL_UNO=https://api.unorouter.com/v1
 *   POOL_${i}_API_KEYS_UNO=sk-xxx,sk-yyy               # 该上游密钥（多 key 叠加）
 *   POOL_${i}_MODELS_UNO=a:free,b:free,...              # 该上游模型（即接力优先级）
 *   POOL_${i}_BASE_URL_INTERN=...
 *   POOL_${i}_API_KEYS_INTERN=...
 *   POOL_${i}_MODELS_INTERN=...
 *   ...（每个上游名大写后拼环境变量）
 *
 * 单上游简写（向后兼容）：
 *   POOL_${i}_ALIAS=... POOL_${i}_BASE_URL=... POOL_${i}_API_KEYS=... POOL_${i}_MODELS=...
 * 旧版：UNO_API_KEYS + POOL_MODELS + POOL_ALIAS 合成单池（读 catalog.json 兜底模型列表）。
 *
 * 下游鉴权（全局）：POOL_API_KEYS=fan-key-1（空=不鉴权）
 * 超时/冷却（全局）：MAX_ATTEMPTS FIRST_TOKEN_TIMEOUT_MS IDLE_TIMEOUT_MS
 *   ATTEMPT_TOTAL_TIMEOUT_MS MODEL_COOLDOWN_MS ERR_COOLDOWN_MS BAD_MODEL_COOLDOWN_MS
 *   KEY_DEAD_MS MAX_CONTINUATION_CHARS
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  for (const p of [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, ".env"), "/opt/ai-relay/.env"]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}
loadEnvFile();

function splitList(s) { return String(s).split(",").map((x) => x.trim()).filter(Boolean); }
function normalizeOrigin(u) { return String(u || "https://api.unorouter.com/v1").replace(/\/v1\/?$/, "").replace(/\/$/, ""); }

const PORT = Number(process.env.PORT || 3020);
const HOST = process.env.LISTEN_HOST || "127.0.0.1";
const POOL_KEYS = splitList(process.env.POOL_API_KEYS || "");
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 6);
const FIRST_TOKEN_TIMEOUT_MS = Number(process.env.FIRST_TOKEN_TIMEOUT_MS || 30000);
const IDLE_TIMEOUT_MS = Number(process.env.IDLE_TIMEOUT_MS || 25000);
const ATTEMPT_TOTAL_TIMEOUT_MS = Number(process.env.ATTEMPT_TOTAL_TIMEOUT_MS || 180000);
const MODEL_COOLDOWN_MS = Number(process.env.MODEL_COOLDOWN_MS || 60000);
const ERR_COOLDOWN_MS = Number(process.env.ERR_COOLDOWN_MS || 15000);
const BAD_MODEL_COOLDOWN_MS = Number(process.env.BAD_MODEL_COOLDOWN_MS || 300000);
const KEY_DEAD_MS = Number(process.env.KEY_DEAD_MS || 600000);
const MAX_CONT_CHARS = Number(process.env.MAX_CONTINUATION_CHARS || 32000);
const MIN_OUTPUT_CHARS = Number(process.env.MIN_OUTPUT_CHARS || 50);
const INCOMPLETE_KEYWORDS = (process.env.INCOMPLETE_KEYWORDS || "").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);

const CONT_ZH = "刚才的回答在输出中途断开了。下面 assistant 消息是已生成的内容。请从中断处继续写：只输出续写内容本身，不要重复已写内容，不要任何开场白或确认语。";
const CONT_EN = "The previous answer was cut off mid-output. The assistant message below is what was already generated. Continue exactly from where it stopped: output only the continuation itself, no repetition, no preamble.";

// 模型条目：一个具体模型 + 它的上游 origin + 可用密钥 keys
class Entry {
  constructor({ id, origin, keys, upstream }) { this.id = id; this.origin = origin; this.keys = keys; this.upstream = upstream; }
}

class Pool {
  constructor({ idx, alias, entries }) {
    this.idx = idx; this.alias = alias; this.entries = entries;
    this.cooldowns = new Map(); this.rr = 0;
    this.stats = { started: 0, ok: 0, failed: 0, failovers: 0, continuations: 0, charsOut: 0 };
  }
  cdSet(tag, ms) { this.cooldowns.set(tag, Date.now() + ms); }
  cdRemain(tag) { const t = this.cooldowns.get(tag); return t ? Math.max(0, t - Date.now()) : 0; }
}

function loadPools() {
  const pools = [];
  for (let i = 1; ; i++) {
    const alias = (process.env[`POOL_${i}_ALIAS`] || "").trim();
    if (!alias) break;
    const entries = [];
    const ups = splitList(process.env[`POOL_${i}_UPSTREAMS`] || "");
    if (ups.length) {
      for (const u of ups) {
        const U = u.toUpperCase();
        const origin = normalizeOrigin(process.env[`POOL_${i}_BASE_URL_${U}`]);
        const keys = splitList(process.env[`POOL_${i}_API_KEYS_${U}`]);
        const models = splitList(process.env[`POOL_${i}_MODELS_${U}`]);
        if (!keys.length || !models.length) { console.warn(`[keyo-pool] ⚠ POOL_${i} upstream ${u} 缺 API_KEYS 或 MODELS，跳过该上游`); continue; }
        for (const m of models) entries.push(new Entry({ id: m, origin, keys, upstream: u }));
      }
    } else {
      // 单上游简写
      const origin = normalizeOrigin(process.env[`POOL_${i}_BASE_URL`] || "https://api.unorouter.com/v1");
      const keys = splitList(process.env[`POOL_${i}_API_KEYS`]);
      let models = splitList(process.env[`POOL_${i}_MODELS`]);
      if (!models.length && i === 1) {
        try { const cat = JSON.parse(fs.readFileSync(path.join(__dirname, "catalog.json"), "utf8")); models = (cat.models || []).map((m) => m.id); } catch {}
      }
      if (keys.length && models.length) for (const m of models) entries.push(new Entry({ id: m, origin, keys, upstream: "default" }));
    }
    if (!entries.length) { console.warn(`[keyo-pool] ⚠ POOL_${i} (${alias}) 无可用条目，跳过`); continue; }
    pools.push(new Pool({ idx: i, alias, entries }));
  }
  // 旧版兼容
  if (pools.length === 0) {
    const keys = splitList(process.env.UNO_API_KEYS || process.env.UNO_API_KEY || "");
    if (keys.length) {
      let models = splitList(process.env.POOL_MODELS || "");
      if (!models.length) { try { const cat = JSON.parse(fs.readFileSync(path.join(__dirname, "catalog.json"), "utf8")); models = (cat.models || []).map((m) => m.id); } catch {} }
      const origin = normalizeOrigin(process.env.UNO_BASE_URL || "https://api.unorouter.com/v1");
      const entries = models.map((m) => new Entry({ id: m, origin, keys, upstream: "default" }));
      pools.push(new Pool({ idx: 1, alias: (process.env.POOL_ALIAS || "keyo-flash:free").trim(), entries }));
    }
  }
  return pools;
}

const POOLS = loadPools();
const ALIAS_INDEX = new Map(POOLS.map((p) => [p.alias, p]));
const MODEL_INDEX = new Map();
for (const p of POOLS) for (const e of p.entries) if (!MODEL_INDEX.has(e.id)) MODEL_INDEX.set(e.id, p);

function json(res, status, body, extraHeaders = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data), "Access-Control-Allow-Origin": "*", ...extraHeaders });
  res.end(data);
}
async function readBody(req) { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); }
function extractBearer(req) { const h = req.headers.authorization || ""; const m = /^Bearer\s+(.+)$/i.exec(h); return m ? m[1].trim() : ""; }

class SseWriter {
  constructor(res) { this.res = res; this.headSent = false; this.closed = false; }
  ensureHead() { if (this.headSent) return; this.headSent = true; this.res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*" }); this.res.write(": open\n\n"); }
  send(obj) { if (this.closed) return; this.ensureHead(); this.res.write(`data: ${JSON.stringify(obj)}\n\n`); }
  finish() { if (this.closed) return; this.ensureHead(); this.res.write("data: [DONE]\n\n"); this.closed = true; this.res.end(); }
  error(o) { if (this.closed) return; this.send({ error: o }); this.finish(); }
}

const MIN_OVERLAP = 12, TRIM_BUFFER = 160, TRIM_WINDOW = 240;
function trimOverlap(tail, head) { const n = Math.min(tail.length, head.length, TRIM_WINDOW); for (let len = n; len >= MIN_OVERLAP; len--) if (tail.slice(-len) === head.slice(0, len)) return head.slice(len); return head; }
class OverlapTrimmer { constructor(t) { this.tail = t.slice(-TRIM_WINDOW); this.buf = ""; this.decided = false; } feed(s) { if (this.decided) return s; this.buf += s; if (this.buf.length >= TRIM_BUFFER) return this.flush(); return ""; } flush() { if (this.decided) return ""; this.decided = true; const out = trimOverlap(this.tail, this.buf); this.buf = ""; return out; } }

class UpstreamError extends Error { constructor(info) { super(info?.message || "upstream stream error"); this.info = info; } }

async function callUpstream({ pool, ei, ki, entry, body, clientSignal, onDelta }) {
  const key = entry.keys[ki];
  const ctrl = new AbortController();
  const onClientAbort = () => ctrl.abort(new Error("client-abort"));
  clientSignal?.addEventListener("abort", onClientAbort, { once: true });
  let firstTimer = null, idleTimer = null, totalTimer = null;
  const clearTimers = () => { if (firstTimer) clearTimeout(firstTimer); if (idleTimer) clearTimeout(idleTimer); if (totalTimer) clearTimeout(totalTimer); };
  const bumpIdle = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(() => ctrl.abort(new Error("idle-timeout")), IDLE_TIMEOUT_MS); };
  try {
    const res = await fetch(`${entry.origin}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: ctrl.signal });
    if (res.status !== 200) {
      const text = await res.text().catch(() => "");
      const ra = Number(res.headers.get("retry-after"));
      return { kind: "http", status: res.status, body: text, retryAfterSec: Number.isFinite(ra) && ra > 0 ? ra : 0, ei, ki, model: entry.id };
    }
    firstTimer = setTimeout(() => ctrl.abort(new Error("first-token-timeout")), FIRST_TOKEN_TIMEOUT_MS);
    totalTimer = setTimeout(() => ctrl.abort(new Error("attempt-total-timeout")), ATTEMPT_TOTAL_TIMEOUT_MS);
    bumpIdle();
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", firstSeen = false, finishReason = null, usage = null, gotDone = false;
    const handleLine = (rawLine) => {
      const line = rawLine.replace(/\r$/, "");
      if (!line || line.startsWith(":")) return;
      if (!line.startsWith("data:")) return;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") { gotDone = true; return; }
      let j; try { j = JSON.parse(payload); } catch { return; }
      if (j.error) throw new UpstreamError(j.error);
      if (!firstSeen) { firstSeen = true; if (firstTimer) clearTimeout(firstTimer); }
      bumpIdle();
      if (j.usage) usage = j.usage;
      const ch = j.choices?.[0];
      if (!ch) return;
      if (ch.finish_reason) finishReason = ch.finish_reason;
      const d = ch.delta || {};
      if (d.content) onDelta(String(d.content), false);
      // 兼容 sensenova 等用 reasoning / reasoning_content 的模型
      if (d.reasoning_content) onDelta(String(d.reasoning_content), true);
      else if (d.reasoning) onDelta(String(d.reasoning), true);
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); handleLine(line); }
    }
    if (gotDone || finishReason) return { kind: "ok", finishReason, usage, ei, ki, model: entry.id };
    return { kind: "truncated", ei, ki, model: entry.id };
  } catch (e) {
    if (e instanceof UpstreamError) return { kind: "upstream", status: 502, body: JSON.stringify({ error: e.info }), ei, ki, model: entry.id };
    if (clientSignal?.aborted) return { kind: "aborted" };
    const why = ctrl.signal.aborted ? String(ctrl.signal.reason?.message || "") : "";
    if (["first-token-timeout", "idle-timeout", "attempt-total-timeout"].includes(why)) return { kind: "timeout", why, ei, ki, model: entry.id };
    return { kind: "neterr", message: String(e?.message || e), ei, ki, model: entry.id };
  } finally {
    clearTimers();
    clientSignal?.removeEventListener("abort", onClientAbort);
    try { if (!ctrl.signal.aborted) ctrl.abort(); } catch {}
  }
}

function applyCooldown(pool, r) {
  const { kind, status, retryAfterSec, ei, ki, model } = r;
  if (kind === "http") {
    if (status === 401 || status === 403) { pool.cdSet(`k:${ei}|${ki}`, KEY_DEAD_MS); return; }
    if (status === 429) { pool.cdSet(`m:${ei}|${ki}|${model}`, Math.max(retryAfterSec * 1000 || 0, MODEL_COOLDOWN_MS)); return; }
    if (status >= 500 || status === 408 || status === 409) { pool.cdSet(`a|${ei}`, ERR_COOLDOWN_MS); return; }
    pool.cdSet(`a|${ei}`, BAD_MODEL_COOLDOWN_MS); return;
  }
  if (kind === "timeout" || kind === "neterr" || kind === "truncated" || kind === "upstream") pool.cdSet(`a|${ei}`, ERR_COOLDOWN_MS);
}

function pickCandidates(pool) {
  const out = [], n = pool.entries.length;
  for (let off = 0; off < n; off++) {
    const ei = (pool.rr + off) % n;
    const e = pool.entries[ei];
    if (pool.cdRemain(`a|${ei}`) > 0) continue;
    for (let k = 0; k < e.keys.length; k++) {
      const ki = (pool.rr + k) % e.keys.length;
      if (pool.cdRemain(`k:${ei}|${ki}`) > 0) continue;
      if (pool.cdRemain(`m:${ei}|${ki}|${e.id}`) > 0) continue;
      out.push({ ei, ki, entry: e, model: e.id });
      break;
    }
    if (out.length >= MAX_ATTEMPTS) break;
  }
  if (n > 0) pool.rr = (pool.rr + 1) % n;
  return out.slice(0, MAX_ATTEMPTS);
}

function textOf(m) { const c = m?.content; if (typeof c === "string") return c; if (Array.isArray(c)) return c.map((p) => p?.text || "").join(""); return ""; }
function buildContinuation(base, partial) {
  const clipped = partial.length > MAX_CONT_CHARS ? "[...前面内容过长已省略...]\n" + partial.slice(-MAX_CONT_CHARS) : partial;
  const zh = base.some((m) => /[\u4e00-\u9fff]/.test(textOf(m)));
  return [...base, { role: "assistant", content: clipped }, { role: "user", content: zh ? CONT_ZH : CONT_EN }];
}
function sumUsage(a, b) { if (!b) return a || null; if (!a) return b; return { prompt_tokens: (a.prompt_tokens || 0) + (b.prompt_tokens || 0), completion_tokens: (a.completion_tokens || 0) + (b.completion_tokens || 0), total_tokens: (a.total_tokens || 0) + (b.total_tokens || 0) }; }
function describeFailure(r) { if (!r) return "未知"; if (r.kind === "http") return `HTTP ${r.status} ${String(r.body).slice(0, 200)}`; if (r.kind === "timeout") return `超时(${r.why})`; if (r.kind === "neterr") return `网络错误: ${r.message}`; if (r.kind === "truncated") return "输出中途断流"; if (r.kind === "upstream") return `上游错误: ${String(r.body).slice(0, 200)}`; return r.kind; }

// 判断"stop 但内容不完整"是否应触发续写接力
function isIncomplete(partial, askedModel) {
  if (partial.length >= MIN_OUTPUT_CHARS) return false;
  const p = partial.trimEnd();
  if (INCOMPLETE_KEYWORDS.length && INCOMPLETE_KEYWORDS.some(k => p.toLowerCase().includes(k))) return false;
  if (!p) return true;
  // 明显的拒绝/免责前缀，属于"能答但不愿答"
  if (/^(i can(?:no|')?t|i am not able|i don't have|as an ai|i cannot|对不起|抱歉|我无法|我不能|作为)/i.test(p)) return true;
  return true;
}

function makeClientAbort(res) { const ctrl = new AbortController(); res.on("close", () => { if (!res.writableEnded) ctrl.abort(); }); return ctrl; }

async function handleChat(req, res, body) {
  const askedModel = String(body.model || "");
  if (!Array.isArray(body.messages) || body.messages.length === 0) return json(res, 400, { error: { message: "messages is required", type: "invalid_request_error" } });
  const pool = ALIAS_INDEX.get(askedModel);
  if (pool) return handlePool(req, res, body, pool);
  const directPool = MODEL_INDEX.get(askedModel);
  if (directPool) return handleDirect(req, res, body, directPool, askedModel);
  return json(res, 404, { error: { message: `model '${askedModel}' not found`, type: "invalid_request_error" } });
}

async function handlePool(req, res, body, pool) {
  pool.stats.started++;
  const askedModel = pool.alias;
  const wantStream = body.stream !== false;
  const clientIncludeUsage = !!body.stream_options?.include_usage;
  const id = `chatcmpl-keyo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const created = Math.floor(Date.now() / 1000);
  const clientAbort = makeClientAbort(res);
  const sse = wantStream ? new SseWriter(res) : null;
  let roleSent = false, agg = "";
  const emit = (text, isReasoning) => {
    if (!text || clientAbort.signal.aborted) return;
    if (!wantStream) { if (!isReasoning) agg += text; return; }
    if (!roleSent) { sse.send({ id, object: "chat.completion.chunk", created, model: askedModel, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] }); roleSent = true; }
    sse.send({ id, object: "chat.completion.chunk", created, model: askedModel, choices: [{ index: 0, delta: isReasoning ? { reasoning_content: text } : { content: text }, finish_reason: null }] });
  };

  const baseMessages = body.messages;
  const cands = pickCandidates(pool);
  if (cands.length === 0) {
    pool.stats.failed++;
    const wait = Math.max(...pool.entries.map((e, ei) => Math.max(pool.cdRemain(`a|${ei}`), ...e.keys.map((_, ki) => Math.max(pool.cdRemain(`m:${ei}|${ki}|${e.id}`), pool.cdRemain(`k:${ei}|${ki}`))))), 0);
    return json(res, 429, { error: { message: `池 ${askedModel} 暂时全部限流/冷却，请稍后重试`, type: "rate_limit_error" } }, wait > 0 ? { "Retry-After": String(Math.ceil(wait / 1000)) } : {});
  }

  const fwd = { ...body }; delete fwd.model; delete fwd.messages; delete fwd.stream; delete fwd.stream_options; delete fwd.n;
  let partial = "", msgs = baseMessages, attemptsUsed = [], lastErr = null, usageTotal = null;
  let switching = false; // 不完整→换模型从头答（不是续写）

  for (let i = 0; i < cands.length; i++) {
    const { ei, ki, entry, model } = cands[i];
    attemptsUsed.push(`${model}@${entry.upstream}`);
    // cont = 续写模式（断流续写）；switching = 不完整换模型从头答（清空 partial）
    const cont = i > 0 && partial.length > 0 && !switching;
    if (cont) { msgs = buildContinuation(baseMessages, partial); pool.stats.continuations++; }
    else { msgs = baseMessages; }
    if (switching) { partial = ""; switching = false; }
    const upBody = { ...fwd, model, messages: msgs, stream: true, stream_options: { include_usage: true } };
    const trim = cont ? new OverlapTrimmer(partial) : null;
    const r = await callUpstream({
      pool, ei, ki, entry, body: upBody, clientSignal: clientAbort.signal,
      onDelta: (text, isReasoning) => {
        if (clientAbort.signal.aborted) return;
        if (isReasoning) { emit(text, true); return; }
        if (trim) { const out = trim.feed(text); if (out) { partial += out; emit(out, false); } }
        else { partial += text; emit(text, false); }
      },
    });
    if (r.kind === "ok") {
      if (trim) { const out = trim.flush(); if (out) { partial += out; emit(out, false); } }
      const finishReason = r.finishReason || "stop";
      usageTotal = sumUsage(usageTotal, r.usage);
      pool.stats.ok++;
      // "stop 但内容太短/不完整" → 只在首次尝试（非续写）时判断，避免续写后反复跳模型
      if (finishReason === "stop" && !cont && i < cands.length - 1 && isIncomplete(partial, askedModel)) {
        console.log(`[${pool.alias}] incomplete ${id} model=${model}@${entry.upstream} chars=${partial.length} → switching model`);
        lastErr = { kind: "incomplete", model };
        switching = true;
        continue; // 不计 failover（不是失败），换下一个模型从头答
      }
      pool.stats.charsOut += partial.length;
      console.log(`[${pool.alias}] ok ${id} models=${attemptsUsed.join("→")} cont=${cont ? 1 : 0} chars=${partial.length}`);
      if (wantStream) {
        sse.send({ id, object: "chat.completion.chunk", created, model: askedModel, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] });
        if (clientIncludeUsage && usageTotal) sse.send({ id, object: "chat.completion.chunk", created, model: askedModel, choices: [], usage: usageTotal });
        sse.finish();
      } else {
        json(res, 200, { id, object: "chat.completion", created, model: askedModel, choices: [{ index: 0, message: { role: "assistant", content: agg || partial }, finish_reason: finishReason }], ...(usageTotal ? { usage: usageTotal } : {}) });
      }
      return;
    }
    if (r.kind === "aborted") return;
    applyCooldown(pool, r);
    lastErr = r; pool.stats.failovers++;
    if (trim) { const out = trim.flush(); if (out) { partial += out; emit(out, false); } }
  }

  pool.stats.failed++;
  const all429 = lastErr?.kind === "http" && lastErr.status === 429;
  const message = `池 ${askedModel} 全部尝试失败（${attemptsUsed.join("→")}）：${describeFailure(lastErr)}`;
  console.error(`[${pool.alias}] fail ${id} models=${attemptsUsed.join("→")} err=${describeFailure(lastErr)}`);
  if (sse && sse.headSent) { sse.error({ message, type: all429 ? "rate_limit_error" : "server_error" }); return; }
  json(res, all429 ? 429 : 502, { error: { message, type: all429 ? "rate_limit_error" : "server_error" } }, all429 ? { "Retry-After": "60" } : {});
}

async function handleDirect(req, res, body, pool, askedModel) {
  pool.stats.started++;
  const wantStream = body.stream !== false;
  const clientIncludeUsage = !!body.stream_options?.include_usage;
  const id = `chatcmpl-keyo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const created = Math.floor(Date.now() / 1000);
  const clientAbort = makeClientAbort(res);
  const sse = wantStream ? new SseWriter(res) : null;
  let roleSent = false, agg = "", finishReason = null, usage = null;
  const emit = (text, isReasoning) => {
    if (!text || clientAbort.signal.aborted) return;
    if (!wantStream) { if (!isReasoning) agg += text; return; }
    if (!roleSent) { sse.send({ id, object: "chat.completion.chunk", created, model: askedModel, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] }); roleSent = true; }
    sse.send({ id, object: "chat.completion.chunk", created, model: askedModel, choices: [{ index: 0, delta: isReasoning ? { reasoning_content: text } : { content: text }, finish_reason: null }] });
  };

  const ei = pool.entries.findIndex((e) => e.id === askedModel);
  if (ei < 0) { pool.stats.failed++; return json(res, 404, { error: { message: `model '${askedModel}' not in pool`, type: "invalid_request_error" } }); }
  const entry = pool.entries[ei];
  let ki = -1;
  for (let k = 0; k < entry.keys.length; k++) { if (pool.cdRemain(`k:${ei}|${k}`) <= 0) { ki = k; break; } }
  if (ki < 0) { pool.stats.failed++; return json(res, 429, { error: { message: "上游密钥全部冷却中", type: "rate_limit_error" } }, { "Retry-After": "60" }); }

  const fwd = { ...body }; delete fwd.stream; delete fwd.stream_options;
  const upBody = { ...fwd, stream: true, stream_options: { include_usage: true } };
  const r = await callUpstream({ pool, ei, ki, entry, body: upBody, clientSignal: clientAbort.signal, onDelta: (text, isReasoning) => emit(text, isReasoning) });
  if (r.kind === "ok") {
    finishReason = r.finishReason || "stop"; usage = r.usage; pool.stats.ok++; pool.stats.charsOut += agg.length;
    if (wantStream) {
      sse.send({ id, object: "chat.completion.chunk", created, model: askedModel, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] });
      if (clientIncludeUsage && usage) sse.send({ id, object: "chat.completion.chunk", created, model: askedModel, choices: [], usage });
      sse.finish();
    } else {
      json(res, 200, { id, object: "chat.completion", created, model: askedModel, choices: [{ index: 0, message: { role: "assistant", content: agg }, finish_reason: finishReason }], ...(usage ? { usage } : {}) });
    }
    return;
  }
  if (r.kind === "aborted") return;
  pool.stats.failed++;
  if (r.kind === "http") { let parsed = null; try { parsed = JSON.parse(r.body); } catch {} return json(res, r.status, parsed || { error: { message: String(r.body).slice(0, 500) || `HTTP ${r.status}`, type: "upstream_error" } }); }
  json(res, 502, { error: { message: describeFailure(r), type: "server_error" } });
}

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" }); return res.end(); }

  if (urlPath === "/health") {
    return json(res, 200, { ok: true, pools: POOLS.map((p) => ({ alias: p.alias, idx: p.idx, entries: p.entries.map((e, ei) => ({ id: e.id, upstream: e.upstream, origin: e.origin, keys: e.keys.length, globalCooldownMs: p.cdRemain(`a|${ei}`), perKeyCooldownMs: e.keys.map((_, ki) => p.cdRemain(`m:${ei}|${ki}|${e.id}`)) })), stats: p.stats })) });
  }

  if (urlPath === "/v1/models") {
    if (POOL_KEYS.length && !POOL_KEYS.includes(extractBearer(req))) return json(res, 401, { error: { message: "Invalid API key", type: "invalid_request_error" } });
    const now = Math.floor(Date.now() / 1000);
    const ids = [];
    for (const p of POOLS) { if (!ids.includes(p.alias)) ids.push(p.alias); for (const e of p.entries) if (!ids.includes(e.id)) ids.push(e.id); }
    return json(res, 200, { object: "list", data: ids.map((id) => ({ id, object: "model", created: now, owned_by: "keyo-pool" })) });
  }

  if (urlPath === "/v1/chat/completions" && req.method === "POST") {
    const token = extractBearer(req);
    if (POOL_KEYS.length && !POOL_KEYS.includes(token)) return json(res, 401, { error: { message: "Invalid API key", type: "invalid_request_error" } });
    let body; try { body = JSON.parse((await readBody(req)).toString("utf8")); } catch { return json(res, 400, { error: { message: "invalid JSON body", type: "invalid_request_error" } }); }
    try { return await handleChat(req, res, body); }
    catch (e) { console.error("[keyo-pool] unhandled:", e); if (!res.headersSent) return json(res, 500, { error: { message: String(e?.message || e), type: "server_error" } }); try { res.end(); } catch {} }
  }

  json(res, 404, { error: { message: `not found: ${req.method} ${urlPath}`, type: "invalid_request_error" } });
});

export { trimOverlap, buildContinuation, OverlapTrimmer };

const isMain = (() => { try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (isMain) {
  server.listen(PORT, HOST, () => {
    console.log(`[keyo-pool] listening on http://${HOST}:${PORT}`);
    for (const p of POOLS) {
      const byUp = {};
      for (const e of p.entries) byUp[e.upstream] = (byUp[e.upstream] || []).concat(e.id);
      console.log(`[keyo-pool] pool #${p.idx} ${p.alias} | ${p.entries.length} entries`);
      for (const [u, ms] of Object.entries(byUp)) console.log(`           ${u}: ${ms.join(", ")}`);
    }
    console.log(`[keyo-pool] downstream auth: ${POOL_KEYS.length ? "on" : "OFF (open mode)"}`);
    if (!POOLS.length) console.warn(`[keyo-pool] ⚠ 未配置任何池（POOL_1_ALIAS / UNO_API_KEYS）`);
  });
}
