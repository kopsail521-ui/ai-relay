import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { is4KSize, normalizeImageRequest } from "./image-contracts.mjs";
import { ImageLedger } from "./image-ledger.mjs";

test("is4KSize correctly classifies 1K, 2K and 4K sizes", () => {
  // 1K / 2K should be false
  assert.equal(is4KSize("1024x1024"), false);
  assert.equal(is4KSize("1280x720"), false);
  assert.equal(is4KSize("2048x2048"), false);
  assert.equal(is4KSize("2048x1152"), false);
  assert.equal(is4KSize("2560x1440"), false);
  assert.equal(is4KSize("1K"), false);
  assert.equal(is4KSize("2K"), false);
  assert.equal(is4KSize(null), false);
  assert.equal(is4KSize(undefined), false);

  // 4K should be true
  assert.equal(is4KSize("3840x2160"), true);
  assert.equal(is4KSize("2160x3840"), true);
  assert.equal(is4KSize("2880x2880"), true);
  assert.equal(is4KSize("3840x1280"), true);
  assert.equal(is4KSize("1280x3840"), true);
  assert.equal(is4KSize("4096x2160"), true);
  assert.equal(is4KSize("4K"), true);
  assert.equal(is4KSize("4k"), true);
});

test("GPT-Image-Pro group dynamic billing: 5918 for 1K/2K and 14795 for 4K", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keyo-image-pro-test-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const dbPath = path.join(temp, "wallet.db");
  const ackDir = path.join(temp, "acks");

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,status INTEGER,quota INTEGER,used_quota INTEGER DEFAULT 0,request_count INTEGER DEFAULT 0,"group" TEXT,deleted_at TEXT);
    CREATE TABLE tokens(id INTEGER PRIMARY KEY,user_id INTEGER,key TEXT,name TEXT,status INTEGER,expired_time INTEGER,remain_quota INTEGER,unlimited_quota INTEGER,used_quota INTEGER DEFAULT 0,model_limits_enabled INTEGER DEFAULT 0,model_limits TEXT DEFAULT '',allow_ips TEXT DEFAULT '',"group" TEXT,auto_groups TEXT DEFAULT '',deleted_at TEXT);
    CREATE TABLE options(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE channels(id INTEGER PRIMARY KEY,status INTEGER,base_url TEXT,name TEXT);
    CREATE TABLE abilities(channel_id INTEGER,model TEXT,"group" TEXT,enabled INTEGER,priority INTEGER DEFAULT 0,weight INTEGER DEFAULT 1);
    CREATE TABLE logs(user_id INTEGER,created_at INTEGER,type INTEGER,content TEXT,username TEXT,token_name TEXT,model_name TEXT,quota INTEGER,prompt_tokens INTEGER,completion_tokens INTEGER,use_time INTEGER,is_stream INTEGER,channel_id INTEGER,token_id INTEGER,"group" TEXT,ip TEXT,request_id TEXT,upstream_request_id TEXT,other TEXT);
  `);

  db.prepare('INSERT INTO users(id,status,quota,"group") VALUES(1,1,1000000,\'default\')').run();
  db.prepare('INSERT INTO tokens(id,user_id,key,name,status,expired_time,remain_quota,unlimited_quota,"group") VALUES(1,1,\'pro-token\',\'test-pro\',1,-1,1000000,0,\'GPT-Image-Pro\')').run();
  db.prepare("INSERT INTO channels(id,status,base_url,name) VALUES(18,1,'https://api.aicopy.top','Keyo Image Pro')").run();
  db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(18,\'gpt-image-2.5-flare\',\'GPT-Image-Pro\',1)').run();
  db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(18,\'gpt-image-2.5-sunburst\',\'GPT-Image-Pro\',1)').run();

  db.prepare("INSERT INTO options(key,value) VALUES('ModelPrice', ?)").run(JSON.stringify({ "gpt-image-2.5-flare": 0.020548, "gpt-image-2.5-sunburst": 0.024658 }));
  db.prepare("INSERT INTO options(key,value) VALUES('GroupRatio', ?)").run(JSON.stringify({ "default": 1, "GPT-Image-Pro": 0.576 }));
  db.prepare("INSERT INTO options(key,value) VALUES('UserUsableGroups', ?)").run(JSON.stringify({ "default": "Default", "GPT-Image-Pro": "GPT Image Pro" }));
  db.close();

  const ledger = new ImageLedger(dbPath, { reservationTtl: 300, dedupSeconds: 300, ackDir });

  // 1. Standard 1K/2K call -> 5918 quota
  const stdRes = ledger.reserve({
    apiKey: "sk-pro-token",
    model: "gpt-image-2.5-flare",
    requestHash: "req-1k",
    ip: "127.0.0.1",
    is4k: false
  });
  assert.equal(stdRes.fresh, true);
  assert.equal(stdRes.row.quota, 5918, "Standard 1K/2K call should bill 5918 quota ($0.011836)");
  assert.equal(stdRes.row.using_group, "GPT-Image-Pro");
  assert.equal(stdRes.row.channel_id, 18);

  // 2. Native 4K call -> 14795 quota
  const fourKRes = ledger.reserve({
    apiKey: "sk-pro-token",
    model: "gpt-image-2.5-sunburst",
    requestHash: "req-4k",
    ip: "127.0.0.1",
    is4k: true
  });
  assert.equal(fourKRes.fresh, true);
  assert.equal(fourKRes.row.quota, 14795, "Native 4K call should bill 14795 quota ($0.029589)");
  assert.equal(fourKRes.row.using_group, "GPT-Image-Pro");
  assert.equal(fourKRes.row.channel_id, 18);
});
