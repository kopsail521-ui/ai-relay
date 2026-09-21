/** Pure video request contracts — no HTTP/DB. Used by server.mjs + offline tests. */
function firstHttpsUrl(v) {
  if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  if (v && typeof v === "object" && v.url && /^https?:\/\//i.test(String(v.url))) {
    return String(v.url);
  }
  return "";
}

function aioneDefaultSize(meta, body) {
  // Only accept real pixel size — never aspect like "16:9"
  const raw = String(body.size || "").trim();
  if (/^\d+x\d+$/i.test(raw)) return raw;
  const res = String(
    body.resolution || meta?.estimate?.default_resolution || meta?.id || ""
  ).toLowerCase();
  if (res.includes("1080")) return "1920x1080";
  if (res.includes("720")) return "1280x720";
  if (res.includes("480")) return "854x480";
  return "";
}

/** Reject local paths / data URLs before precharge (saves money). */
function badMediaReason(v) {
  if (v == null || v === "") return "";
  if (typeof v === "object") {
    for (const k of ["url", "image_url", "audio_url", "video_url"]) {
      if (v[k] != null) {
        const r = badMediaReason(v[k]);
        if (r) return r;
      }
    }
    return "";
  }
  const s = String(v).trim();
  if (!s) return "";
  if (/^data:/i.test(s)) return "data: URLs are not allowed; POST /v1/uploads first";
  if (/^(file:|asset:)/i.test(s)) return "file:/asset: URLs are not allowed; POST /v1/uploads first";
  if (/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith("\\\\") || s.startsWith("/Users/") || s.startsWith("/home/")) {
    return "local file paths are not allowed; POST /v1/uploads first";
  }
  if (/^https?:\/\//i.test(s)) return "";
  // bare relative / non-url strings in media slots
  if (/\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|m4a)(\?|$)/i.test(s)) {
    return "media must be a public http(s) URL; POST /v1/uploads for local files";
  }
  return "";
}

function scanBodyMedia(body) {
  const keys = [
    "image",
    "image_url",
    "image_urls",
    "images",
    "input_reference",
    "first_frame_image",
    "last_frame_image",
    "image_with_roles",
    "video_url",
    "video_urls",
    "videos",
    "audio_url",
    "audio_urls",
    "audios",
    "reference_images",
    "reference_videos",
    "reference_audios",
  ];
  for (const k of keys) {
    const v = body[k];
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const it of v) {
        const r = badMediaReason(it);
        if (r) return { param: k, message: r };
      }
    } else {
      const r = badMediaReason(v);
      if (r) return { param: k, message: r };
    }
  }
  if (body.extra && typeof body.extra === "object") {
    for (const k of ["reference_images", "reference_videos", "reference_audios"]) {
      const v = body.extra[k];
      if (!Array.isArray(v)) continue;
      for (const it of v) {
        const r = badMediaReason(it);
        if (r) return { param: `extra.${k}`, message: r };
      }
    }
  }
  return null;
}

function hasAnyMedia(body, names) {
  for (const n of names) {
    const v = body[n];
    if (v == null || v === "") continue;
    if (Array.isArray(v) && v.length) return true;
    if (!Array.isArray(v)) return true;
  }
  return false;
}

/**
 * Per-model client validation BEFORE precharge.
 * Returns { message, param } or null when OK.
 */
