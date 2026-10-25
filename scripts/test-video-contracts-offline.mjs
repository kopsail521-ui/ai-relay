/**
 * Offline contract tests for video body builders — NO network, NO billing.
 * Usage: node scripts/test-video-contracts-offline.mjs
 */
import assert from "assert/strict";
import fs from "node:fs";
import {
  validateVideoClientBody,
  normalizeApimartClientBody,
  buildAioneVideoBody,
  buildGrsaiVideoBody,
  buildOpenluxGrok15Body,
  buildOpenluxMiniMaxH3Body,
  buildAicopyVideoBody,
  hasMiniMaxImage,
} from "../services/apimart-passthrough/video-contracts.mjs";

const sdMeta = {
  id: "seedance-2.0-720p-mini",
  upstream_model: "sd2.0-720mini-不卡脸（按秒）",
  estimate: { default_seconds: 5, default_resolution: "720p" },
};
const catalog = JSON.parse(fs.readFileSync(new URL("../services/apimart-passthrough/catalog.json", import.meta.url), "utf8"));

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
    last_frame_image: "https://ex.com/a.jpg",
  });
  assert.ok(err?.message?.includes("last_frame_image"));
  ok("minimax reject last_frame_image");
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
    image_urls: ["D:\\tmp\\a.png"],
  });
  assert.ok(err);
  ok("reject local path");
}


