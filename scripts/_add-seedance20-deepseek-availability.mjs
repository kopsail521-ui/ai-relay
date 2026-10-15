// One-off: add seedance-2-0 pricing landing (video line complete) and the
// DeepSeek availability troubleshooting content landing.
// Sources: config/apimart-selected-models.json (2.0 SKU prices),
// static/brand/keyo-api-ref.html §5.2 (2.0 SKU table, duration 4-15).
// Run from repo root: node scripts/_add-seedance20-deepseek-availability.mjs
import fs from "fs";
import path from "path";

// ---------- 1) pricing-landings.json ----------
const plFile = path.resolve("config/seo/pricing-landings.json");
const pl = JSON.parse(fs.readFileSync(plFile, "utf8"));

const POLL_PLURAL = "# Poll GET /v1/tasks/{id} with the same key: processing = still rendering, completed = ready url";
const OFFICIAL = "ByteDance Seedance list — verify on volcengine.com before budgeting";

const seedance20 = {
  slug: "seedance-2-0-api-pricing",
  navLabel: "Seedance 2.0 pricing",
  h1: "Seedance 2.0 API Pricing — KeyoAPI Video Generation Rates",
  title: "Seedance 2.0 API Pricing | KeyoAPI",
  metaDescription: "Seedance 2.0 API pricing on KeyoAPI: six fixed-resolution SKUs from ~$0.0499/sec (720p-mini) to ~$0.1006/sec (1080p), 4–15 second clips. No free Seedance tier — $0 prototyping IDs on the same key.",
  targetKeywords: ["seedance 2.0 api pricing", "seedance 2.0 free", "seedance 2.0 api price"],
  lead: "Seedance 2.0 video generation API. KeyoAPI hosts all six fixed-resolution Seedance 2.0 SKUs — 1080p / 720p in standard, fast and mini — billed per generated second on one prepaid key.",
  rows: [
    { model: "seedance-2.0-1080p", official: OFFICIAL, keyo: "~$0.1006 / second", note: "1080p standard · POST /v1/videos/generations" },
    { model: "seedance-2.0-1080p-fast", official: OFFICIAL, keyo: "~$0.0754 / second", note: "1080p fast tier · POST /v1/videos/generations" },
    { model: "seedance-2.0-1080p-mini", official: OFFICIAL, keyo: "~$0.0501 / second", note: "1080p mini tier · POST /v1/videos/generations" },
    { model: "seedance-2.0-720p", official: OFFICIAL, keyo: "~$0.0962 / second", note: "720p standard · POST /v1/videos/generations" },
    { model: "seedance-2.0-720p-fast", official: OFFICIAL, keyo: "~$0.0748 / second", note: "720p fast tier · POST /v1/videos/generations" },
    { model: "seedance-2.0-720p-mini", official: OFFICIAL, keyo: "~$0.0499 / second", note: "720p mini tier · POST /v1/videos/generations" }
  ],
  freeKiller: {
    title: "No free Seedance tier — prototype at $0 anyway",
    body: "Keyo ships no free Seedance ID, but the fixed free catalog IDs cost $0 per call and draw down your $10 welcome credit (fair-use rate limits). Warm up your video pipeline at $0, then switch model= to a seedance-2.0 SKU on the same base URL and key — the mini tiers start around five cents per generated second."
  },
  body: [
    "Seedance 2.0 is ByteDance's prior-generation video family, still fully supported on KeyoAPI. Every SKU has the resolution baked into the model ID — 1080p or 720p in standard, fast and mini variants — so you pick price and latency in the model string itself: POST /v1/videos/generations with model=seedance-2.0-720p-mini is the cheapest entry at about $0.0499 per generated second.",
    "Clips run 4 to 15 seconds (default 5); duration or seconds is the only extra field you usually need. Image inputs follow the Seedance conventions: first_frame_image for a first frame, image_urls for reference generation, image_with_roles for first+last frame. Keyo rates above are indicative sell prices from the live Keyo catalog — confirm the interactive card under /pricing before volume.",
    "For the current-generation flagship see Seedance 2.5 pricing; for other video lanes on the same key see MiniMax-H3, FLUX.3 Video, Wan 3.0 and Agnes Video 2.5 on /pricing-list."
  ],
  faqs: [
    { q: "Is there a free Seedance 2.0 API?", a: "No free Seedance ID exists on Keyo. The $0 path is the fixed free catalog IDs (covered by your $10 welcome credit, fair-use rate limits) for pipeline prototyping, then switch model= to a seedance-2.0 SKU. The cheapest paid tier is seedance-2.0-720p-mini at about $0.0499 per generated second." },
    { q: "What is the difference between standard, fast and mini Seedance 2.0 tiers?", a: "Same resolution family, different cost/latency/quality trade-offs: standard is the full-quality tier, fast prioritizes turnaround at a lower per-second rate, and mini is the budget tier. All three bill per generated second." },
    { q: "How long can a Seedance 2.0 clip be?", a: "4 to 15 seconds, default 5 — the same window as Seedance 2.5. Requests outside that range are rejected rather than clamped." }
  ],
  curlExample: `curl https://www.keyoapi.xyz/v1/videos/generations \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"seedance-2.0-1080p","prompt":"A red paper boat drifting on calm water at sunset","duration":5}'
${POLL_PLURAL}`
};

