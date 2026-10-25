import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { ImageService } from "./image-service.mjs";

function request(url, body, { chunked = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: "POST",
      headers: {
        authorization: "Bearer local-limit-fixture", "content-type": "application/json",
        ...(chunked ? { "transfer-encoding": "chunked" } : { "content-length": String(body.length) }),
      },
    }, async res => {
      try {
        const chunks = [];
        for await (const chunk of res) chunks.push(chunk);
        resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      } catch (error) { reject(error); }
    });
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error("Local body-limit request timed out")));
    if (chunked) {
      req.write(body.subarray(0, 48 * 1024));
      setImmediate(() => req.end(body.subarray(48 * 1024)));
    } else req.end(body);
  });
}

test("image body limits return HTTP 413 for known length and chunked uploads without creating tasks", async () => {
  let reserves = 0, providerRequests = 0;
  const ledger = {
    reserve() { reserves++; throw new Error("Unexpected fixture reservation"); },
  };
  const service = new ImageService({
    ledger, models: { "gpt-image-2": { id: "gpt-image-2", kind: "image" } },
    origin: "http://127.0.0.1:1", key: "local-provider-forbidden", maxBodyBytes: 64 * 1024,
    fetchImpl() { providerRequests++; throw new Error("Provider requests are forbidden in this test"); },
  });
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ length: req.headers["content-length"], framing: req.headers["transfer-encoding"] });
    return service.handle(req, res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/v1/images/generations`;
  try {
    const tooLarge = Buffer.from(JSON.stringify({ model: "gpt-image-2", prompt: "x".repeat(96 * 1024), replyType: "async" }));
    for (const chunked of [false, true]) {
      const response = await request(url, tooLarge, { chunked });
      assert.equal(response.status, 413);
      assert.equal(response.body.error.code, "image_body_too_large");
      assert.equal(response.body.task_id, undefined);
      assert.equal(response.body.error.task_id, undefined);
      assert.equal(response.headers["x-image-task-id"], undefined);
      assert.equal(reserves, 0); assert.equal(providerRequests, 0);
      assert.equal(seen.at(-1).length, chunked ? undefined : String(tooLarge.length));
      assert.equal(seen.at(-1).framing, chunked ? "chunked" : undefined);

      // The rejection must leave the service responsive and preserve the
      // existing invalid-JSON response for a later, ordinary-sized request.
      const next = await request(url, Buffer.from("{"));
      assert.equal(next.status, 400);
      assert.equal(next.body.error.code, "invalid_json");
      assert.equal(reserves, 0); assert.equal(providerRequests, 0);
    }
  } finally {
    service.stop();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
