import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { ImageLedger } from "../services/apimart-passthrough/image-ledger.mjs";
import { ImageService } from "../services/apimart-passthrough/image-service.mjs";

test("End-to-End ImageService test with mock upstreams for Grsai and Aicopy (GPT-Image-Pro)", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keyo-image-pro-e2e-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const dbPath = path.join(temp, "wallet.db");
  const ackDir = path.join(temp, "acks");

  // Setup mock database
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
  db.prepare('INSERT INTO tokens(id,user_id,key,name,status,expired_time,remain_quota,unlimited_quota,"group") VALUES(1,1,\'key-pro\',\'token-pro\',1,-1,1000000,0,\'GPT-Image-Pro\')').run();
  db.prepare('INSERT INTO tokens(id,user_id,key,name,status,expired_time,remain_quota,unlimited_quota,"group") VALUES(2,1,\'key-def\',\'token-def\',1,-1,1000000,0,\'default\')').run();
  
  db.prepare("INSERT INTO channels(id,status,base_url,name) VALUES(1,1,'https://grsaiapi.com','Keyo Images')").run();
  db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(1,\'gpt-image-2.5-flare\',\'default\',1)').run();
  
  db.prepare("INSERT INTO channels(id,status,base_url,name) VALUES(18,1,'https://api.aicopy.top','Keyo Image Pro')").run();
  db.prepare('INSERT INTO abilities(channel_id,model,"group",enabled) VALUES(18,\'gpt-image-2.5-flare\',\'GPT-Image-Pro\',1)').run();

  db.prepare("INSERT INTO options(key,value) VALUES('ModelPrice', ?)").run(JSON.stringify({ "gpt-image-2.5-flare": 0.020548 }));
  db.prepare("INSERT INTO options(key,value) VALUES('GroupRatio', ?)").run(JSON.stringify({ "default": 1, "GPT-Image-Pro": 0.576 }));
  db.prepare("INSERT INTO options(key,value) VALUES('UserUsableGroups', ?)").run(JSON.stringify({ "default": "Default", "GPT-Image-Pro": "GPT Image Pro" }));
  db.close();

  const ledger = new ImageLedger(dbPath, { reservationTtl: 300, dedupSeconds: 300, ackDir });
  const modelMap = {
    "gpt-image-2.5-flare": { id: "gpt-image-2.5-flare", kind: "image", upstream: "grsai" }
  };

  let lastAicopyRequest = null;
  const mockFetch = async (url, init) => {
    if (url.includes("aicopy.top/v1/images/generations")) {
      lastAicopyRequest = JSON.parse(init.body);
      return new Response(JSON.stringify({
        created: 1792562000,
        data: [{ url: "https://mock.aicopy.top/img_mock.png" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error("Unexpected mock url: " + url);
  };

  const imageService = new ImageService({
    ledger,
    models: modelMap,
    origin: "https://grsaiapi.com",
    key: "sk-mock-grsai",
    aicopyOrigin: "https://api.aicopy.top",
    aicopyKey: "sk-mock-aicopy",
    fetchImpl: mockFetch
  });

  // Test 1: GPT-Image-Pro standard size (1024x1024)
  {
    const req = {
      method: "POST",
      url: "/v1/images/generations",
      headers: { authorization: "Bearer sk-key-pro" }
    };
    let responseStatus, responseBody, finished = false;
    const res = new http.ServerResponse(req);
    res.writeHead = (status, headers) => { responseStatus = status; };
    res.end = (data) => {
      responseBody = JSON.parse(data);
      finished = true;
      res.emit("finish");
    };

    await imageService.handle(req, res, {
      model: "gpt-image-2.5-flare",
      prompt: "test 1k prompt",
      size: "1024x1024"
    });

    assert.equal(responseStatus, 200);
    assert.equal(responseBody.status, "succeeded");
    assert.equal(responseBody.data[0].url, "https://mock.aicopy.top/img_mock.png");
    assert.equal(responseBody.billing.quota, 5918, "Standard 1K/2K should bill exactly 5,918 quota");
    assert.equal(lastAicopyRequest.size, "1024x1024");
    assert.equal(lastAicopyRequest.prompt, "test 1k prompt");
  }

  // Test 2: GPT-Image-Pro 4K size (3840x2160)
  {
    const req = {
      method: "POST",
      url: "/v1/images/generations",
      headers: { authorization: "Bearer sk-key-pro" }
    };
    let responseStatus, responseBody, finished = false;
    const res = new http.ServerResponse(req);
    res.writeHead = (status, headers) => { responseStatus = status; };
    res.end = (data) => {
      responseBody = JSON.parse(data);
      finished = true;
      res.emit("finish");
    };

    await imageService.handle(req, res, {
      model: "gpt-image-2.5-flare",
      prompt: "test 4k prompt",
      size: "3840x2160"
    });

    assert.equal(responseStatus, 200);
    assert.equal(responseBody.status, "succeeded");
    assert.equal(responseBody.billing.quota, 14795, "4K should bill exactly 14,795 quota");
    assert.equal(lastAicopyRequest.size, "3840x2160");
    assert.equal(lastAicopyRequest.prompt, "test 4k prompt");
  }

  // Check ledger / DB after settlements
  const verifyDb = new DatabaseSync(dbPath);
  const user = verifyDb.prepare("SELECT quota, used_quota FROM users WHERE id=1").get();
  assert.equal(user.used_quota, 5918 + 14795, "Used quota must equal 5918 + 14795");
  assert.equal(user.quota, 1000000 - 5918 - 14795, "User quota balance must be decremented accurately");
  
  const logs = verifyDb.prepare("SELECT model_name, quota, \"group\", channel_id FROM logs ORDER BY created_at ASC").all();
  assert.equal(logs.length, 2);
  assert.equal(logs[0].quota, 5918);
  assert.equal(logs[0].group, "GPT-Image-Pro");
  assert.equal(logs[0].channel_id, 18);
  assert.equal(logs[1].quota, 14795);
  assert.equal(logs[1].group, "GPT-Image-Pro");
  assert.equal(logs[1].channel_id, 18);
  verifyDb.close();
});
