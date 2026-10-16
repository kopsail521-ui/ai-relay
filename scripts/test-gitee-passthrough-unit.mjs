#!/usr/bin/env node
/**
 * Unit/integration tests for the gitee-passthrough helper functions in
 * services/gitee-passthrough/server.mjs.
 *
 * Extracts the helper functions from the module source (so it doesn't need
 * network or the VPS), then exercises:
 *   - normalizeModelId / freeTwinBase (`:free` suffix stripping)
 *   - rewriteModelField (JSON + multipart model field rewrite)
 *   - deductQuota / refundQuota / softCheckQuota (gift-first billing)
 *
 * Run from repo root:
 *   node scripts/test-gitee-passthrough-unit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const srcPath = path.join(repoRoot, "services", "gitee-passthrough", "server.mjs");
const src = fs.readFileSync(srcPath, "utf8");

function extractFn(name) {
  const marker = "function " + name + "(";
  const start = src.indexOf(marker);
  if (start < 0) throw new Error("not found: " + name);
  let i = start + marker.length;
  while (i < src.length && src[i] !== "{") i++;
  if (src[i] !== "{") throw new Error("no body: " + name);
  let depth = 0;
  let j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        j++;
        break;
      }
    }
  }
  if (depth !== 0) throw new Error("unbalanced: " + name);
  return src.slice(start, j);
}

let failures = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${extra ? " | " + extra : ""}`);
  if (!ok) failures++;
}

// ---------- model normalization ----------
const freeTwinBase = eval("(" + extractFn("freeTwinBase") + ")");
const normalizeModelId = eval("(" + extractFn("normalizeModelId") + ")");

check(
  "normalizeModelId strips :free",
  normalizeModelId("Spark-TTS-0.5B:free") === "Spark-TTS-0.5B" &&
    normalizeModelId("GLM-ASR:free") === "GLM-ASR" &&
    normalizeModelId("SenseVoiceSmall:free") === "SenseVoiceSmall"
);
check(
  "normalizeModelId keeps base names",
  normalizeModelId("SenseVoiceSmall") === "SenseVoiceSmall"
);
check(
  "normalizeModelId handles case/whitespace",
  normalizeModelId("  Spark-TTS-0.5B:Free  ") === "Spark-TTS-0.5B"
);
check("freeTwinBase returns '' for base names", freeTwinBase("SenseVoiceSmall") === "");

// ---------- rewriteModelField ----------
const escapeRegExp = eval("(" + extractFn("escapeRegExp") + ")");
const rewriteModelField = eval("(" + extractFn("rewriteModelField") + ")");

const jsonBody = Buffer.from(
  JSON.stringify({ model: "Spark-TTS-0.5B:free", inputs: "hello" })
);
const jsonOut = rewriteModelField(
  jsonBody,
  "application/json",
  "Spark-TTS-0.5B:free",
  "Spark-TTS-0.5B"
);
const parsedJson = JSON.parse(jsonOut.buf.toString("utf8"));
check(
  "JSON body model rewritten, other fields preserved",
  parsedJson.model === "Spark-TTS-0.5B" && parsedJson.inputs === "hello"
);

const badJson = rewriteModelField(
  Buffer.from("{not json"),
  "application/json",
  "Spark-TTS-0.5B:free",
  "Spark-TTS-0.5B"
);
check("invalid JSON returns error", badJson.error === "Invalid JSON body");

const boundary = "----SmokeBoundary123";
const mpBody = Buffer.from(
  `------SmokeBoundary123\r\nContent-Disposition: form-data; name="model"\r\n\r\nSpark-TTS-0.5B:free\r\n` +
    `------SmokeBoundary123\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\nFAKEAUDIOBINARY\r\n` +
    `------SmokeBoundary123--\r\n`,
  "utf8"
);
const mpOut = rewriteModelField(
  mpBody,
  "multipart/form-data; boundary=" + boundary,
  "Spark-TTS-0.5B:free",
  "Spark-TTS-0.5B"
);
const mpStr = mpOut.buf.toString("utf8");
check(
  "multipart model field rewritten, file preserved",
  mpStr.includes("Spark-TTS-0.5B") &&
    !mpStr.includes("Spark-TTS-0.5B:free") &&
    mpStr.includes("FAKEAUDIOBINARY")
);

// ---------- billing (real SQLite) ----------
let db;
try {
  const Database = (await import("better-sqlite3")).default;
  const dbPath = path.join(os.tmpdir(), "passthrough-unit-" + Date.now() + ".db");
  const seed = new Database(dbPath);
  seed.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, quota INTEGER, gift_quota INTEGER, used_quota INTEGER, request_count INTEGER, "group" TEXT, status INTEGER);
    CREATE TABLE tokens (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, key TEXT, unlimited_quota INTEGER, remain_quota INTEGER, used_quota INTEGER, status INTEGER);
    CREATE TABLE channels (id INTEGER PRIMARY KEY);
    CREATE TABLE logs (id INTEGER PRIMARY KEY, user_id INTEGER, created_at INTEGER, type INTEGER, content TEXT, username TEXT, token_name TEXT, model_name TEXT, quota INTEGER, prompt_tokens INTEGER, completion_tokens INTEGER, use_time INTEGER, is_stream INTEGER, channel_id INTEGER, token_id INTEGER, "group" TEXT, ip TEXT, request_id TEXT, upstream_request_id TEXT, other TEXT);
    INSERT INTO channels (id) VALUES (1);
    INSERT INTO users (id, username, quota, gift_quota, used_quota, request_count, "group", status) VALUES (101, 'testgift', 0, 5000000, 0, 0, 'default', 1);
    INSERT INTO tokens (id, user_id, name, key, unlimited_quota, remain_quota, used_quota, status) VALUES (201, 101, 't', 'k', 1, 0, 0, 1);
  `);
  seed.close();

  const QUOTA_PER_USD = 500000;
  const openDb = (ro) => new Database(dbPath, { readonly: !!ro });
  const findGiteeChannelId = () => 1;
  const deductQuota = eval("(" + extractFn("deductQuota") + ")");
  const refundQuota = eval("(" + extractFn("refundQuota") + ")");
  const softCheckQuota = eval("(" + extractFn("softCheckQuota") + ")");
  const getUser = () => {
    const d = new Database(dbPath, { readonly: true });
    const u = d
      .prepare(
        "SELECT quota, gift_quota, used_quota, request_count FROM users WHERE id = 101"
      )
      .get();
    d.close();
    return u;
  };

  // gift-only user, preferGift
  const r1 = deductQuota(101, 201, "GLM-ASR:free", 0.006849, true);
  const u1 = getUser();
  check(
    "deduct gift-only preferGift",
    r1.ok === true &&
      r1.fromGift === 3425 &&
      r1.fromPaid === 0 &&
      u1.gift_quota === 5000000 - 3425 &&
      u1.quota === 0 &&
      u1.used_quota === 3425,
    JSON.stringify({ r1, u1 })
  );
  check("softCheck preferGift passes on gift-only", softCheckQuota(101, 1, true).ok === true);

  const r3 = deductQuota(101, 201, "GLM-ASR", 0.006849, false);
  check(
    "deduct without preferGift blocked on gift-only",
    r3.ok === false && r3.error === "insufficient_quota"
  );

  refundQuota(101, 201, {
    quota: 3425,
    requestId: r1.requestId,
    preferGift: true,
    fromGift: 3425,
    fromPaid: 0,
  });
  const u4 = getUser();
  check(
    "refund restores gift wallet",
    u4.gift_quota === 5000000 && u4.quota === 0 && u4.used_quota === 0
  );

  // mixed wallets: cost 1000, gift 100, paid 1000 -> gift first
  const s5 = new Database(dbPath);
  s5
    .prepare(
      "UPDATE users SET quota = 1000, gift_quota = 100, used_quota = 0, request_count = 0 WHERE id = 101"
    )
    .run();
  s5.close();
  const r5 = deductQuota(101, 201, "Spark-TTS-0.5B:free", 0.002, true);
  const u5 = getUser();
  check(
    "mixed wallets gift-first split",
    r5.ok === true &&
      r5.fromGift === 100 &&
      r5.fromPaid === 900 &&
      u5.gift_quota === 0 &&
      u5.quota === 100 &&
      u5.used_quota === 1000,
    JSON.stringify({ r5, u5 })
  );
  refundQuota(101, 201, {
    quota: 1000,
    requestId: r5.requestId,
    preferGift: true,
    fromGift: 100,
    fromPaid: 900,
  });
  const u6 = getUser();
  check(
    "refund mixed restores both wallets",
    u6.gift_quota === 100 && u6.quota === 1000 && u6.used_quota === 0
  );

  const r7 = deductQuota(101, 201, "SenseVoiceSmall:free", 0, true);
  check("zero-price model no charge", r7.ok === true && r7.quota === 0);

  try {
    fs.unlinkSync(dbPath);
  } catch {}
} catch (e) {
  console.error("billing test setup failed:", e);
  failures++;
}

console.log("");
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);