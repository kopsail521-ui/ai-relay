import fs from "node:fs";
import crypto from "node:crypto";
import { BlockList, isIP } from "node:net";
import { DatabaseSync } from "node:sqlite";

export class ImageError extends Error {
  constructor(status, code, message, param) {
    super(message); this.status = status; this.code = code; this.param = param;
  }
}
const fail = (status, code, message) => { throw new ImageError(status, code, message); };
const nowSeconds = () => Math.floor(Date.now() / 1000);

function ipAllowed(ip, limits) {
  if (!isIP(ip)) return false;
  const list = new BlockList();
  for (const value of String(limits || "").replace(/ /g, "").split(/\n/).map((s) => s.replace(/,/g, "").trim()).filter(Boolean)) {
    try {
      const [addr, prefix] = value.split("/");
      if (!isIP(addr)) continue;
      if (prefix === undefined) list.addAddress(addr, isIP(addr) === 6 ? "ipv6" : "ipv4");
      else list.addSubnet(addr, Number(prefix), isIP(addr) === 6 ? "ipv6" : "ipv4");
    } catch { /* malformed allowlist entries never grant access */ }
  }
  return list.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");
}
export function imageClientIp(req, trustedProxies = "") {
  let remote = String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  if (trustedProxies && ipAllowed(remote, trustedProxies.replace(/,/g, "\n"))) {
    const chain = String(req.headers["x-forwarded-for"] || "").split(",").map((v) => v.trim());
    // Walk from the nearest hop. Never trust a client-supplied leftmost header.
    for (let i = chain.length - 1; i >= 0; i--) {
      if (!chain[i]) continue;
      remote = chain[i].replace(/^::ffff:/, "");
      if (!ipAllowed(remote, trustedProxies.replace(/,/g, "\n"))) break;
    }
  }
  return remote;
}