// --- MiniMax-H3 Plan B dual-track ---
{
  const err = validateVideoClientBody("MiniMax-H3", { prompt: "a cat" });
  assert.equal(err, null);
  ok("minimax-h3 accepts pure text without image (Plan B)");
}
{
  assert.equal(hasMiniMaxImage({ prompt: "a cat" }), false);
  assert.equal(hasMiniMaxImage({ prompt: "a cat", image: "https://ex.com/a.jpg" }), true);
  assert.equal(hasMiniMaxImage({ prompt: "a cat", images: ["https://ex.com/a.jpg"] }), true);
  assert.equal(hasMiniMaxImage({ prompt: "a cat", first_frame_image: "https://ex.com/a.jpg" }), true);
  ok("hasMiniMaxImage correctly detects text vs image mode");
}
{
  const b = buildOpenluxMiniMaxH3Body({ id: "MiniMax-H3" }, {
    prompt: "a cat running on grass",
    aspectRatio: "portrait",
    duration: 6
  });
  assert.equal(b.model, "MiniMax-H3");
  assert.equal(b.content[0].text, "a cat running on grass");
  assert.equal(b.resolution, "768P");
  assert.equal(b.ratio, "9:16");
  assert.equal(b.duration, 6);
  ok("buildOpenluxMiniMaxH3Body formats official text-to-video payload");
}
{
  const b = buildOpenluxMiniMaxH3Body({ id: "MiniMax-H3-vip" }, {
    prompt: "a cat",
    resolution: "2k"
  });
  assert.equal(b.resolution, "2K");
  assert.equal(b.ratio, "16:9");
  assert.equal(b.duration, 5);
  ok("buildOpenluxMiniMaxH3Body handles vip & 2k resolution");
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
  assert.deepEqual(b.extra.reference_images, [{ url: "https://ex.com/a.jpg", role: "reference_image" }]);
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
  assert.equal(b.extra.reference_images.length, 2);
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

// Regression: the real 480p Seedance inventory shares a transport with H3,
// but it must retain the chosen model, duration and reference semantics.
for (const id of ["seedance-2.5-480p", "seedance-2.0-480p", "seedance-2.0-480p-fast", "seedance-2.0-480p-mini"]) {
  const meta = catalog.models.find(m => m.id === id);
  assert.equal(meta.upstream, "aicopy");
  const client = {
    prompt: "Keep the reference identity, motion and voice",
    resolution: "480p", duration: id.includes("2.5") ? 20 : 8,
    aspect_ratio: "9:16", seed: 42,
    image_urls: ["https://ex.com/person.jpg"],
    video_urls: ["https://ex.com/motion.mp4"],
    audios: ["https://ex.com/voice.wav"],
  };
  assert.equal(validateVideoClientBody(id, client), null);
  const b = buildAicopyVideoBody(meta, client);
  assert.equal(b.model, meta.upstream_model);
  assert.equal(b.seconds, client.duration);
  assert.equal(b.size, "854x480");
  assert.equal(b._relayCandidates, undefined, "must not retry H3 model candidates");
  assert.equal(b.extra.aspect_ratio, "9:16");
  assert.equal(b.extra.seed, 42);
  assert.deepEqual(b.extra.reference_images, [{ url: "https://ex.com/person.jpg", role: "reference_image" }]);
  assert.deepEqual(b.extra.reference_videos, [{ url: "https://ex.com/motion.mp4" }]);
  assert.deepEqual(b.extra.reference_audios, [{ url: "https://ex.com/voice.wav" }]);
  assert.deepEqual(b.extra.reference_images, [{ url: "https://ex.com/person.jpg", role: "reference_image" }]);
  assert.equal(b.image, undefined);
  assert.equal(b.images, undefined);
  ok(`${id} retains chosen model, duration and multimodal references`);
}
{
  const meta = catalog.models.find(m => m.id === "seedance-2.0-480p");
  const b = buildAicopyVideoBody(meta, {
    prompt: "Transition between the two frames", duration: 5,
    image_with_roles: [
      { url: "https://ex.com/start.jpg", role: "first_frame" },
      { url: "https://ex.com/end.jpg", role: "last_frame" },
    ],
  });
  assert.deepEqual(b.extra.reference_images.map(x => x.role), ["first_frame", "last_frame"]);
  ok("480p Seedance retains first/last-frame roles");
}
{
  const client = {
    prompt: "Use the reference voice", aspectRatio: "portrait", resolution: "768p", duration: 8,
    images: ["https://ex.com/person.jpg"], audios: ["https://ex.com/voice.wav"], seed: 42,
  };
  assert.equal(validateVideoClientBody("MiniMax-H3", client), null);
  const b = buildAicopyVideoBody(catalog.models.find(m => m.id === "MiniMax-H3"), client);
  assert.equal(b.seconds, 8);
  assert.equal(b.extra.aspect_ratio, "9:16");
  assert.equal(b.extra.resolution, "768p");
  assert.equal(b.extra.seed, 42);
  assert.deepEqual(b.extra.reference_audios, [{ url: "https://ex.com/voice.wav" }]);
  ok("MiniMax image+audio preserves voice, aspect ratio and seed in unified extra");
}
for (const resolution of ["480p", "720p", "1080p"]) {
  const client = { prompt: "x", duration: 5, resolution };
  assert.equal(validateVideoClientBody("MiniMax-H3", client)?.param, "resolution");
  assert.throws(() => buildOpenluxMiniMaxH3Body({ id: "MiniMax-H3" }, client), /768p or 2k/);
  ok(`MiniMax text rejects unsupported ${resolution} before a different output tier is submitted`);
}
for (const duration of [1, 2, 3, 4.5]) {
  assert.equal(validateVideoClientBody("MiniMax-H3", { prompt: "x", duration })?.param, "duration");
  ok(`MiniMax text rejects unsupported duration ${duration}`);
}
{
  assert.equal(validateVideoClientBody("MiniMax-H3", { prompt: "x", seed: 1 })?.param, "seed");
  const client = { prompt: "x", resolution: "768p", duration: 8, audios: ["https://ex.com/voice.wav"] };
  assert.equal(validateVideoClientBody("MiniMax-H3", client), null);
  const b = buildOpenluxMiniMaxH3Body({ id: "MiniMax-H3" }, client);
  assert.deepEqual(b.content[1], { type: "audio_url", audio_url: { url: "https://ex.com/voice.wav" }, role: "reference_audio" });
  ok("MiniMax no-image route explicitly rejects seed and preserves reference audio");
}
{
  const images = Array.from({ length: 10 }, (_, i) => `https://ex.com/${i}.jpg`);
  assert.equal(validateVideoClientBody("MiniMax-H3", { prompt: "x", images })?.param, "images");
  assert.equal(validateVideoClientBody("MiniMax-H3", { prompt: "x", images: images.slice(0, 1), audios: images.slice(0, 4) })?.param, "audios");
  assert.equal(validateVideoClientBody("MiniMax-H3", { prompt: "x", videos: images.slice(0, 4) })?.param, "video_urls");
  ok("MiniMax rejects excessive reference counts before truncation or submission");
}
{
  const base = { prompt: "x", first_frame_image: "https://ex.com/frame.jpg" };
  assert.equal(validateVideoClientBody("MiniMax-H3", { ...base, audios: ["https://ex.com/voice.wav"] })?.param, "first_frame_image");
  assert.equal(validateVideoClientBody("MiniMax-H3", base), null);
  const b = buildAicopyVideoBody({ id: "MiniMax-H3" }, base);
  assert.deepEqual(b.input_reference, { url: "https://ex.com/frame.jpg" });
  assert.equal(b.extra.reference_images, undefined);
  ok("MiniMax explicit first frame stays separate from reference mode");
}
{
  const b = buildAicopyVideoBody({ id: "MiniMax-H3" }, { prompt: "x", image: { url: "https://ex.com/frame.jpg" } });
  assert.deepEqual(b.extra.reference_images, [{ url: "https://ex.com/frame.jpg", role: "reference_image" }]);
  const vip = buildOpenluxMiniMaxH3Body({ id: "MiniMax-H3-vip", estimate: { default_resolution: "1080p" } }, { prompt: "x" }, "vip");
  assert.equal(vip.resolution, "768P");
  ok("MiniMax keeps object URL aliases and uses valid 768P default in no-image VIP route");
}

console.log(`\n${n} offline contract tests passed`);
