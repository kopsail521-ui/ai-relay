/**
 * Synthetic public /api/rankings payload.
 * Day-seeded (Asia/Shanghai): stable within a calendar day, drifts daily.
 * Display-only — does not touch DB or billing.
 */

const ENABLED = !/^(0|false|off|no)$/i.test(
  String(process.env.RANKINGS_SYNTHETIC ?? "1").trim()
);

/** Stable catalog of models users actually see on /pricing. */
const MODEL_POOL = [
  { name: "glm-5.3", vendor: "智谱", w: 118 },
  { name: "gpt-5.6-terra", vendor: "OpenAI", w: 96 },
  { name: "claude-sonnet-5-5", vendor: "Anthropic", w: 88 },
  { name: "deepseek-v4-pro", vendor: "DeepSeek", w: 82 },
  { name: "gemini-3.8-flash", vendor: "Google", w: 74 },
  { name: "gpt-5.6-luna", vendor: "OpenAI", w: 68 },
  { name: "kimi-k3", vendor: "Moonshot", w: 62 },
  { name: "MiniMax-M3", vendor: "MiniMax", w: 58 },
  { name: "grok-4.7", vendor: "xAI", w: 54 },
  { name: "claude-opus-5-5", vendor: "Anthropic", w: 50 },
  { name: "glm-5.3-flash", vendor: "智谱", w: 46 },
  { name: "qwen3.8-max-0902", vendor: "阿里巴巴", w: 44 },
  { name: "gpt-6-astra", vendor: "OpenAI", w: 40 },
  { name: "deepseek-v4.1-flash", vendor: "DeepSeek", w: 36 },
  { name: "gpt-image-2", vendor: "OpenAI", w: 32 },
  { name: "gemini-3.7-flash", vendor: "Google", w: 28 },
  { name: "claude-fable-5-1", vendor: "Anthropic", w: 26 },
  { name: "gpt-5.6-sol", vendor: "OpenAI", w: 16 },
];

const PERIODS = {
  today: {
    id: "today",
    buckets: 24,
    bucketMs: 3600 * 1000,
    label: (d) =>
      `${String(d.getHours()).padStart(2, "0")}:00`,
    // week-scale baseline / 7 → day; then spread across hours
    baseTotal: 3.2e8,
  },
  week: {
    id: "week",
    buckets: 7,
    bucketMs: 24 * 3600 * 1000,
    label: (d) =>
      d.toLocaleString("en-US", { month: "short", day: "numeric" }),
    baseTotal: 2.4e9,
  },
  month: {
    id: "month",
    buckets: 30,
    bucketMs: 24 * 3600 * 1000,
    label: (d) =>
      d.toLocaleString("en-US", { month: "short", day: "numeric" }),
    baseTotal: 9.5e9,
  },
  year: {
    id: "year",
    buckets: 52,
    bucketMs: 7 * 24 * 3600 * 1000,
    label: (d) =>
      d.toLocaleString("en-US", { month: "short", day: "numeric" }),
    baseTotal: 1.05e11,
  },
};