// Insert BEFORE the 2.5 page so landingByModel (first page wins) maps the
// 2.0 SKUs to this page for pricing-list / models Guide links.
// NB: index must be computed AFTER the filter (idempotent re-runs).
pl.pages = pl.pages.filter((p) => p.slug !== seedance20.slug);
const idx = pl.pages.findIndex((p) => p.slug === "seedance-2-5-api-pricing");
if (idx >= 0) pl.pages.splice(idx, 0, seedance20);
else pl.pages.push(seedance20);
fs.writeFileSync(plFile, JSON.stringify(pl, null, 2) + "\n");
console.log("OK pricing landing:", seedance20.slug, "rows:", seedance20.rows.length);

// ---------- 2) content-landings.json ----------
const clFile = path.resolve("config/seo/content-landings.json");
const cl = JSON.parse(fs.readFileSync(clFile, "utf8"));

const smokeCurl = `curl https://www.keyoapi.xyz/v1/chat/completions \\
  -H "Authorization: Bearer $KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"deepseek-v4.1-flash","messages":[{"role":"user","content":"ping"}],"max_tokens":1}'`;

const deepseekPage = {
  slug: "deepseek-server-unavailable",
  kind: "troubleshooting",
  title: "DeepSeek API Server Unavailable: Causes, Retries and Fallback | KeyoAPI",
  h1: "DeepSeek API server unavailable: diagnose, retry, fall back",
  metaDescription: "DeepSeek API returning server unavailable or overloaded errors? Separate upstream capacity problems from your own code, build bounded retries with backoff, and fall back to a second model on the same key.",
  lead: "A server unavailable error from a DeepSeek endpoint is almost always upstream capacity — rate limits, overloaded nodes or a timed-out request — not a problem with your API key. This page walks through confirming the cause, building a bounded retry policy, and falling back to a second model on the same key.",
  sections: [
    {
      heading: "What server unavailable actually means",
      paragraphs: [
        "DeepSeek lanes surface capacity pressure as HTTP 5xx responses — 500/502/503, timeout-style failures, or 429 when the limit is rate rather than capacity. None of these mean your credentials are wrong: auth failures come back 401 with a clear message. The response usually carries a request id; keep it, it is what support needs if an error persists.",
        "On a relay like KeyoAPI the same status codes mean the same thing: the upstream DeepSeek capacity was unavailable for that attempt. Your client decides whether to retry, and how hard."
      ]
    },
    {
      heading: "Confirm it is the upstream, not your code",
      paragraphs: [
        "Three checks separate capacity errors from client bugs: the same key works on a cheaper model, the error reproduces across several minutes rather than only once, and the failing requests are spread across different prompts rather than one oversized payload. If all three point to capacity, retries and fallback are the right response.",
        "The one-token smoke test against the flash lane is the fastest first check — if this answers while the heavier lane fails, capacity is the issue and a fallback model is the right move."
      ],
      code: smokeCurl
    },
    {
      heading: "Build a bounded retry policy",
      paragraphs: [
        "Retry only what is retryable — 408, 429 and 5xx status codes and network timeouts — and cap attempts at three or four. Space them with exponential backoff plus jitter: sleep for min(0.5 × 2^attempt, 8) seconds scaled by a random 0.5–1.5 factor, so concurrent workers do not re-stampede the same upstream. A shared retry budget across your workers keeps retry amplification bounded when an upstream degrades."
      ]
    },
    {
      heading: "Fall back to a second model on the same key",
      paragraphs: [
        "Retries only help when capacity comes back. For hard deadlines, switch model= instead: deepseek-v4.1-flash for cheap classification, deepseek-v4-pro-0813 when you need the heavier lane, or glm-5.3 / kimi-k3 as cross-vendor chat alternatives. The base URL and API key do not change — fallback is a one-field switch in the request body.",
        "Treat fallback as a deliberate route, not a silent rewrite: log which model served each response, because pricing and output shape differ per lane. Live rates for every fallback candidate are on /pricing-list and the deepseek lane is covered in detail on /deepseek-api-pricing."
      ]
    },
    {
      heading: "Run DeepSeek inside agent harnesses without melting capacity",
      paragraphs: [
        "Agent and eval harnesses multiply capacity problems: dozens of workers each firing multi-step chains turn one slow upstream into a self-inflicted outage. Bound the harness the same way you bound retries — a hard concurrency cap on in-flight DeepSeek calls, a per-stage timeout (planner, tool, critic) rather than one global timeout, and a single shared retry budget so a degraded lane throttles the whole harness instead of queueing forever.",
        "Make harness steps idempotent where you can, checkpoint intermediate state between steps, and put the cheapest model on the highest-frequency step. A harness that burns deepseek-v4.1-flash on routing and reserves deepseek-v4-pro for the hard steps survives upstream wobble far better than one that sends every step to the heaviest lane."
      ]
    },
    {
      heading: "Watch cost amplification while you retry",
      paragraphs: [
        "Every retry of a timed-out request risks paying twice if the first attempt eventually completes upstream. For expensive calls, prefer idempotency keys or at-least-once accounting in your own logs, and stop retrying non-idempotent tool-triggering requests automatically — surface those to the orchestrator instead.",
        "Retry storms also inflate spend indirectly: a 4-request retry policy against a 5-second timeout can triple your effective request count exactly when the upstream is slowest. The concurrency cap from the harness section is the guardrail that keeps this bounded."
      ]
    },
    {
      heading: "A practical response checklist",
      headers: ["Symptom", "First response", "If it persists"],
      rows: [
        ["Single 5xx on one request", "Retry once with backoff", "Log request id, continue"],
        ["5xx across many requests, minutes", "Cut concurrency in half, keep bounded retries", "Switch model= to a fallback lane"],
        ["429 rate limit", "Honor the limit window, add jitter", "Spread load or pre-purchase capacity"],
        ["Timeouts on long prompts", "Shorten prompt or split the task", "Per-stage timeouts, checkpoint steps"],
        ["One model down, others fine", "Verify with a cheap flash request", "Run on fallback model, monitor /pricing"]
      ]
    }
  ],
  faqs: [
    { q: "Is DeepSeek down right now?", a: "We do not publish a per-vendor status page. The fastest self-check is a one-token request to deepseek-v4.1-flash on the same key — if the flash lane answers, capacity is the issue on the heavier lane, and a fallback model is the right move." },
    { q: "Does KeyoAPI retry unavailable upstreams for me?", a: "No — your client owns retry policy. That is deliberate: automatic retries behind your back make retry amplification and double-billing impossible to reason about. Keep the bounded-retry pattern from this page in your own code." },
    { q: "Which model should I fall back to?", a: "Same-family cheap lane first: deepseek-v4.1-flash for classification and routing. Cross-vendor alternatives on the same key include glm-5.3 and kimi-k3. Compare live rates on /pricing-list before committing a fallback route." }
  ],
  related: ["/deepseek-api-pricing", "/pricing-list", "/free-models", "/models"]
};

cl.pages = (cl.pages || []).filter((p) => p.slug !== deepseekPage.slug);
cl.pages.push(deepseekPage);
fs.writeFileSync(clFile, JSON.stringify(cl, null, 2) + "\n");
console.log("OK content landing:", deepseekPage.slug, "sections:", deepseekPage.sections.length);