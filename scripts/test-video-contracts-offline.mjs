/**
 * Offline contract tests for video body builders — NO network, NO billing.
 * Usage: node scripts/test-video-contracts-offline.mjs
 */
import assert from "assert/strict";
import {
  validateVideoClientBody,
  normalizeApimartClientBody,
  buildAioneVideoBody,
  buildGrsaiVideoBody,
  buildOpenluxGrok15Body,
  buildAicopyVideoBody,
} from "../services/apimart-passthrough/video-contracts.mjs";

const sdMeta = {
  id: "seedance-2.0-720p-mini",
  upstream_model: "sd2.0-720mini-不卡脸（按秒）",
  estimate: { default_seconds: 5, default_resolution: "720p" },
};

let n = 0;
function ok(name) {
  n++;
  console.log("PASS", name);
}

// --- Seedance: user choice ---
{
  const b = buildAioneVideoBody(sdMeta, {
    prompt: "x",
    image_urls: ["https://ex.com/a.jpg"],
  });
  assert.ok(b.extra?.reference_images, "image_urls alone → reference");
  assert.equal(b.input_reference, undefined);
  ok("seedance image_urls = reference");
}
{
  const b = buildAioneVideoBody(sdMeta, {
    prompt: "x",
    first_frame_image: "https://ex.com/a.jpg",
  });
  assert.deepEqual(b.input_reference, { url: "https://ex.com/a.jpg" });
  ok("seedance first_frame_image = input_reference");
}
{
  const b = buildAioneVideoBody(sdMeta, {
    prompt: "x",
    generation_type: "first_frame",
    image_urls: ["https://ex.com/a.jpg"],
  });
  assert.deepEqual(b.input_reference, { url: "https://ex.com/a.jpg" });
  ok("seedance generation_type=first_frame forces i2v");
}
{
  const b = buildAioneVideoBody(sdMeta, {
    prompt: "x",
    image_urls: ["https://ex.com/a.jpg"],
    audios: ["https://ex.com/v.mp3"],
  });
  assert.ok(b.extra?.reference_audios?.length);
  assert.equal(b.extra.reference_images[0].role, "reference_image");
  assert.equal(b.input_reference, undefined);
  ok("seedance image+audio = multimodal reference");
}
{
  const err = validateVideoClientBody("seedance-2.0-720p-mini", {
    prompt: "x",
    first_frame_image: "https://ex.com/a.jpg",
    audios: ["https://ex.com/v.mp3"],
  });
  assert.ok(err, "reject frame+audio mix");
  ok("seedance reject first_frame+audio");
}
{
  const err = validateVideoClientBody("seedance-2.0-720p", {
    prompt: "x",
    duration: 2,
  });
  assert.ok(err?.param === "duration", "reject duration 2");
  ok("seedance reject duration < 4");
}
{
  const err = validateVideoClientBody("seedance-2.0-720p", {
    prompt: "x",
    duration: 16,
  });
  assert.ok(err?.param === "duration", "reject duration 16");
  ok("seedance reject duration > 15");
}
{
  const err = validateVideoClientBody("seedance-2.0-720p", {
    prompt: "x",
    duration: 8,
  });
  assert.equal(err, null);
  ok("seedance accept duration 8");
}

// --- MiniMax ---
{
  const err = validateVideoClientBody("MiniMax-H3", {
    prompt: "x",
    first_frame_image: "https://ex.com/a.jpg",
  });
  assert.ok(err?.message?.includes("images[]"));
  ok("minimax reject wan-style frames");
}
{
  const b = buildGrsaiVideoBody(
    { upstream_model: "minimax-h3", estimate: { default_seconds: 5, default_resolution: "768p" } },
    {
      prompt: "x",
      aspectRatio: "portrait",
      resolution: "480p",
      duration: 5,
      image_urls: ["https://ex.com/a.jpg"],
      audio_urls: ["https://ex.com/v.mp3"],
    }
  );
  assert.deepEqual(b.images, ["https://ex.com/a.jpg"]);
  assert.deepEqual(b.audios, ["https://ex.com/v.mp3"]);
  assert.equal(b.aspectRatio, "portrait");
  ok("minimax aliases image_urls/audio_urls");
}
{
  const err = validateVideoClientBody("MiniMax-H3", {
    prompt: "x",
    aspectRatio: "4:3",
  });
  assert.ok(err?.param === "aspectRatio");
  ok("minimax reject unsupported aspect alias");
}