function validateVideoClientBody(modelId, body) {
  const mediaBad = scanBodyMedia(body);
  if (mediaBad) return mediaBad;

  const id = String(modelId || "");

  if (id.startsWith("seedance-")) {
    if (id === "seedance-2.0" || id === "seedance-2.5") {
      return {
        param: "model",
        message:
          "seedance-2.0 / seedance-2.5 are delisted. Use seedance-2.0-720p-mini (or other *-720p/*-1080p SKUs).",
      };
    }
    const frame =
      hasAnyMedia(body, ["first_frame_image", "input_reference"]) ||
      (Array.isArray(body.image_with_roles) &&
        body.image_with_roles.some(
          (x) => x?.role === "first_frame" || x?.role === "last_frame"
        ));
    const av =
      hasAnyMedia(body, ["video_urls", "videos", "video_url", "audios", "audio_urls", "audio_url"]);
    if (frame && av) {
      return {
        param: "first_frame_image",
        message:
          "Seedance: first/last-frame mode cannot mix with video_urls/audios. For reference+audio use image_urls (not first_frame_image).",
      };
    }
    const onlyAudio =
      av &&
      !hasAnyMedia(body, [
        "image_urls",
        "images",
        "image",
        "image_url",
        "image_with_roles",
        "first_frame_image",
        "input_reference",
        "video_urls",
        "videos",
        "video_url",
      ]) &&
      hasAnyMedia(body, ["audios", "audio_urls", "audio_url"]);
    if (onlyAudio) {
      return {
        param: "audios",
        message:
          "Seedance: reference audio requires at least one reference image or video (image_urls / video_urls).",
      };
    }
    const dur = body.duration ?? body.seconds;
    if (dur != null && dur !== "") {
      const n = Number(dur);
      if (!Number.isFinite(n) || n !== Math.trunc(n) || n < 4 || n > 15) {
        return {
          param: "duration",
          message:
            "Seedance duration/seconds must be an integer 4–15 (default 5 if omitted)",
        };
      }
    }
    return null;
  }

  if (id === "MiniMax-H3") {
    if (!String(body.prompt || body.text || "").trim()) {
      return { param: "prompt", message: "prompt is required" };
    }
    if (
      body.first_frame_image ||
      body.last_frame_image ||
      (Array.isArray(body.image_with_roles) && body.image_with_roles.length)
    ) {
      return {
        param: "images",
        message:
          "MiniMax-H3 is not Seedance/Wan: use images[] (https URLs, max 9) and audios[] (max 3). Do not send first_frame_image / last_frame_image / image_with_roles.",
      };
    }
    const res = String(body.resolution || "").toLowerCase();
    if (res && !/^(480p|768p|1080p|2k)$/.test(res)) {
      return {
        param: "resolution",
        message: "MiniMax-H3 resolution must be 480p / 768p / 1080p (do not put aspect ratio in resolution)",
      };
    }
    const size = String(body.size || "");
    if (size && /^\d+:\d+$/.test(size)) {
      return {
        param: "size",
        message:
          "MiniMax-H3: put aspect in aspectRatio (landscape or portrait), not size. resolution is 480p/768p/1080p.",
      };
    }
    const dur = body.duration ?? body.seconds;
    if (dur != null) {
      const n = Number(dur);
      if (!Number.isFinite(n) || n < 1 || n > 15) {
        return { param: "duration", message: "MiniMax-H3 duration must be 1–15 (1080p max 10)" };
      }
      if (String(body.resolution || "").toLowerCase() === "1080p" && n > 10) {
        return { param: "duration", message: "MiniMax-H3 1080p duration max is 10 seconds" };
      }
    }
    return null;
  }

  if (id === "gemini-omni-1.1-flash") {
    if (body.duration != null || body.seconds != null) {
      return {
        param: "duration",
        message: "gemini-omni-1.1-flash does not accept duration/seconds (model picks length ~3–10s)",
      };
    }
    if (body.last_frame_image && !body.first_frame_image && !body.image_with_roles) {
      return {
        param: "first_frame_image",
        message: "last_frame_image requires first_frame_image (or use image_with_roles)",
      };
    }
    return null;
  }

  if (id === "gemini-omni-1.1-flash-ext") {
    const nImg = Array.isArray(body.image_urls)
      ? body.image_urls.length
      : Array.isArray(body.images)
        ? body.images.length
        : 0;
    if (nImg === 2) {
      return {
        param: "image_urls",
        message: "gemini-omni-1.1-flash-ext supports 0, 1, or 3 images — not 2",
      };
    }
    const nVid = Array.isArray(body.video_urls) ? body.video_urls.length : body.video_url ? 1 : 0;
    if (nVid && (body.duration != null || body.seconds != null)) {
      return {
        param: "duration",
        message: "gemini-omni-1.1-flash-ext: do not send duration together with video_urls",
      };
    }
    const dur = body.duration ?? body.seconds;
    if (dur != null && ![4, 6, 8, 10, "4", "6", "8", "10"].includes(dur)) {
      return {
        param: "duration",
        message: "gemini-omni-1.1-flash-ext duration must be 4, 6, 8, or 10",
      };
    }
    const gt = String(body.generation_type || "").toLowerCase();
    if (gt === "frame" && nImg !== 1) {
      return {
        param: "image_urls",
        message: "generation_type=frame requires exactly 1 image",
      };
    }
    return null;
  }

  if (id === "flux-3-video") {
    if (body.draft && body.draft_from_task_id) {
      return {
        param: "draft",
        message: "flux-3-video: draft and draft_from_task_id are mutually exclusive",
      };
    }
    const tier = String(body.tier || "").toUpperCase();
    const res = String(body.resolution || body.tier || "").toLowerCase();
    const isDraft = !!body.draft || tier === "DRAFT";
    if (isDraft && (res === "fhd" || res === "1080p" || tier === "FHD")) {
      return { param: "draft", message: "flux-3-video: draft only supports hd (not fhd)" };
    }
    if (body.draft_from_task_id && String(body.prompt || "").trim()) {
      return {
        param: "prompt",
        message: "flux-3-video finalize (draft_from_task_id) must not include prompt",
      };
    }
    const dur = body.duration ?? body.seconds;
    if (dur != null && dur !== "" && String(dur).toLowerCase() !== "auto") {
      const n = Number(dur);
      if (!Number.isFinite(n) || n < 5 || n > 20) {
        return { param: "duration", message: "flux-3-video duration must be integer 5–20" };
      }
    }
    const nImg = Array.isArray(body.image_urls) ? body.image_urls.length : 0;
    if (nImg > 10) {
      return { param: "image_urls", message: "flux-3-video image_urls max 10 keyframes" };
    }
    return null;
  }

  if (id === "wan3.0-video") {
    const gt = String(body.generation_type || "").toLowerCase();
    const frameRoles =
      Array.isArray(body.image_with_roles) &&
      body.image_with_roles.some(
        (x) => x?.role === "first_frame" || x?.role === "last_frame"
      );
    if (
      (gt === "reference" ||
        hasAnyMedia(body, [
          "video_urls",
          "audio_urls",
          "audio_url",
          "file_url",
          "link_url",
        ])) &&
      frameRoles
    ) {
      return {
        param: "generation_type",
        message:
          "wan3.0-video: do not mix first/last-frame roles with reference mode (video_urls/audio_urls/file_url/link_url)",
      };
    }
    if (body.file_url && body.link_url) {
      return {
        param: "file_url",
        message: "wan3.0-video: file_url and link_url are mutually exclusive — pick one",
      };
    }
    const dur = body.duration ?? body.seconds;
    if (dur != null && dur !== "") {
      const n = Number(dur);
      if (n !== -1 && (!Number.isFinite(n) || n < 2 || n > 30)) {
        return {
          param: "duration",
          message: "wan3.0-video duration must be 2–30 or -1 (model chooses length)",
        };
      }
    }
    if (
      !String(body.prompt || "").trim() &&
      !hasAnyMedia(body, [
        "image_urls",
        "images",
        "image_with_roles",
        "video_urls",
        "video_url",
        "audio_urls",
        "audio_url",
        "file_url",
        "link_url",
      ])
    ) {
      return {
        param: "prompt",
        message: "wan3.0-video: provide prompt and/or media (image_urls / video_urls / file_url / link_url)",
      };
    }
    return null;
  }

  if (id === "grok-1.5-video") {
    if (!String(body.prompt || body.text || "").trim()) {
      return { param: "prompt", message: "prompt is required" };
    }
    const sec = body.seconds ?? body.duration;
    if (sec != null && sec !== "" && ![6, 10, "6", "10"].includes(sec)) {
      return {
        param: "seconds",
        message: "grok-1.5-video only supports seconds=6 or 10 (not 1–15 arbitrary)",
      };
    }
    return null;
  }

  if (id.includes("grok-imagine")) {
    // image checked later in rewrite; ensure prompt present
    if (!String(body.prompt || "").trim()) {
      return { param: "prompt", message: "prompt is required" };
    }
    return null;
  }

  return null;
}