export class ImageLedger {
  constructor(dbPath, { quotaPerUsd = 500000, reservationTtl = 600, dedupSeconds = 300, clock = nowSeconds, ackDir = `${dbPath}.image-delivery`, smartRouting = true } = {}) {
    this.dbPath = dbPath; this.ackDir = ackDir; this.quotaPerUsd = quotaPerUsd; this.reservationTtl = reservationTtl; this.dedupSeconds = dedupSeconds; this.clock = clock; this.smartRouting = smartRouting;
    if (!Number.isFinite(quotaPerUsd) || quotaPerUsd <= 0 || !Number.isFinite(reservationTtl) || reservationTtl < 1 || !Number.isFinite(dedupSeconds) || dedupSeconds < 1) throw new Error("Invalid image billing configuration");
  }
  db() {
    // Do not create an empty wallet database if the mount is missing.
    if (!fs.existsSync(this.dbPath)) fail(503, "image_billing_unavailable", "Image billing database unavailable");
    try {
      const db = new DatabaseSync(this.dbPath);
      db.exec("PRAGMA busy_timeout=5000");
      db.exec(`CREATE TABLE IF NOT EXISTS keyo_image_tasks (
        id TEXT PRIMARY KEY, token_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
        model TEXT NOT NULL, request_hash TEXT NOT NULL, idempotency_key TEXT,
        state TEXT NOT NULL, upstream_id TEXT, result TEXT, error_code TEXT,
        quota INTEGER NOT NULL, reserved INTEGER NOT NULL DEFAULT 1, charged INTEGER NOT NULL DEFAULT 0,
        token_limited INTEGER NOT NULL, using_group TEXT NOT NULL, channel_id INTEGER NOT NULL,
        token_name TEXT NOT NULL, ip TEXT NOT NULL, created_at INTEGER NOT NULL,
        reserved_until INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0,
        UNIQUE(token_id,idempotency_key)
      ); CREATE INDEX IF NOT EXISTS keyo_image_hash ON keyo_image_tasks(token_id,request_hash,created_at);
      CREATE INDEX IF NOT EXISTS keyo_image_recovery ON keyo_image_tasks(state,lease_until);`);
      return db;
    } catch {
      fail(503, "image_billing_unavailable", "Image billing database unavailable");
    }
  }
  transaction(fn) {
    const db = this.db();
    try {
      db.exec("BEGIN IMMEDIATE");
      const result = fn(db);
      db.exec("COMMIT");
      // Acks are safe to prune only after settlement has committed.
      if (fs.existsSync(this.ackDir)) for (const id of fs.readdirSync(this.ackDir)) {
        if (!/^img_[\w-]+$/.test(id)) continue;
        const settled = db.prepare("SELECT charged FROM keyo_image_tasks WHERE id=?").get(id);
        if (settled?.charged) { try { fs.unlinkSync(this.ackPath(id)); } catch {} }
      }
      return result;
    } catch (e) {
      try { db.exec("ROLLBACK"); } catch {}
      if (e instanceof ImageError) throw e;
      throw new ImageError(503, "image_billing_unavailable", "Image billing transaction unavailable");
    } finally { db.close(); }
  }
  options(db) {
    const options = Object.fromEntries(db.prepare("SELECT key,value FROM options").all().map((row) => [row.key, row.value]));
    const read = (key, fallback = undefined) => {
      if (options[key] === undefined) return fallback;
      try { return JSON.parse(options[key]); } catch { fail(503, "image_pricing_unavailable", "Image price/policy configuration unavailable"); }
    };
    return { read };
  }
  auth(db, apiKey, model, ip, allowExhausted = false) {
    // Match the persisted key exactly; no case folding, deleted-row fallback,
    // channel suffix truncation or remote probe that skips billing.
    const raw = String(apiKey || "");
    if (!raw || raw.trim() !== raw) fail(401, "invalid_api_key", "Invalid API token");
    const key = raw.startsWith("sk-") ? raw.slice(3) : raw;
    const token = db.prepare("SELECT * FROM tokens WHERE key=? AND deleted_at IS NULL").get(key);
    if (!token || (Number(token.status) !== 1 && !(allowExhausted && Number(token.status) === 4)) || (Number(token.expired_time) !== -1 && Number(token.expired_time) <= this.clock())) fail(401, "invalid_api_key", "Invalid or expired API token");
    const user = db.prepare("SELECT * FROM users WHERE id=? AND deleted_at IS NULL").get(token.user_id);
    if (!user || Number(user.status) !== 1) fail(403, "user_disabled", "User is disabled");
    if (String(token.allow_ips || "").trim() && !ipAllowed(ip, token.allow_ips)) fail(403, "ip_not_allowed", "IP is not allowed by this token");
    if (token.model_limits_enabled && model && !String(token.model_limits || "").split(",").map((s) => s.trim()).includes(model)) fail(403, "model_not_allowed", "Model is not allowed by this token");
    const { read } = this.options(db);
    const ratios = read("GroupRatio", {});
    const special = read("group_ratio_setting.group_special_usable_group", {})?.[user.group] || {};
    const usable = { ...read("UserUsableGroups", {}), [user.group]: "user" };
    for (const [name, value] of Object.entries(special)) {
      if (name.startsWith("-:")) delete usable[name.slice(2)];
      else usable[name.startsWith("+:") ? name.slice(2) : name] = value;
    }
    const group = token.group || user.group;
    let groups = [group];
    if (group === "auto") {
      if (!Object.hasOwn(usable, "auto")) fail(403, "group_not_allowed", "Token group is not available");
      let requested = read("AutoGroups", []);
      if (token.auto_groups) {
        try { requested = JSON.parse(token.auto_groups); } catch { requested = []; }
      }
      if (!Array.isArray(requested)) fail(503, "image_policy_unavailable", "Auto group policy unavailable");
      groups = [...new Set(requested.filter((g) => g && g !== "auto" && Object.hasOwn(usable, g) && Object.hasOwn(ratios, g)))];
      if (token.auto_groups) groups = groups.slice(0, Number(read("MaxTokenAutoGroups", 5)));
      if (!groups.length) fail(403, "group_not_allowed", "No permitted image group available");
    } else if ((token.group && !Object.hasOwn(usable, group)) || !Object.hasOwn(ratios, group)) fail(403, "group_not_allowed", "Token group is not available");
    return { token, user, group, groups, read };
  }
  authenticate(apiKey, model, ip, allowExhausted = false) {
    return this.transaction((db) => { const auth = this.auth(db, apiKey, model, ip, allowExhausted); return { tokenId: auth.token.id, userId: auth.user.id }; });
  }
  release(db, row) {
    if (!row.reserved || row.charged) return;
    db.prepare("UPDATE users SET quota=quota+? WHERE id=?").run(row.quota, row.user_id);
    if (row.token_limited) db.prepare("UPDATE tokens SET remain_quota=remain_quota+? WHERE id=?").run(row.quota, row.token_id);
    db.prepare("UPDATE keyo_image_tasks SET reserved=0 WHERE id=? AND reserved=1 AND charged=0").run(row.id);
  }
  ensureAckDir() {
    fs.mkdirSync(this.ackDir, { recursive: true, mode: 0o700 });
    fs.accessSync(this.ackDir, fs.constants.W_OK);
  }
  ackPath(id) {
    if (!/^img_[\w-]+$/.test(id)) throw new Error("Invalid image task ID");
    return `${this.ackDir}/${id}`;
  }
  acknowledge(id) {
    // Task IDs only. An fsync'd outbox survives a SQLite outage at HTTP finish.
    // The durable result itself always remains in the wallet database.
    this.ensureAckDir();
    const fd = fs.openSync(this.ackPath(id), "w", 0o600);
    try { fs.writeSync(fd, id); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (process.platform !== "win32") {
      const dir = fs.openSync(this.ackDir, "r");
      try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    }
    this.delivered(id);
    try { fs.unlinkSync(this.ackPath(id)); } catch {}
  }
  drainAcks(db) {
    this.ensureAckDir();
    for (const id of fs.readdirSync(this.ackDir)) {
      if (!/^img_[\w-]+$/.test(id)) continue;
      this.settle(db, id);
      // Unlink only AFTER the encompassing wallet transaction commits.
    }
  }
  expire(db) {
    this.drainAcks(db);
    for (const row of db.prepare("SELECT * FROM keyo_image_tasks WHERE reserved=1 AND charged=0 AND reserved_until<=? AND lease_until<=?").all(this.clock(), this.clock())) this.release(db, row);
  }
  /**
   * Price-priority routing plan for a model.
   *
   * With smart routing enabled the candidate set is every group that has an
   * enabled channel for the model (not just the token's own group), priced and
   * sorted ascending so the cheapest group executes first. GPT-Image-Pro uses
   * its fixed per-request quota, unless the model has a per-model price in the
   * ProModelPrice option; other groups use ModelPrice × group ratio.
   * Returns { plans, sawChannel } — sawChannel distinguishes "no channel
   * anywhere" from "channel exists but no group prices the model".
   */
  planCandidates(db, { model, groups, userGroup, origin, is4k = false, quotaOverride, smart = true, excludeGroups = [] }) {
    const { read } = this.options(db);
    const prices = read("ModelPrice", {});
    const ratios = read("GroupRatio", {});
    const groupRatios = read("GroupGroupRatio", read("group_ratio_setting.group_group_ratio", {}));
    let candidates = groups;
    if (smart) {
      const rows = db.prepare(`SELECT DISTINCT a."group" AS g FROM abilities a JOIN channels c ON a.channel_id=c.id WHERE a.model=? AND a.enabled=1 AND c.status=1`).all(model);
      const all = rows.map((r) => r.g).filter(Boolean);
      // Keep the token's own group first among price ties.
      candidates = [...new Set([...(groups || []), ...all])];
    }
    const excluded = new Set(excludeGroups);
    const plans = [];
    let sawChannel = false;
    for (const candidate of candidates) {
      if (!candidate || excluded.has(candidate)) continue;
      let available;
      if (candidate === "GPT-Image-Pro") {
        available = db.prepare(`SELECT c.id, c.base_url FROM channels c JOIN abilities a ON a.channel_id=c.id WHERE a.model=? AND a."group"=? AND a.enabled=1 AND c.status=1 ORDER BY c.id LIMIT 1`).get(model, candidate);
      } else if (origin) {
        available = db.prepare(`SELECT c.id, c.base_url FROM channels c JOIN abilities a ON a.channel_id=c.id WHERE a.model=? AND a."group"=? AND a.enabled=1 AND c.status=1 AND (rtrim(c.base_url,'/')=? OR rtrim(c.base_url,'/')=?) ORDER BY c.id LIMIT 1`).get(model, candidate, origin.replace(/\/$/, ""), `${origin.replace(/\/$/, "")}/v1`);
      } else {
        available = db.prepare(`SELECT c.id, c.base_url FROM channels c JOIN abilities a ON a.channel_id=c.id WHERE a.model=? AND a."group"=? AND a.enabled=1 AND c.status=1 ORDER BY c.id LIMIT 1`).get(model, candidate);
      }
      if (!available) continue;
      sawChannel = true;
      let quota;
      if (candidate === "GPT-Image-Pro") {
        // GPT-Image-Pro bills a fixed quota by default, but models whose
        // upstream cost is higher can opt into a per-model USD price via the
        // ProModelPrice option (e.g. gpt-image-2 on aicopy = $0.06 cost).
        const proPrices = read("ProModelPrice", {});
        const proPrice = proPrices && proPrices[model];
        quota = typeof proPrice === "number" && proPrice > 0
          ? Math.round(proPrice * this.quotaPerUsd)
          : (is4k ? 14795 : 5918);
      } else if (typeof quotaOverride === "number" && quotaOverride > 0) {
        quota = quotaOverride;
      } else {
        const price = prices[model];
        const ratio = groupRatios?.[userGroup]?.[candidate] ?? ratios[candidate];
        if (typeof price !== "number" || typeof ratio !== "number" || !Number.isFinite(price) || !Number.isFinite(ratio) || price < 0 || ratio < 0) continue;
        quota = Math.round(price * ratio * this.quotaPerUsd);
      }
      if (!Number.isSafeInteger(quota) || quota <= 0 || quota > 2147483647) continue;
      plans.push({ group: candidate, channel: available, quota });
    }
    plans.sort((a, b) => a.quota - b.quota || a.group.localeCompare(b.group));
    return { plans, sawChannel };
  }
  /** Sorted routing plan for an existing task row (used by failover retries). */
  candidatesFor(row, { origin, is4k = false, excludeGroups = [] } = {}) {
    return this.transaction((db) => {
      const user = db.prepare("SELECT \"group\" FROM users WHERE id=?").get(row.user_id);
      const token = db.prepare("SELECT \"group\" FROM tokens WHERE id=?").get(row.token_id);
      const effectiveGroup = token?.group || user?.group || "default";
      // 与 reserve 相同的按令牌智能路由判定：显式分组的任务不做跨组切换。
      const smart = this.smartRouting && (effectiveGroup === "auto" || effectiveGroup === "default");
      const { plans } = this.planCandidates(db, {
        model: row.model, groups: [], userGroup: user?.group, origin, is4k,
        smart, excludeGroups,
      });
      return plans;
    });
  }
  /**
   * Failover: refund the current reservation and re-reserve the SAME task row
   * in a different group/channel, keeping the customer-facing task id stable.
   * Returns the refreshed row; throws ImageError when funds no longer cover
   * the next group (the task then stays failed with funds refunded).
   */
  reroute(id, { group, channel, quota }) {
    return this.transaction((db) => {
      this.expire(db);
      const row = db.prepare("SELECT * FROM keyo_image_tasks WHERE id=?").get(id);
      if (!row || row.charged || row.state === "ready") fail(409, "image_reroute_unavailable", "Task can no longer be rerouted");
      if (row.reserved) this.release(db, row);
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(row.user_id);
      const token = db.prepare("SELECT * FROM tokens WHERE id=?").get(row.token_id);
      if (!user || !token || Number(user.quota) < quota || (row.token_limited && Number(token.remain_quota) < quota)) fail(403, "insufficient_quota", "Insufficient user or token quota");
      db.prepare("UPDATE users SET quota=quota-? WHERE id=?").run(quota, row.user_id);
      if (row.token_limited) db.prepare("UPDATE tokens SET remain_quota=remain_quota-? WHERE id=?").run(quota, row.token_id);
      db.prepare("UPDATE keyo_image_tasks SET quota=?,using_group=?,channel_id=?,state='reserved',upstream_id=NULL,error_code=NULL,lease_until=0,reserved=1,reserved_until=? WHERE id=?").run(quota, group, channel.id, this.clock() + this.reservationTtl, id);
      return db.prepare("SELECT * FROM keyo_image_tasks WHERE id=?").get(id);
    });
  }
  reserve({ apiKey, model, requestHash, idempotencyKey, ip, origin, is4k = false, quotaOverride }) {
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || !idempotencyKey.length || idempotencyKey.length > 128 || /[^\x21-\x7e]/.test(idempotencyKey))) fail(400, "invalid_idempotency_key", "Idempotency-Key must be 1-128 visible ASCII characters");
    return this.transaction((db) => {
      this.expire(db);
      const { token, user, group: tokenGroup, groups, read } = this.auth(db, apiKey, model, ip, true);
      let row = idempotencyKey ? db.prepare("SELECT * FROM keyo_image_tasks WHERE token_id=? AND idempotency_key=?").get(token.id, idempotencyKey) :
        db.prepare("SELECT * FROM keyo_image_tasks WHERE token_id=? AND request_hash=? AND (created_at>=? OR state IN ('reserved','submitting','running','submit_unknown')) ORDER BY created_at DESC LIMIT 1").get(token.id, requestHash, this.clock() - this.dedupSeconds);
      if (row) {
        if (row.request_hash !== requestHash) fail(409, "idempotency_conflict", "Idempotency-Key was already used for a different image request");
        return { row, fresh: false };
      }
      if (Number(token.status) !== 1) fail(401, "invalid_api_key", "Invalid API token");
      // 智能路由按令牌判定：auto / default / 未显式选定分组的令牌跨分组价格
      // 优先；用户显式选定的分组（vip、GPT-Image-Pro 等）保持锁定。
      const smart = this.smartRouting && (tokenGroup === "auto" || tokenGroup === "default");
      const { plans, sawChannel } = this.planCandidates(db, {
        model, groups, userGroup: user.group, origin, is4k, quotaOverride,
        smart,
      });
      if (!sawChannel) fail(503, "image_channel_unavailable", "Image model is not available in this token group");
      if (!plans.length) fail(503, "image_pricing_unavailable", "Image price configuration unavailable");
      const quota = plans[0].quota;
      const group = plans[0].group;
      const channel = plans[0].channel;
      // Validate the consumption log before reserving funds, never silently omit
      // a settlement because an older/mismounted database has a different schema.
      db.prepare(`INSERT INTO logs (user_id,created_at,type,content,username,token_name,model_name,quota,prompt_tokens,completion_tokens,use_time,is_stream,channel_id,token_id,"group",ip,request_id,upstream_request_id,other) VALUES (?,?,2,?,'',?,?,?,0,0,?,0,?,?,?,?,?,?,?)`);
      if (!Number.isSafeInteger(quota) || quota > 2147483647) fail(503, "image_pricing_unavailable", "Image price configuration unavailable");
      if (Number(user.quota) < quota || (!token.unlimited_quota && Number(token.remain_quota) < quota)) fail(403, "insufficient_quota", "Insufficient user or token quota");
      db.prepare("UPDATE users SET quota=quota-? WHERE id=?").run(quota, user.id);
      if (!token.unlimited_quota) db.prepare("UPDATE tokens SET remain_quota=remain_quota-? WHERE id=?").run(quota, token.id);
      const id = `img_${crypto.randomUUID()}`;
      db.prepare(`INSERT INTO keyo_image_tasks (id,token_id,user_id,model,request_hash,idempotency_key,state,quota,token_limited,using_group,channel_id,token_name,ip,created_at,reserved_until) VALUES (?,?,?,?,?,?,'reserved',?,?,?,?,?,?,?,?)`).run(id, token.id, user.id, model, requestHash, idempotencyKey || null, quota, token.unlimited_quota ? 0 : 1, group, channel.id, token.name || "", ip || "", this.clock(), this.clock() + this.reservationTtl);
      row = db.prepare("SELECT * FROM keyo_image_tasks WHERE id=?").get(id);
      return { row, fresh: true, channel, group };
    });
  }
  get(id, auth) {
    return this.transaction((db) => {
      this.expire(db);
      const row = db.prepare("SELECT * FROM keyo_image_tasks WHERE id=?").get(id);
      if (!row || (auth && (Number(row.token_id) !== Number(auth.tokenId) || Number(row.user_id) !== Number(auth.userId)))) fail(404, "image_task_not_found", "Image task not found");
      return row;
    });
  }
  submitting(id, leaseSeconds) {
    return this.transaction((db) => db.prepare("UPDATE keyo_image_tasks SET state='submitting',lease_until=? WHERE id=? AND state='reserved'").run(this.clock() + leaseSeconds, id).changes === 1);
  }
  submitted(id, upstreamId) {
    return this.transaction((db) => db.prepare("UPDATE keyo_image_tasks SET state='running',upstream_id=?,lease_until=0 WHERE id=? AND state='submitting'").run(upstreamId, id));
  }
  ready(id, result) {
    return this.transaction((db) => db.prepare("UPDATE keyo_image_tasks SET state='ready',result=?,lease_until=0,error_code=NULL WHERE id=? AND state IN ('submitting','running')").run(JSON.stringify(result), id));
  }
  failed(id, code = "image_generation_failed", state = "failed") {
    return this.transaction((db) => {
      const row = db.prepare("SELECT * FROM keyo_image_tasks WHERE id=?").get(id);
      if (!row || ["failed", "submit_unknown", "ready"].includes(row.state) || row.charged) return;
      this.release(db, row);
      db.prepare("UPDATE keyo_image_tasks SET state=?,error_code=?,lease_until=0 WHERE id=?").run(state, code, id);
    });
  }
  prepareDelivery(id) {
    return this.transaction((db) => {
      this.expire(db);
      const row = db.prepare("SELECT * FROM keyo_image_tasks WHERE id=?").get(id);
      if (!row || row.state !== "ready" || !row.result) fail(409, "image_not_ready", "Image task is not ready");
      // Pin an in-flight response against reservation expiry. The lease is
      // bounded; an aborted response eventually releases funds automatically.
      db.prepare("UPDATE keyo_image_tasks SET lease_until=? WHERE id=?").run(this.clock() + 60, id);
      if (row.charged || row.reserved) return row;
      const user = db.prepare("SELECT quota FROM users WHERE id=?").get(row.user_id);
      const token = db.prepare("SELECT remain_quota FROM tokens WHERE id=?").get(row.token_id);
      if (!user || !token || user.quota < row.quota || (row.token_limited && token.remain_quota < row.quota)) fail(403, "insufficient_quota", "Insufficient quota to retrieve the completed image");
      db.prepare("UPDATE users SET quota=quota-? WHERE id=?").run(row.quota, row.user_id);
      if (row.token_limited) db.prepare("UPDATE tokens SET remain_quota=remain_quota-? WHERE id=?").run(row.quota, row.token_id);
      db.prepare("UPDATE keyo_image_tasks SET reserved=1,reserved_until=? WHERE id=?").run(this.clock() + this.reservationTtl, id);
      return { ...row, reserved: 1 };
    });
  }
  delivered(id) {
    return this.transaction((db) => this.settle(db, id));
  }
  settle(db, id) {
      const row = db.prepare("SELECT * FROM keyo_image_tasks WHERE id=?").get(id);
      if (!row || row.state !== "ready" || row.charged) return;
      if (!row.reserved) fail(409, "image_reservation_expired", "Image reservation expired before delivery");
      db.prepare("UPDATE users SET used_quota=used_quota+?,request_count=request_count+1 WHERE id=?").run(row.quota, row.user_id);
      // Charge uses the token's reservation mode at submission, even if a token
      // administrator toggles unlimited_quota during generation.
      if (row.token_limited) db.prepare("UPDATE tokens SET used_quota=used_quota+? WHERE id=?").run(row.quota, row.token_id);
      db.prepare(`INSERT INTO logs (user_id,created_at,type,content,username,token_name,model_name,quota,prompt_tokens,completion_tokens,use_time,is_stream,channel_id,token_id,"group",ip,request_id,upstream_request_id,other) VALUES (?,?,2,?,'',?,?,?,0,0,?,0,?,?,?,?,?,?,?)`).run(row.user_id, this.clock(), `image settled task=${row.id}; result replayable`, row.token_name, row.model, row.quota, Math.max(0, this.clock() - row.created_at), row.channel_id, row.token_id, row.using_group, row.ip, row.id, row.upstream_id || "", JSON.stringify({ source: "native_image", task_id: row.id }));
      db.prepare("UPDATE keyo_image_tasks SET charged=1,reserved=0,lease_until=0 WHERE id=?").run(id);
  }
  health() {
    try {
      this.transaction((db) => { this.expire(db); db.prepare("SELECT id FROM users LIMIT 1").get(); db.prepare("SELECT id FROM tokens LIMIT 1").get(); });
      return { ok: true, storage: "new_api_sqlite", reservation_ttl_seconds: this.reservationTtl, dedup_seconds: this.dedupSeconds, delivery_ack_writable: true };
    } catch { return { ok: false, storage: "new_api_sqlite", reservation_ttl_seconds: this.reservationTtl, dedup_seconds: this.dedupSeconds, delivery_ack_writable: false }; }
  }
  recoverable() {
    return this.transaction((db) => {
      this.expire(db);
      for (const row of db.prepare("SELECT * FROM keyo_image_tasks WHERE state IN ('reserved','submitting') AND lease_until<=?").all(this.clock())) {
        this.release(db, row);
        db.prepare("UPDATE keyo_image_tasks SET state='submit_unknown',error_code='image_submission_unknown',lease_until=0 WHERE id=?").run(row.id);
      }
      return db.prepare("SELECT * FROM keyo_image_tasks WHERE state='running' AND upstream_id IS NOT NULL").all();
    });
  }
}
