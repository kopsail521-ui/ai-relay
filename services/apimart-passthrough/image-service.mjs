import { normalizeImageRequest, extractImageResult, is4KSize } from "./image-contracts.mjs";
import { ImageError, imageClientIp } from "./image-ledger.mjs";
import { RequestBudget, resourceError } from "./request-budget.mjs";

const SUCCESS = new Set(["succeeded", "success", "completed", "done"]);
const FAILURE = new Set(["failed", "violation", "rejected", "cancelled", "canceled", "error"]);

export class ImageService {
  constructor({ ledger, models, origin, key, aicopyOrigin = "https://api.aicopy.top", aicopyKey = "", fetchImpl = fetch, pollIntervalMs = 5000, waitMs = 180000, transportMs = 60000, trustedProxies = "", maxBodyBytes = 32 * 1024 * 1024, smartRouting = true, maxJobs = 2, maxJobMs = 900000, budget = new RequestBudget({ maxBytes: 32 * 1024 * 1024, maxRequests: 4 }) }) {
    this.ledger = ledger; this.models = models;
    this.origin = (origin || "").replace(/\/$/, "");
    this.key = key;
    this.aicopyOrigin = (aicopyOrigin || "").replace(/\/$/, "");
    this.aicopyKey = aicopyKey || "";
    this.fetch = fetchImpl;
    this.pollIntervalMs = pollIntervalMs; this.waitMs = waitMs; this.transportMs = transportMs; this.trustedProxies = trustedProxies; this.maxBodyBytes = maxBodyBytes; this.smartRouting = smartRouting;
    this.jobs = new Map(); this.stopped = false;
    if (![maxJobs, maxJobMs].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("Invalid image worker limits");
    this.maxJobs = maxJobs; this.maxJobMs = maxJobMs; this.budget = budget;
    this.controllers = new Set(); this.sleeps = new Map(); this.pollCooldown = new Map();
  }
  error(res, e, id) {
    if (e.code === "request_capacity_exceeded") res.setHeader?.("Retry-After", "5");
    return this.send(res, e.status || 503, { error: { message: e.status ? e.message : "Image task service temporarily unavailable", type: e.status === 400 ? "invalid_request_error" : "server_error", code: e.code || "image_service_unavailable", ...(e.param ? { param: e.param } : {}), ...(id ? { task_id: id } : {}) } });
  }
  send(res, status, body, deliveryId) {
    if (res.destroyed || res.writableEnded) return;
    const data = JSON.stringify(body);
    // This acknowledges delivery to the immediate HTTP consumer (normally the
    // moderation proxy). It cannot prove that a downstream end user received it.
    // The stored result remains replayable without an additional charge.
    if (deliveryId) res.once("finish", () => {
      try { this.ledger.acknowledge(deliveryId); }
      catch { console.error(`[image] settlement pending task=${deliveryId}`); }
    });
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data), "Access-Control-Allow-Origin": "*", ...(body.task_id ? { "X-Image-Task-ID": body.task_id, Location: `/v1/images/tasks/${body.task_id}` } : {}) });
    res.end(data);
  }
  pending(res, row) {
    return this.send(res, 202, { id: row.id, task_id: row.id, status: row.state === "ready" ? "succeeded" : row.state, result_url: `/v1/images/tasks/${row.id}`, billing: { charged: !!row.charged, reserved_quota: row.reserved ? row.quota : 0, reservation_expires_at: row.reserved ? row.reserved_until : null } });
  }
  delivery(res, row) {
    if (row.state === "failed" || row.state === "submit_unknown") return this.error(res, new ImageError(502, row.error_code || "image_generation_failed", row.state === "submit_unknown" ? "Submission outcome unknown; do not resubmit. Contact support with task_id." : "Image generation failed; no image was charged."), row.id);
    if (row.state !== "ready") return this.pending(res, row);
    const deliverable = this.ledger.prepareDelivery(row.id);
    const result = JSON.parse(deliverable.result);
    if (!Array.isArray(result.data) || !result.data.length) throw new ImageError(503, "image_result_unavailable", "Stored image result unavailable");
    return this.send(res, 200, { ...result, id: row.id, task_id: row.id, status: "succeeded", billing: { quota: row.quota, charged: !!row.charged } }, row.id);
  }
  async transport(path, method, body, originOverride, keyOverride, timeoutMs = this.transportMs) {
    // Never forward client credentials, routing/idempotency headers or unrelated
    // proxy headers to the native provider. The local ledger owns idempotency.
    const origin = (originOverride || this.origin).replace(/\/$/, "");
    const key = keyOverride || this.key;
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(this.transportMs, timeoutMs)));
    try {
      const response = await this.fetch(`${origin}${path}`, {
        method, signal: controller.signal, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const chunks = []; let bytes = 0;
      if (response.body) {
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > this.maxBodyBytes) { controller.abort(); throw new Error("upstream response exceeds limit"); }
          chunks.push(Buffer.from(chunk));
        }
      }
      const text = Buffer.concat(chunks).toString("utf8");
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: response.status, payload: json };
    } finally { clearTimeout(timeout); this.controllers.delete(controller); }
  }
  acceptResult(row, up) {
    // A polling transport error leaves the existing upstream task running.
    if (up.status < 200 || up.status >= 300 || !up.payload) return false;
    const result = extractImageResult(up.payload);
    if (FAILURE.has(result.status)) {
      this.ledger.failed(row.id, result.status === "violation" ? "image_policy_rejected" : "image_generation_failed");
      return true;
    }
    if (SUCCESS.has(result.status)) {
      if (!result.urls.length) this.ledger.failed(row.id, "image_result_missing");
      else this.ledger.ready(row.id, { created: row.created_at, data: result.urls.map((url) => ({ url })) });
      return true;
    }
    return false;
  }
  startJob(row, native, opts = {}) {
    if (this.jobs.has(row.id)) return this.jobs.get(row.id);
    if (this.stopped || this.jobs.size >= this.maxJobs || (this.pollCooldown.get(row.id) || 0) > Date.now()) return Promise.resolve();
    const deadline = Date.now() + this.maxJobMs;
    // Old durable tasks can still be queried by ID, but never occupy an
    // automatic worker forever. A client query makes at most one GET for them.
    const pollOnce = !native && row.created_at * 1000 < this.ledger.clock() * 1000 - this.maxJobMs;
    const remaining = () => Math.max(1, deadline - Date.now());
    // One attempt = submit + poll in the row's current group. Returns the
    // terminal outcome so the failover wrapper can decide whether another
    // group should take over: only definitive generation failures fail over;
    // policy rejections and unknown submission outcomes never do.
    const attempt = async (rowArg) => {
      let row = rowArg;
      const isAicopy = row.using_group === "GPT-Image-Pro";
      if (isAicopy) {
        if (native) {
          const lease = Math.ceil(this.transportMs / 1000) + 30;
          if (!this.ledger.submitting(row.id, lease)) return "submitting_conflict";
          const aicopyBody = {
            model: native.model,
            prompt: native.prompt,
            size: native.aspectRatio || native.size || "1024x1024",
            ...(native.quality ? { quality: native.quality } : {}),
            ...(native.background ? { background: native.background } : {}),
            ...(native.images && native.images.length ? { images: native.images } : {}),
          };
          let up;
          try {
            up = await this.transport("/v1/images/generations", "POST", aicopyBody, this.aicopyOrigin, this.aicopyKey, remaining());
          } catch {
            this.ledger.failed(row.id, "image_submission_unknown", "submit_unknown");
            return "submit_unknown";
          }
          const result = extractImageResult(up.payload);
          if (up.status >= 200 && up.status < 300 && result.urls.length) {
            const upId = `aicopy_${crypto.randomUUID()}`;
            this.ledger.submitted(row.id, upId);
            this.ledger.ready(row.id, { created: up.payload?.created || row.created_at, data: result.urls.map((url) => ({ url })) });
            return "ready";
          }
          if (FAILURE.has(result.status) || (up.status >= 400 && up.status < 500)) {
            if (result.status === "violation") {
              this.ledger.failed(row.id, "image_policy_rejected");
              return "rejected";
            }
            this.ledger.failed(row.id, "image_submission_rejected");
            return "failed";
          }
          this.ledger.failed(row.id, "image_generation_failed");
          return "failed";
        }
        return "no_request";
      }
      if (native) {
        const lease = Math.ceil(this.transportMs / 1000) + 30;
        if (!this.ledger.submitting(row.id, lease)) return "submitting_conflict";
        let up;
        try { up = await this.transport("/v1/api/generate", "POST", native, undefined, undefined, remaining()); }
        catch { this.ledger.failed(row.id, "image_submission_unknown", "submit_unknown"); return "submit_unknown"; }
        const id = up.payload?.id || up.payload?.task_id || up.payload?.data?.id || up.payload?.data?.task_id;
        const result = extractImageResult(up.payload);
        if (FAILURE.has(result.status) || (up.status >= 400 && up.status < 500)) {
          if (result.status === "violation") {
            this.ledger.failed(row.id, "image_policy_rejected");
            return "rejected";
          }
          this.ledger.failed(row.id, "image_submission_rejected");
          return "failed";
        }
        if (!id && up.status >= 200 && up.status < 300 && result.urls.length) {
          // Sync upstream: the submit response carried the finished image and
          // no task id. Store the result directly instead of failing.
          this.ledger.submitted(row.id, `grsai_sync_${crypto.randomUUID()}`);
          this.ledger.ready(row.id, { created: up.payload?.created || row.created_at, data: result.urls.map((url) => ({ url })) });
          return "ready";
        }
        if (!id || up.status >= 500) {
          // A 5xx is a definitive upstream refusal (no task id exists to poll),
          // so it is failover-eligible like any other generation failure. Only
          // transport-level throws stay submit_unknown (a task may exist).
          if (up.status >= 500) {
            this.ledger.failed(row.id, "image_generation_failed");
            return "failed";
          }
          this.ledger.failed(row.id, "image_submission_unknown", "submit_unknown"); return "submit_unknown";
        }
        // Durable upstream ID comes before any terminal result or client response.
        this.ledger.submitted(row.id, String(id));
        row = this.ledger.get(row.id);
        if (this.acceptResult(row, up)) return this.ledger.get(row.id).state === "ready" ? "ready" : "failed";
      }
      let failures = 0;
      while (!this.stopped && Date.now() < deadline) {
        row = this.ledger.get(row.id);
        if (row.state !== "running" || !row.upstream_id) return row.state === "ready" ? "ready" : row.state === "failed" ? "failed" : "abandoned";
        try {
          const up = await this.transport(`/v1/api/result?id=${encodeURIComponent(row.upstream_id)}`, "GET", undefined, undefined, undefined, remaining());
          if (this.acceptResult(row, up)) {
            const done = this.ledger.get(row.id);
            return done.state === "ready" ? "ready" : done.state === "failed" ? "failed" : "abandoned";
          }
          failures = up.status >= 200 && up.status < 300 ? 0 : failures + 1;
        } catch { failures++; /* transient poll failure, never another POST */ }
        if (pollOnce) break;
        await this.pause(Math.min(remaining(), 30000, this.pollIntervalMs * 2 ** Math.min(failures, 5)));
      }
      return "paused";
    };
    const work = (async () => {
      let current = row;
      const outcome = await attempt(current);
      if (outcome !== "failed" || !(native && this.smartRouting)) return;
      // Price-priority failover: refund the failed group's reservation and
      // continue in the next-cheapest group that serves this model, keeping
      // the customer-facing task id (and polling URL) unchanged.
      const tried = new Set([current.using_group]);
      while (!this.stopped && Date.now() < deadline) {
        let next;
        try { next = this.ledger.candidatesFor(current, { origin: this.origin, is4k: !!opts.is4k, excludeGroups: [...tried] })[0]; }
        catch { return; }
        if (!next) return;
        tried.add(next.group);
        try { current = this.ledger.reroute(current.id, next); }
        catch { return; }
        console.log(`[image] failover task=${current.id} group=${next.group} quota=${next.quota}`);
        const retry = await attempt(current);
        if (retry !== "failed") return;
      }
    })().catch(() => {
      // Any storage failure leaves the durable row for recovery; never submit
      // again after an uncertain write. Do not expose internal provider details.
      console.error(`[image] task recovery required task=${row.id}`);
    }).finally(() => {
      this.jobs.delete(row.id);
      this.pollCooldown.set(row.id, Date.now() + 60000);
      if (this.pollCooldown.size > 512) this.pollCooldown.delete(this.pollCooldown.keys().next().value);
    });
    this.jobs.set(row.id, work);
    return work;
  }
  async readJson(req, lease) {
    let buffer;
    try { buffer = await lease.read(req, this.maxBodyBytes); }
    catch (error) { if (error.status === 413) error.code = "image_body_too_large"; throw error; }
    try { return JSON.parse(buffer.toString("utf8")); }
    catch { throw new ImageError(400, "invalid_json", "Invalid JSON body"); }
  }
  async handle(req, res, bodyOverride) {
    let id, lease;
    try {
      const apiKey = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""))?.[1]?.trim() || "";
      const ip = imageClientIp(req, this.trustedProxies);
      const pathname = String(req.url || "").split("?")[0];
      const match = /^\/v1\/images\/tasks\/(img_[\w-]+)$/.exec(pathname);
      if (match) {
        if (req.method !== "GET") throw new ImageError(405, "method_not_allowed", "Use GET to query an image task");
        id = match[1];
        const auth = this.ledger.authenticate(apiKey, null, ip, true);
        const row = this.ledger.get(id, auth);
        this.ledger.authenticate(apiKey, row.model, ip, true);
        if (row.state === "running") this.startJob(row);
        return this.delivery(res, row);
      }
      if (req.method !== "POST") throw new ImageError(405, "method_not_allowed", "Use POST to generate images");
      if (this.stopped || this.jobs.size >= this.maxJobs) throw resourceError();
      lease = this.budget.acquire();
      let body;
      if (bodyOverride) { lease.grow(Buffer.byteLength(JSON.stringify(bodyOverride))); body = bodyOverride; }
      else body = await this.readJson(req, lease);
      const meta = this.models[body?.model];
      const normalized = normalizeImageRequest(body?.model, body);
      if (!meta || meta.kind !== "image") throw new ImageError(400, "image_model_unsupported", "Image model unavailable");
      if (!this.key) throw new ImageError(503, "image_service_unavailable", "Image service temporarily unavailable");
      const is4k = is4KSize(normalized.request.aspectRatio || body.size || body.resolution);
      const { row, fresh } = this.ledger.reserve({ apiKey, model: meta.id, requestHash: normalized.requestHash, idempotencyKey: req.headers["idempotency-key"], ip, origin: this.origin, is4k });
      id = row.id;
      const job = this.startJob(row, fresh ? { ...normalized.request, model: meta.upstream_model || meta.id, replyType: "async" } : undefined, { is4k });
      // Async HTTP responses finish before generation. Keep the budget until
      // the worker releases reference media, including any failover attempt.
      const held = lease; lease = undefined;
      job.finally(() => held.release());
      if (normalized.replyType === "async") return ["ready", "failed", "submit_unknown"].includes(row.state) ? this.delivery(res, row) : this.pending(res, row);
      // Bound the HTTP wait, not the lifetime of the persistent task. Disconnect
      // ends this wait while generation continues with the same durable ID.
      let closeHandler, timer;
      await Promise.race([
        job,
        new Promise((resolve) => { timer = setTimeout(resolve, this.waitMs); }),
        new Promise((resolve) => { closeHandler = resolve; res.once("close", closeHandler); }),
      ]);
      clearTimeout(timer);
      res.removeListener("close", closeHandler);
      return this.delivery(res, this.ledger.get(id));
    } catch (e) {
      if (e.code === "request_capacity_exceeded") req.resume?.();
      if (!req.aborted) return this.error(res, e, id);
    } finally { lease?.release(); }
  }
  recover() {
    if (this.stopped) return;
    try { for (const row of this.ledger.recoverable({ createdAfter: this.ledger.clock() - Math.ceil(this.maxJobMs / 1000), limit: this.maxJobs })) this.startJob(row); }
    catch { console.error("[image] recovery unavailable; image submissions fail closed"); }
  }
  startRecovery(intervalMs = 30000) {
    this.recover();
    this.recoveryTimer = setInterval(() => this.recover(), intervalMs);
    this.recoveryTimer.unref();
  }
  pause(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.sleeps.delete(timer); resolve(); }, ms);
      this.sleeps.set(timer, resolve);
    });
  }
  stop() {
    this.stopped = true; clearInterval(this.recoveryTimer);
    for (const controller of this.controllers) controller.abort();
    for (const [timer, resolve] of this.sleeps) { clearTimeout(timer); resolve(); }
    this.sleeps.clear();
  }
}