/** Safe alias normalize for APIMart passthrough models (wan/flux/gemini). */
function normalizeApimartClientBody(modelId, body) {
  const out = { ...body, model: modelId };
  if (out.audio_url && !out.audio_urls) {
    out.audio_urls = [out.audio_url];
  }
  delete out.audio_url;
  if (out.video_url) {
    if (!out.video_urls) out.video_urls = [out.video_url];
    delete out.video_url; // avoid dual-send of video_url + video_urls
  }
  // wan resolution casing + aspect aliases
  if (modelId === "wan3.0-video") {
    if (out.resolution) {
      const r = String(out.resolution).toLowerCase();
      if (r === "480p") out.resolution = "480P";
      else if (r === "720p") out.resolution = "720P";
      else if (r === "1080p") out.resolution = "1080P";
    }
    if (out.aspect_ratio && !out.size) out.size = out.aspect_ratio;
    if (out.aspectRatio && !out.size) out.size = out.aspectRatio;
  }
  // flux: tier DRAFT → draft:true + hd; HD/FHD → resolution only
  if (modelId === "flux-3-video") {
    if (out.tier) {
      const t = String(out.tier).toUpperCase();
      if (t === "DRAFT") {
        out.draft = true;
        if (!out.resolution) out.resolution = "hd";
      } else if (t === "HD" && !out.resolution) {
        out.resolution = "hd";
      } else if (t === "FHD" && !out.resolution) {
        out.resolution = "fhd";
      }
    }
    if (out.resolution) {
      const r = String(out.resolution).toLowerCase();
      if (r === "720p") out.resolution = "hd";
      if (r === "1080p") out.resolution = "fhd";
    }
  }
  // gemini-omni-flash: strip duration if somehow passed after validate
  if (modelId === "gemini-omni-1.1-flash") {
    delete out.duration;
    delete out.seconds;
  }
  return out;
}

