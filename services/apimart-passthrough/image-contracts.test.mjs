import test from "node:test";
import assert from "node:assert/strict";
import { normalizeImageRequest, extractImageResult, imageModels } from "./image-contracts.mjs";
const png = "iVBORw0KGgo=";
const ref = `data:image/png;base64,${png}`;

for (const model of imageModels()) {
  test(`${model}: text and singular-array reference contracts`, () => {
    const nano = model.startsWith("nano-");
    const high = ["gpt-image-2-vip", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"].includes(model);
    const controls = nano ? { aspectRatio: "16:9", imageSize: "4K" } : { size: high ? "3840x2160" : "1672x941", quality: high ? "medium" : "auto", ...(high ? { background: "transparent" } : {}), mask: "https://ref.example/mask.png" };
    const text = normalizeImageRequest(model, { prompt: "draw", ...controls });
    assert.equal(text.request.model, model);
    assert.equal(text.request.images, undefined);
    if (nano) { assert.equal(text.request.aspectRatio, "16:9"); assert.equal(text.request.imageSize, "4K"); }
    const reference = normalizeImageRequest(model, { prompt: "draw", image: ["http://ref.example/a.png", ref, png], ...controls });
    assert.deepEqual(reference.request.images, ["http://ref.example/a.png", ref, png]);
    assert.equal(reference.request.mask, nano ? undefined : "https://ref.example/mask.png");
  });
}

test("every reference alias is validated without truncation or silent drop", () => {
  const inputs = Array.from({ length: 17 }, (_, n) => `https://ref.example/${n}.png`);
  assert.equal(normalizeImageRequest("gpt-image-2", { prompt: "draw", images: inputs }).request.images.length, 17);
  for (const alias of ["images", "image_urls", "image_url", "image"]) {
    assert.deepEqual(normalizeImageRequest("gpt-image-2", { prompt: "draw", [alias]: [ref, { url: "https://ref.example/a.png" }] }).request.images, [ref, "https://ref.example/a.png"]);
    assert.throws(() => normalizeImageRequest("gpt-image-2", { prompt: "draw", [alias]: [ref, "file:///secret"] }), /only accepts/);
    assert.throws(() => normalizeImageRequest("gpt-image-2", { prompt: "draw", [alias]: null }), /invalid image/);
  }
  assert.equal(normalizeImageRequest("gpt-image-2", { prompt: "draw", images: [] }).request.images, undefined);
  for (const value of ["data:image/png;base64,AAAA=", "data:image/png;base64,AB==", "data:image/png;base64,%%%", "base64wrong", "https://"]) assert.throws(() => normalizeImageRequest("gpt-image-2", { prompt: "draw", image: value }));
});

test("model-specific dimensions and quality reject unsupported requests before billing", () => {
  assert.throws(() => normalizeImageRequest("gpt-image-2", { prompt: "x", size: "3840x2160" }), /1K/);
  assert.equal(normalizeImageRequest("gpt-image-2", { prompt: "x", size: "21:9" }).request.aspectRatio, "21:9");
  assert.throws(() => normalizeImageRequest("gpt-image-2-vip", { prompt: "x", size: "16:9" }), /pixel/);
  assert.throws(() => normalizeImageRequest("gpt-image-2-vip", { prompt: "x", quality: "high" }), /quality/);
  assert.throws(() => normalizeImageRequest("gpt-image-2.5-flare", { prompt: "x", quality: "max" }), /quality/);
  assert.equal(normalizeImageRequest("gpt-image-2.5-sunburst", { prompt: "x", quality: "max" }).request.quality, "max");
  assert.equal(normalizeImageRequest("gpt-image-2-vip", { prompt: "x", size: "1600x1600" }).request.aspectRatio, "1600x1600");
  assert.throws(() => normalizeImageRequest("gpt-image-2.5-flare", { prompt: "x", size: "1600x1600" }), /documented/);
  assert.throws(() => normalizeImageRequest("gpt-image-2-vip", { prompt: "x", size: "4096x4096" }), /3840/);
  assert.throws(() => normalizeImageRequest("gpt-image-2", { prompt: "x", background: "transparent" }), /background/);
  assert.throws(() => normalizeImageRequest("gpt-image-2-vip", { prompt: "x", mask: ref }), /mask only/);
});

test("Nano independent resolution aliases and controls", () => {
  const normalized = normalizeImageRequest("nano-banana-2.1", { prompt: "x", aspect_ratio: "1:4", resolution: "4K", size: "1:4" });
  assert.equal(normalized.request.aspectRatio, "1:4"); assert.equal(normalized.request.imageSize, "4K");
  assert.throws(() => normalizeImageRequest("nano-banana-pro", { prompt: "x", aspectRatio: "1:4" }), /Unsupported/);
  assert.throws(() => normalizeImageRequest("nano-banana-2", { prompt: "x", size: "1024x1024" }), /pixel size/);
  assert.throws(() => normalizeImageRequest("nano-banana-2", { prompt: "x", aspectRatio: "1:1", size: "16:9" }), /disagree/);
  assert.throws(() => normalizeImageRequest("nano-banana-2", { prompt: "x", imageSize: "2K", resolution: "4K" }), /disagree/);
  for (const field of ["quality", "background", "mask"]) assert.throws(() => normalizeImageRequest("nano-banana-2", { prompt: "x", [field]: "unsupported" }));
});

test("count, format, stream and reply aliases never silently degrade", () => {
  for (const body of [{ n: 2 }, { n: 0 }, { response_format: "b64_json" }, { stream: true }, { response_type: "stream" }, { response_type: "async", replyType: "json" }]) assert.throws(() => normalizeImageRequest("gpt-image-2", { prompt: "x", ...body }));
  assert.equal(normalizeImageRequest("gpt-image-2", { prompt: "x", response_type: "async", n: 1, response_format: "url" }).replyType, "async");
});

test("extract only result URL/inline envelopes, never request or error URLs", () => {
  for (const results of [["https://image.example/output"], [{ url: "https://image.example/output" }], { images: [{ image_url: "https://image.example/output" }] }]) assert.deepEqual(extractImageResult({ status: "succeeded", results }).urls, ["https://image.example/output"]);
  assert.deepEqual(extractImageResult({ status: "completed", data: [{ b64_json: png }] }).urls, [ref]);
  for (const invalid of ["%%%", "AB==", "AAAA=", "", "https://error.example/"]) assert.deepEqual(extractImageResult({ status: "succeeded", results: [{ b64_json: invalid }] }).urls, []);
  assert.deepEqual(extractImageResult({ status: "succeeded", error: "https://error.example/", images: ["https://request.example/a.png"] }).urls, []);
  assert.equal(extractImageResult({ code: 500, status: "succeeded", results: [] }).status, "failed");
  assert.equal(extractImageResult({ status: "violation", error: "policy" }).status, "violation");
  assert.equal(extractImageResult({ success: false, status: "succeeded" }).status, "failed");
});