// --- wan normalize ---
{
  const b = normalizeApimartClientBody("wan3.0-video", {
    model: "wan3.0-video",
    prompt: "x",
    resolution: "720p",
    aspect_ratio: "16:9",
    video_url: "https://ex.com/m.mp4",
    audio_url: "https://ex.com/a.mp3",
  });
  assert.equal(b.resolution, "720P");
  assert.equal(b.size, "16:9");
  assert.deepEqual(b.video_urls, ["https://ex.com/m.mp4"]);
  assert.equal(b.video_url, undefined);
  assert.deepEqual(b.audio_urls, ["https://ex.com/a.mp3"]);
  ok("wan normalize casing + singular media");
}
{
  const err = validateVideoClientBody("wan3.0-video", {
    file_url: "https://ex.com/a.pdf",
    link_url: "https://ex.com/page",
  });
  assert.ok(err);
  ok("wan reject file_url+link_url");
}

// --- flux DRAFT ---
{
  const b = normalizeApimartClientBody("flux-3-video", {
    model: "flux-3-video",
    prompt: "x",
    tier: "DRAFT",
  });
  assert.equal(b.draft, true);
  assert.equal(b.resolution, "hd");
  ok("flux tier=DRAFT → draft+hd");
}

// --- grok-1.5 ---
{
  const err = validateVideoClientBody("grok-1.5-video", {
    prompt: "x",
    seconds: 8,
  });
  assert.ok(err?.message?.includes("6 or 10"));
  ok("grok-1.5 reject seconds=8");
}
{
  const b = buildOpenluxGrok15Body({ id: "grok-1.5-video" }, {
    prompt: "x",
    seconds: 10,
    aspect_ratio: "9:16",
    image_urls: ["https://ex.com/a.jpg"],
  });
  assert.equal(b.seconds, "10");
  assert.equal(b.size, "9:16");
  assert.equal(b.input_reference, "https://ex.com/a.jpg");
  ok("grok-1.5 body shape");
}

// --- local path blocked ---
{
  const err = validateVideoClientBody("wan3.0-video", {
    prompt: "x",
    image_urls: ["D:\\\\tmp\\\\a.png"],
  });
  assert.ok(err);
  ok("reject local path");
}


// --- MiniMax-H3 / aicopy ---
{
  const err = validateVideoClientBody("MiniMax-H3", { prompt: "a cat" });
  assert.ok(err?.message?.includes("requires at least one reference image"));
  ok("minimax-h3 rejects missing image");
}
{
  const err = validateVideoClientBody("MiniMax-H3", {
    prompt: "a cat",
    image: "https://ex.com/a.jpg",
    resolution: "invalid"
  });
  assert.ok(err?.message?.includes("resolution must be"));
  ok("minimax-h3 rejects bad resolution");
}
{
  const err = validateVideoClientBody("MiniMax-H3", {
    prompt: "a cat",
    image: "https://ex.com/a.jpg",
    resolution: "720p",
    duration: 5
  });
  assert.equal(err, null);
  ok("minimax-h3 accepts valid payload with 720p");
}
{
  const b = buildAicopyVideoBody({ id: "MiniMax-H3" }, {
    prompt: "a cat",
    image: "https://ex.com/a.jpg",
    resolution: "480p"
  });
  assert.equal(b.model, "开源h3-480p（特惠版）");
  assert.equal(b.image, "https://ex.com/a.jpg");
  ok("minimax-h3 480p maps to 开源h3-480p（特惠版）");
}
{
  const b = buildAicopyVideoBody({ id: "MiniMax-H3" }, {
    prompt: "a cat",
    images: ["https://ex.com/a.jpg", "https://ex.com/b.jpg"],
    resolution: "768p"
  });
  assert.equal(b.model, "【api调用】开源h3-768p");
  assert.equal(b._relayCandidates.length, 4);
  assert.equal(b.images.length, 2);
  ok("minimax-h3 768p maps to 【api调用】开源h3-768p with 4 relay candidates");
}
{
  const b = buildAicopyVideoBody({ id: "MiniMax-H3" }, {
    prompt: "a cat",
    image: "https://ex.com/a.jpg",
    resolution: "720p"
  });
  assert.equal(b.model, "官方h3-720p");
  ok("minimax-h3 720p maps to 官方h3-720p");
}
{
  const b = buildAicopyVideoBody({ id: "MiniMax-H3-vip" }, {
    prompt: "a cat",
    image: "https://ex.com/a.jpg"
  });
  assert.equal(b.model, "官方h3-1080p");
  ok("minimax-h3-vip defaults to 1080p");
}
{
  const b = buildAicopyVideoBody({ id: "MiniMax-H3" }, {
    prompt: "a cat",
    image: "https://ex.com/a.jpg",
    resolution: "2k"
  });
  assert.equal(b.model, "官方h3-2k");
  ok("minimax-h3 2k maps to 官方h3-2k");
}

console.log(`\n${n} offline contract tests passed`);