function buildOpenluxGrok15Body(meta, body) {
  const est = meta.estimate || {};
  const out = {
    model: String(body.model || meta.id || "grok-1.5-video"),
    prompt: String(body.prompt || body.text || ""),
  };
  // Upstream only accepts 6 or 10 seconds (validated before rewrite)
  const sec = Number(body.seconds ?? body.duration ?? est.default_seconds ?? 6);
  out.seconds = String(sec === 10 ? 10 : 6);
  const ar =
    body.aspect_ratio ||
    body.aspectRatio ||
    (typeof body.size === "string" && /^\d+:\d+$/.test(body.size) ? body.size : "") ||
    "16:9";
  out.size = mapAspectToAione(ar) || "16:9";
  const img =
    firstHttpsUrl(body.input_reference) ||
    firstHttpsUrl(body.image) ||
    firstHttpsUrl(body.image_url) ||
    (Array.isArray(body.image_urls) ? firstHttpsUrl(body.image_urls[0]) : "") ||
    (Array.isArray(body.images) ? firstHttpsUrl(body.images[0]) : "");
  if (img) out.input_reference = img;
  return out;
}

/** aione rejects MiniMax-style aspect words with model_not_available */
function mapAspectToAione(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "";
  if (/^\d+:\d+$/.test(s)) return s;
  if (s === "16:9" || s === "landscape" || s === "horizontal") return "16:9";
  if (s === "9:16" || s === "portrait" || s === "vertical") return "9:16";
  if (s === "1:1" || s === "square") return "1:1";
  return "";
}