function shanghaiYmd(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function growthPct(cur, prev) {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return round4(((cur - prev) / prev) * 100);
}

function softGrowth(cur, prev, rng) {
  let g = growthPct(cur, prev);
  // Believable band; keep a few spicy movers without 9-digit %
  g = clamp(g, -42, 168);
  // Add tiny jitter so ranks don't look frozen
  g = round4(g + (rng() - 0.5) * 3.2);
  return g;
}

function weekdayFactor(date) {
  const d = date.getDay(); // 0 Sun
  if (d === 0 || d === 6) return 0.72;
  if (d === 1) return 0.92;
  if (d === 5) return 0.95;
  return 1;
}

function hourFactor(h) {
  // Business-hours hump for "today"
  if (h >= 10 && h <= 12) return 1.35;
  if (h >= 14 && h <= 18) return 1.45;
  if (h >= 19 && h <= 22) return 1.15;
  if (h >= 1 && h <= 6) return 0.35;
  return 0.85;
}

function pickWeightedModels(rng, count) {
  // Slight daily reshuffle of base weights so #1 isn't always the same
  const scored = MODEL_POOL.map((m, i) => {
    const drift = 0.72 + rng() * 0.55; // 0.72–1.27
    const novelty = i < 5 ? 1 + (rng() - 0.4) * 0.25 : 1;
    return { ...m, score: m.w * drift * novelty };
  });
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.slice(0, count);
}

function buildBucketEnds(cfg, now) {
  const ends = [];
  const end = new Date(now);
  // Align week/month/year bucket ends to local midnight-ish via ms steps from now
  for (let i = cfg.buckets - 1; i >= 0; i--) {
    ends.push(new Date(end.getTime() - i * cfg.bucketMs));
  }
  return ends;
}

function volumeProfile(cfg, bucketDate, rng) {
  let f = 0.88 + rng() * 0.28; // 0.88–1.16
  if (cfg.id === "today") {
    f *= hourFactor(bucketDate.getHours());
  } else if (cfg.id === "year") {
    // mild seasonal wave
    const m = bucketDate.getMonth();
    f *= 0.9 + 0.2 * Math.sin((m / 12) * Math.PI * 2);
  } else {
    f *= weekdayFactor(bucketDate);
  }
  return f;
}

function synthesizePeriod(period, nowMs, dayKey) {
  const cfg = PERIODS[period] || PERIODS.week;
  const rng = mulberry32(hashStr(`${dayKey}|${cfg.id}|v3`));
  const prevRng = mulberry32(hashStr(`${dayKey}|${cfg.id}|prev|v3`));

  const topN = 16;
  const histN = 10;
  const models = pickWeightedModels(rng, topN);
  // Previous period: same pool order with independent drift for growth
  const prevModels = pickWeightedModels(prevRng, topN);
  const prevByName = new Map(prevModels.map((m, i) => [m.name, { ...m, rank: i + 1 }]));

  const weightSum = models.reduce((s, m) => s + m.score, 0);
  const dayScale = 0.92 + rng() * 0.22; // day-to-day total volume
  const periodTotal = Math.round(cfg.baseTotal * dayScale);

  const bucketDates = buildBucketEnds(cfg, nowMs);
  const bucketFactors = bucketDates.map((d) => volumeProfile(cfg, d, rng));
  const factorSum = bucketFactors.reduce((s, x) => s + x, 0);

  // Per-model per-bucket tokens
  const tokensByModel = new Map();
  for (const m of models) tokensByModel.set(m.name, new Array(cfg.buckets).fill(0));

  for (let b = 0; b < cfg.buckets; b++) {
    const bucketShare = bucketFactors[b] / factorSum;
    const bucketTokens = periodTotal * bucketShare;
    for (const m of models) {
      const share = m.score / weightSum;
      const noise = 0.78 + rng() * 0.44; // 0.78–1.22
      tokensByModel.get(m.name)[b] = Math.max(
        1,
        Math.round(bucketTokens * share * noise)
      );
    }
  }

  // Recompute totals after noise
  const totals = models.map((m) => {
    const arr = tokensByModel.get(m.name);
    const total = arr.reduce((s, x) => s + x, 0);
    return { ...m, total };
  });
  totals.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const grand = totals.reduce((s, m) => s + m.total, 0) || 1;

  // Previous totals: scale by ~same period with different dayScale
  const prevScale = 0.85 + prevRng() * 0.35;
  const prevGrand = Math.round(cfg.baseTotal * prevScale);
  const prevWeightSum = prevModels.reduce((s, m) => s + m.score, 0) || 1;
  const prevTotalByName = new Map();
  for (const m of prevModels) {
    prevTotalByName.set(
      m.name,
      Math.max(1, Math.round((prevGrand * m.score) / prevWeightSum))
    );
  }

  const ranked = totals.map((m, idx) => {
    const prev = prevByName.get(m.name);
    const prevTokens = prevTotalByName.get(m.name) || Math.round(m.total * 0.7);
    const growth = softGrowth(m.total, prevTokens, rng);
    return {
      rank: idx + 1,
      previous_rank: prev ? prev.rank : undefined,
      model_name: m.name,
      vendor: m.vendor,
      category: "all",
      total_tokens: m.total,
      share: round4(m.total / grand),
      growth_pct: growth,
    };
  });

  // Vendors
  const vendorMap = new Map();
  for (const row of ranked) {
    let v = vendorMap.get(row.vendor);
    if (!v) {
      v = {
        vendor: row.vendor,
        total_tokens: 0,
        models: new Set(),
        top_model: row.model_name,
        top_tokens: 0,
        prev_tokens: 0,
      };
      vendorMap.set(row.vendor, v);
    }
    v.total_tokens += row.total_tokens;
    v.models.add(row.model_name);
    if (row.total_tokens > v.top_tokens) {
      v.top_tokens = row.total_tokens;
      v.top_model = row.model_name;
    }
    v.prev_tokens += prevTotalByName.get(row.model_name) || 0;
  }
  const vendors = [...vendorMap.values()]
    .sort((a, b) => b.total_tokens - a.total_tokens)
    .map((v, i) => ({
      rank: i + 1,
      vendor: v.vendor,
      total_tokens: v.total_tokens,
      share: round4(v.total_tokens / grand),
      growth_pct: softGrowth(v.total_tokens, v.prev_tokens || 1, rng),
      models_count: v.models.size,
      top_model: v.top_model,
    }));

  // History: top histN + Others
  const histModels = totals.slice(0, histN);
  const histNames = new Set(histModels.map((m) => m.name));
  const modelsHistoryModels = histModels.map((m) => ({
    name: m.name,
    vendor: m.vendor,
    total: m.total,
  }));
  let otherTotal = 0;
  for (const m of totals) {
    if (!histNames.has(m.name)) otherTotal += m.total;
  }
  if (otherTotal > 0) {
    modelsHistoryModels.push({
      name: "Others",
      vendor: "Various",
      total: otherTotal,
    });
  }

  const points = [];
  for (let b = 0; b < cfg.buckets; b++) {
    const d = bucketDates[b];
    const ts = new Date(d).toISOString();
    const label = cfg.label(d);
    for (const m of histModels) {
      points.push({
        ts,
        label,
        model: m.name,
        vendor: m.vendor,
        tokens: tokensByModel.get(m.name)[b],
      });
    }
    if (otherTotal > 0) {
      let o = 0;
      for (const m of totals) {
        if (!histNames.has(m.name)) o += tokensByModel.get(m.name)[b];
      }
      if (o > 0) {
        points.push({
          ts,
          label,
          model: "Others",
          vendor: "Various",
          tokens: o,
        });
      }
    }
  }

  // Vendor share history (top 5 + Others)
  const topVendors = vendors.slice(0, 5);
  const topVendorNames = new Set(topVendors.map((v) => v.vendor));
  const vendorPoints = [];
  const vendorSeriesVendors = topVendors.map((v) => ({
    name: v.vendor,
    total: v.total_tokens,
    share: v.share,
  }));
  let vendorOther = 0;
  for (const v of vendors) {
    if (!topVendorNames.has(v.vendor)) vendorOther += v.total_tokens;
  }
  if (vendorOther > 0) {
    vendorSeriesVendors.push({
      name: "Others",
      total: vendorOther,
      share: round4(vendorOther / grand),
    });
  }

  for (let b = 0; b < cfg.buckets; b++) {
    const d = bucketDates[b];
    const ts = new Date(d).toISOString();
    const label = cfg.label(d);
    const byVendor = new Map();
    for (const m of totals) {
      const t = tokensByModel.get(m.name)[b];
      const key = topVendorNames.has(m.vendor) ? m.vendor : "Others";
      byVendor.set(key, (byVendor.get(key) || 0) + t);
    }
    const bucketSum = [...byVendor.values()].reduce((s, x) => s + x, 0) || 1;
    for (const [vendor, tokens] of byVendor) {
      vendorPoints.push({
        ts,
        label,
        vendor,
        tokens,
        share: round4(tokens / bucketSum),
      });
    }
  }

  // Movers / droppers from rank delta
  const withDelta = ranked
    .filter((r) => r.previous_rank != null)
    .map((r) => ({
      model_name: r.model_name,
      vendor: r.vendor,
      rank_delta: (r.previous_rank || r.rank) - r.rank,
      current_rank: r.rank,
      growth_pct: r.growth_pct,
    }));
  const movers = [...withDelta]
    .filter((x) => x.rank_delta > 0)
    .sort((a, b) => b.rank_delta - a.rank_delta || b.growth_pct - a.growth_pct)
    .slice(0, 6);
  const droppers = [...withDelta]
    .filter((x) => x.rank_delta < 0)
    .sort((a, b) => a.rank_delta - b.rank_delta || a.growth_pct - b.growth_pct)
    .slice(0, 6);

  return {
    models: ranked,
    vendors,
    top_movers: movers,
    top_droppers: droppers,
    models_history: {
      points,
      models: modelsHistoryModels,
      buckets: cfg.buckets,
    },
    vendor_share_history: {
      points: vendorPoints,
      vendors: vendorSeriesVendors,
      buckets: cfg.buckets,
    },
    __keyo_rankings_synth: 1,
    __keyo_rankings_day: dayKey,
  };
}

export function rankingsSyntheticEnabled() {
  return ENABLED;
}

export function buildSyntheticRankings(periodQuery) {
  const period = String(periodQuery || "week").toLowerCase();
  const now = Date.now();
  const dayKey = shanghaiYmd(now);
  const data = synthesizePeriod(
    PERIODS[period] ? period : "week",
    now,
    dayKey
  );
  return { success: true, data };
}
