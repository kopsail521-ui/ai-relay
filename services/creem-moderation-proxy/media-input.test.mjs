import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseMultipart, parseImageBody, validateUploadAuth, checkStorageSpace, checkUploadStorage, decodeBase64Upload, storageErrorCode } from "./media-input.mjs";

export function multipart(parts, boundary = "local-boundary") {
  return Buffer.concat([...parts.flatMap((part) => [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.field}"${part.filename !== undefined ? `; filename="${part.filename}"` : ""}\r\n${part.mime ? `Content-Type: ${part.mime}\r\n` : ""}\r\n`),
    Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data), Buffer.from("\r\n"),
  ]), Buffer.from(`--${boundary}--\r\n`)]);
}
const ct = "multipart/form-data; boundary=local-boundary";
test("multipart preserves binary boundary-like bytes and normalizes repeated images", () => {
  const bytes = Buffer.from([0, 255, ...Buffer.from("--local-boundary\r\n--local-boundary-not-a-delimiter"), 128]);
  const buf = multipart([{ field: "model", data: "gpt-image-2" }, { field: "prompt", data: "中文 prompt" },
    { field: "image[]", filename: "a.png", mime: "image/png", data: bytes },
    { field: "images", data: "https://example.invalid/ref.png" }, { field: "mask", data: "https://example.invalid/mask.png" }]);
  const { payload } = parseImageBody(buf, ct);
  assert.equal(payload.prompt, "中文 prompt");
  assert.equal(payload.images[0], `data:image/png;base64,${bytes.toString("base64")}`);
  assert.equal(payload.images[1], "https://example.invalid/ref.png");
  assert.equal(payload.mask, "https://example.invalid/mask.png");
});
test("multipart rejects truncation, duplicate fields, unsafe headers, count and size", () => {
  const one = multipart([{ field: "prompt", data: "test" }]);
  assert.throws(() => parseMultipart(one.subarray(0, one.length - 10), ct));
  assert.throws(() => parseImageBody(multipart([{ field: "model", data: "a" }, { field: "model", data: "b" }]), ct), { code: "duplicate_field" });
  assert.throws(() => parseMultipart(one, "multipart/form-data; boundary=a; boundary=b"));
  assert.throws(() => parseMultipart(one, ct, { maxTextBytes: 1 }), { status: 413 });
  assert.throws(() => parseMultipart(one, ct, { maxParts: 0 }), { code: "too_many_fields" });
  assert.throws(() => parseMultipart(one, ct, { maxTotalBytes: 1 }), { status: 413 });
  assert.throws(() => parseImageBody(multipart([{ field: "mask", filename: "mask.png", mime: "image/png", data: "binary" }]), ct), { code: "unsupported_binary_mask" });
  assert.throws(() => parseMultipart(multipart([{ field: "__proto__", data: "bad" }]), ct));
  assert.throws(() => parseImageBody(multipart(Array.from({ length: 17 }, () => ({ field: "image", data: "https://example.invalid/a.png" }))), ct), { code: "too_many_images" });
  assert.throws(() => parseMultipart(multipart([{ field: "image", filename: "a.png", data: "x" }]), ct, { maxFiles: 0 }), { code: "too_many_files" });
});
test("strict base64 rejects silently ignored input", () => {
  assert.equal(decodeBase64Upload("data:image/png;base64,YQ==").toString(), "a");
  for (const invalid of ["%%%!", "YQ", "YQ==junk", "YR==", {}, ""]) assert.throws(() => decodeBase64Upload(invalid));
});
test("upload auth accepts only gateway authenticated JSON list", async () => {
  let calls = 0;
  await assert.rejects(validateUploadAuth("Bearer a extra", "http://local", { fetchImpl: async () => { calls++; } }), { status: 401 });
  assert.equal(calls, 0);
  for (const status of [401, 403, 302, 429, 500, 503]) {
    await assert.rejects(validateUploadAuth("Bearer local", "http://local", { fetchImpl: async () => new Response(null, { status }) }), { status: status < 404 && status !== 302 ? 401 : 503 });
  }
  for (const body of ['{"success":true}', '<html>login</html>', '{"object":"list","data":[],"error":{}}']) {
    await assert.rejects(validateUploadAuth("Bearer local", "http://local", { fetchImpl: async () => new Response(body) }), { code: "auth_unavailable" });
  }
  await assert.rejects(validateUploadAuth("Bearer local", "http://local", { fetchImpl: async () => { throw new Error("local transport"); } }), { code: "auth_unavailable" });
  await validateUploadAuth("Bearer local", "http://local", { fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, "manual"); assert.ok(options.signal);
    return new Response('{"object":"list","data":[]}');
  } });
});
test("unsupported statfs doesn't block storage, low space and permissions remain precise", () => {
  const fake = { statfsSync() { throw Object.assign(new Error(), { code: "ENOSYS" }); } };
  checkStorageSpace("unused", 1, fake);
  assert.throws(() => checkStorageSpace("unused", 1, { statfsSync: () => ({ bsize: 1, bavail: 0 }) }), { code: "ENOSPC" });
  assert.throws(() => checkStorageSpace("unused", 1, { statfsSync() { throw Object.assign(new Error(), { code: "EACCES" }); } }), { code: "EACCES" });
  assert.equal(storageErrorCode({ code: "EDQUOT" }), "storage_insufficient");
  assert.equal(storageErrorCode({ code: "EROFS" }), "storage_unavailable");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-storage-test-"));
  try {
    assert.equal(checkUploadStorage(dir).ok, true);
    assert.deepEqual(fs.readdirSync(dir), []);
    assert.equal(checkUploadStorage(dir, { ...fs, statfsSync: fake.statfsSync }).ok, true);
    assert.deepEqual(fs.readdirSync(dir), []);
    const denied = checkUploadStorage(dir, { ...fs, writeFileSync() { throw Object.assign(new Error(), { code: "EACCES" }); } });
    assert.equal(denied.code, "storage_unavailable");
  } finally { fs.rmSync(dir, { recursive: true }); }
});