/** Keyo Path B JSON → aione POST /v1/videos */
function buildAioneVideoBody(meta, body) {
  const out = {
    model: String(meta.upstream_model || ""),
    prompt: String(body.prompt || body.text || ""),
  };
  const seconds = body.seconds ?? body.duration;
  if (seconds != null && seconds !== "") out.seconds = Number(seconds);
  else out.seconds = Number(meta?.estimate?.default_seconds || 5);
  if (!Number.isFinite(out.seconds) || out.seconds <= 0) out.seconds = 5;
  // Upstream Seedance accepts 4–15s; clamp so bad clients do not hard-fail mid-flight
  if (out.seconds < 4) out.seconds = 4;
  if (out.seconds > 15) out.seconds = 15;
  out.seconds = Math.trunc(out.seconds);

  // size is required by aione Seedance SKUs; derive from model id when missing
  let size = aioneDefaultSize(meta, body);
  if (!size) {
    const id = String(meta.id || "").toLowerCase();
    if (id.includes("1080")) size = "1920x1080";
    else if (id.includes("720")) size = "1280x720";
  }
  if (size) out.size = size;

  const extra = {};
  const ar = mapAspectToAione(body.aspect_ratio || body.aspectRatio || body.ratio);
  if (ar) extra.aspect_ratio = ar;
  // Prefer size over free-form resolution; only forward explicit client resolution
  // that looks like a real tier (avoid leaking MiniMax 480p onto Seedance).
  const clientRes = String(body.resolution || "").trim();
  if (clientRes && /^(480p|720p|1080p|2k|4k)$/i.test(clientRes)) {
    extra.resolution = clientRes.toLowerCase();
  }

  // Image mode is user-chosen — do NOT force "1 image = first frame".
  //   first_frame_image / input_reference / image_with_roles(first|last)
  //     → 首帧 / 首尾帧
  //   image_urls / images / role=reference_image / generation_type=reference
  //     → 参考生（单张图也可以）
  //   + video_urls / audios → 必须走参考生（上游禁止首帧口混参考音视频）
  const images = [];
  const push = (u, role) => {
    const url = firstHttpsUrl(u);
    if (!url) return;
    images.push(role ? { url, role } : { url });
  };
  if (Array.isArray(body.image_with_roles)) {
    for (const it of body.image_with_roles) {
      push(it, it?.role || "reference_image");
    }
  }
  if (Array.isArray(body.image_urls)) {
    for (const u of body.image_urls) push(u, "reference_image");
  }
  if (Array.isArray(body.images)) {
    for (const u of body.images) push(u, "reference_image");
  }
  // Explicit first-frame fields only (not bare image_urls)
  const first =
    firstHttpsUrl(body.input_reference) ||
    firstHttpsUrl(body.first_frame_image);
  if (first && !images.some((x) => x.url === first)) {
    images.unshift({ url: first, role: "first_frame" });
  }
  // Legacy OpenAI-style single image → first frame only when no image_urls yet
  if (!images.length) {
    const legacy =
      firstHttpsUrl(body.image) || firstHttpsUrl(body.image_url);
    if (legacy) images.push({ url: legacy, role: "first_frame" });
  }
  if (body.last_frame_image) push(body.last_frame_image, "last_frame");

  const videos = [];
  if (Array.isArray(body.video_urls)) {
    for (const u of body.video_urls) {
      const url = firstHttpsUrl(u);
      if (url) videos.push({ url });
    }
  }
  if (Array.isArray(body.videos)) {
    for (const u of body.videos) {
      const url = firstHttpsUrl(u);
      if (url) videos.push({ url });
    }
  }
  const vidOne = firstHttpsUrl(body.video_url);
  if (vidOne) videos.push({ url: vidOne });
  if (videos.length) extra.reference_videos = videos;

  const audios = [];
  if (Array.isArray(body.audio_urls)) {
    for (const u of body.audio_urls) {
      const url = firstHttpsUrl(u);
      if (url) audios.push({ url });
    }
  }
  if (Array.isArray(body.audios)) {
    for (const u of body.audios) {
      const url = firstHttpsUrl(u);
      if (url) audios.push({ url });
    }
  }
  const audOne = firstHttpsUrl(body.audio_url);
  if (audOne) audios.push({ url: audOne });
  if (audios.length) extra.reference_audios = audios;

  const genType = String(body.generation_type || "").toLowerCase();
  const multimodal = videos.length > 0 || audios.length > 0;
  const hasRefRole = images.some((im) => im.role === "reference_image");
  const hasFrameRole = images.some(
    (im) => im.role === "first_frame" || im.role === "last_frame"
  );
  // Explicit user choice:
  //   generation_type=first_frame|i2v  → first-frame path (even if image_urls)
  //   generation_type=reference / multimodal / reference_image → reference path
  //   first_frame_image alone → first-frame
  //   image_urls alone → reference (single image OK)
  const forceFirst =
    !multimodal &&
    (genType === "first_frame" ||
      genType === "i2v" ||
      (hasFrameRole && !hasRefRole && genType !== "reference"));
  const wantReference =
    !forceFirst &&
    (multimodal ||
      genType === "reference" ||
      hasRefRole ||
      images.length > 1);

  if (images.length) {
    if (forceFirst) {
      if (images.length === 1) {
        out.input_reference = { url: images[0].url };
      } else {
        // first + last (and optional middle) under frame family
        extra.reference_images = images.map((im, i) => ({
          url: im.url,
          role:
            im.role === "first_frame" || im.role === "last_frame"
              ? im.role
              : i === 0
                ? "first_frame"
                : i === images.length - 1
                  ? "last_frame"
                  : "reference_image",
        }));
      }
    } else if (wantReference) {
      extra.reference_images = images.map((im) => {
        let role = im.role || "reference_image";
        if (
          genType === "reference" &&
          (role === "first_frame" || role === "last_frame")
        ) {
          role = "reference_image";
        }
        return { url: im.url, role };
      });
    } else if (images.length === 1 && images[0].role === "first_frame") {
      out.input_reference = { url: images[0].url };
    } else {
      extra.reference_images = images.map((im) => ({
        url: im.url,
        role: im.role || "reference_image",
      }));
    }
  }
  if (Object.keys(extra).length) out.extra = extra;
  return out;
}

function mapAspectToGrsai(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "landscape";
  if (s === "16:9" || s === "landscape" || s === "horizontal") return "landscape";
  if (s === "9:16" || s === "portrait" || s === "vertical") return "portrait";
  // Upstream only documents portrait | landscape (no square).
  return "landscape";
}

function buildGrsaiVideoBody(meta, body) {
  const est = meta.estimate || {};
  let duration = Number(body.duration ?? body.seconds ?? est.default_seconds ?? 5);
  if (!Number.isFinite(duration) || duration <= 0) duration = 5;
  // resolution ONLY from resolution field (or size if it looks like a tier — never aspect)
  let resolution = String(body.resolution || "").toLowerCase();
  if (!resolution) {
    const sz = String(body.size || "").toLowerCase();
    if (/^(480p|768p|1080p|2k)$/.test(sz)) resolution = sz;
  }
  if (!resolution) resolution = String(est.default_resolution || "768p").toLowerCase();
  if (resolution === "2k") resolution = "1080p";
  if (!/^(480p|768p|1080p)$/.test(resolution)) resolution = "768p";
  // 1080p max 10s (inventory rule)
  if (resolution === "1080p" && duration > 10) duration = 10;
  if (duration > 15) duration = 15;
  if (duration < 1) duration = 1;

  const out = {
    model: String(meta.upstream_model || "minimax-h3"),
    prompt: String(body.prompt || body.text || ""),
    duration,
    resolution,
    aspectRatio: mapAspectToGrsai(
      body.aspectRatio || body.aspect_ratio || body.ratio
    ),
    // Official Grsai contract: replyType=async returns {id,status:running}
    // immediately. Poll with GET /v1/api/result?id= while status is running.
    replyType: "async",
  };

  // images: native `images` + aliases image_urls / image_url only
  // (first_frame_* / image_with_roles rejected in validateVideoClientBody)
  const images = [];
  const pushImg = (u) => {
    if (typeof u === "string" && u) images.push(u);
    else if (u && typeof u === "object" && u.url) images.push(String(u.url));
  };
  if (Array.isArray(body.images)) for (const u of body.images) pushImg(u);
  if (Array.isArray(body.image_urls)) for (const u of body.image_urls) pushImg(u);
  if (typeof body.image_url === "string") pushImg(body.image_url);
  if (images.length) out.images = images.slice(0, 9);

  // audios: prefer native `audios`
  const audios = [];
  const pushAud = (u) => {
    if (typeof u === "string" && u) audios.push(u);
    else if (u && typeof u === "object" && u.url) audios.push(String(u.url));
  };
  if (Array.isArray(body.audios)) for (const u of body.audios) pushAud(u);
  if (Array.isArray(body.audio_urls)) for (const u of body.audio_urls) pushAud(u);
  if (typeof body.audio_url === "string") pushAud(body.audio_url);
  if (audios.length) out.audios = audios.slice(0, 3);

  if (body.seed != null && Number.isFinite(Number(body.seed))) {
    out.seed = Number(body.seed);
  }
  return out;
}


export {
  firstHttpsUrl,
  validateVideoClientBody,
  normalizeApimartClientBody,
  buildOpenluxGrok15Body,
  buildAioneVideoBody,
  buildGrsaiVideoBody,
  mapAspectToAione,
  mapAspectToGrsai,
  scanBodyMedia,
  hasAnyMedia,
};
