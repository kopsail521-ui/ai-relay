const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");

const PORT = Number(process.env.PORT || 3100);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "models.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sessions = new Map();

const SEED = [
  {
    id: "gpt-image-2",
    name: "gpt-image-2",
    kind: "image",
    enabled: true,
    costPerCall: 0.045,
    sellPerCall: 0.135,
    officialPerCall: 1.5,
    note: "文生图/图生图 1K；上游约 ¥0.03~0.06/次",
  },
  {
    id: "gpt-image-2-vip",
    name: "gpt-image-2-vip",
    kind: "image",
    enabled: true,
    costPerCall: 0.15,
    sellPerCall: 0.45,
    officialPerCall: 3,
    note: "支持 1K/2K/4K；上游约 ¥0.1~0.2/次",
  },
  {
    id: "nano-banana-pro",
    name: "nano-banana-pro",
    kind: "image",
    enabled: true,
    costPerCall: 0.135,
    sellPerCall: 0.405,
    officialPerCall: 2,
    note: "上游约 ¥0.09~0.18/次",
  },
  {
    id: "nano-banana-2",
    name: "nano-banana-2",
    kind: "image",
    enabled: true,
    costPerCall: 0.08,
    sellPerCall: 0.24,
    officialPerCall: 1.5,
    note: "Grsai nano-banana-2；成本/官方价请在后台改",
  },
  {
    id: "nano-banana-fast",
    name: "nano-banana-fast",
    kind: "image",
    enabled: true,
    costPerCall: 0.033,
    sellPerCall: 0.099,
    officialPerCall: 0.8,
    note: "上游约 ¥0.022~0.044/次",
  },
  {
    id: "gpt-5.6-sol",
    name: "gpt-5.6-sol",
    kind: "text",
    enabled: true,
    costIn: 3.3,
    costOut: 19.5,
    sellIn: 9.9,
    sellOut: 58.5,
    officialIn: 9,
    officialOut: 72,
    note: "¥/M tokens；高成本档 ×3 可能逼近官方，注意核对",
  },
  {
    id: "gpt-5.4",
    name: "gpt-5.4",
    kind: "text",
    enabled: true,
    costIn: 1.05,
    costOut: 9,
    sellIn: 3.15,
    sellOut: 27,
    officialIn: 9,
    officialOut: 72,
    note: "主推便宜档",
  },
  {
    id: "gpt-5.6-terra",
    name: "gpt-5.6-terra",
    kind: "text",
    enabled: true,
    costIn: 1.35,
    costOut: 7.8,
    sellIn: 4.05,
    sellOut: 23.4,
    officialIn: 9,
    officialOut: 72,
    note: "主推便宜档",
  },
  {
    id: "gpt-5.5",
    name: "gpt-5.5",
    kind: "text",
    enabled: true,
    costIn: 3.3,
    costOut: 20.25,
    sellIn: 9.9,
    sellOut: 60.75,
    officialIn: 9,
    officialOut: 72,
    note: "与 sol 类似，留意官方对照",
  },
  {
    id: "gemini-3-flash",
    name: "gemini-3-flash",
    kind: "text",
    enabled: true,
    costIn: 0.6,
    costOut: 4.5,
    sellIn: 1.8,
    sellOut: 13.5,
    officialIn: 3.6,
    officialOut: 21.6,
    note: "对话+识图；官方约按 OpenRouter $0.5/$3 折算",
  },
  {
    id: "gemini-3.1-pro",
    name: "gemini-3.1-pro",
    kind: "text",
    enabled: true,
    costIn: 2.25,
    costOut: 10.5,
    sellIn: 6.75,
    sellOut: 31.5,
    officialIn: 14.4,
    officialOut: 86.4,
    note: "对话+识图+推理",
  },
  {
    id: "gemini-3-pro",
    name: "gemini-3-pro",
    kind: "text",
    enabled: true,
    costIn: 2.25,
    costOut: 10.5,
    sellIn: 6.75,
    sellOut: 31.5,
    officialIn: 14.4,
    officialOut: 86.4,
    note: "对话+识图+推理",
  },
];

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    saveModels(SEED);
  }
}

function loadModels() {
  ensureData();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveModels(models) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(models, null, 2), "utf8");
}

function marginPct(cost, sell) {
  if (cost == null || sell == null || sell === 0) return null;
  return Math.round(((sell - cost) / sell) * 1000) / 10;
}

function vsOfficialPct(sell, official) {
  if (sell == null || official == null || official === 0) return null;
  return Math.round((1 - sell / official) * 1000) / 10;
}

function enrich(model) {
  const row = { ...model };
  if (model.kind === "image") {
    row.marginPct = marginPct(model.costPerCall, model.sellPerCall);
    row.cheaperThanOfficialPct = vsOfficialPct(
      model.sellPerCall,
      model.officialPerCall
    );
  } else {
    row.marginInPct = marginPct(model.costIn, model.sellIn);
    row.marginOutPct = marginPct(model.costOut, model.sellOut);
    row.cheaperInPct = vsOfficialPct(model.sellIn, model.officialIn);
    row.cheaperOutPct = vsOfficialPct(model.sellOut, model.officialOut);
  }
  return row;
}

function newSession() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function authRequired(req, res, next) {
  const token = req.cookies.session;
  const exp = token && sessions.get(token);
  if (!exp || exp < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ ok: false, error: "未登录" });
  }
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  next();
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "pricing-admin" });
});

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ ok: false, error: "密码错误" });
  }
  const token = newSession();
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
  });
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const token = req.cookies.session;
  if (token) sessions.delete(token);
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const token = req.cookies.session;
  const exp = token && sessions.get(token);
  res.json({ ok: true, loggedIn: Boolean(exp && exp >= Date.now()) });
});

app.get("/api/models", authRequired, (_req, res) => {
  const models = loadModels().map(enrich);
  res.json({ ok: true, models, currencyHint: "文本为 ¥/M tokens；图片为 ¥/次" });
});

app.put("/api/models", authRequired, (req, res) => {
  const models = req.body?.models;
  if (!Array.isArray(models)) {
    return res.status(400).json({ ok: false, error: "models 必须是数组" });
  }
  saveModels(models);
  res.json({ ok: true, models: models.map(enrich) });
});

app.post("/api/models", authRequired, (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.kind) {
    return res.status(400).json({ ok: false, error: "name 和 kind 必填" });
  }
  const models = loadModels();
  const id =
    body.id ||
    String(body.name)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
  if (models.some((m) => m.id === id || m.name === body.name)) {
    return res.status(409).json({ ok: false, error: "模型已存在" });
  }
  const row = {
    id,
    name: body.name,
    kind: body.kind,
    enabled: body.enabled !== false,
    note: body.note || "",
  };
  if (body.kind === "image") {
    row.costPerCall = Number(body.costPerCall || 0);
    row.sellPerCall = Number(body.sellPerCall || 0);
    row.officialPerCall = Number(body.officialPerCall || 0);
  } else {
    row.costIn = Number(body.costIn || 0);
    row.costOut = Number(body.costOut || 0);
    row.sellIn = Number(body.sellIn || 0);
    row.sellOut = Number(body.sellOut || 0);
    row.officialIn = Number(body.officialIn || 0);
    row.officialOut = Number(body.officialOut || 0);
  }
  models.push(row);
  saveModels(models);
  res.json({ ok: true, model: enrich(row) });
});

app.patch("/api/models/:id", authRequired, (req, res) => {
  const models = loadModels();
  const idx = models.findIndex((m) => m.id === req.params.id);
  if (idx < 0) return res.status(404).json({ ok: false, error: "未找到" });
  const next = { ...models[idx], ...req.body, id: models[idx].id };
  models[idx] = next;
  saveModels(models);
  res.json({ ok: true, model: enrich(next) });
});

app.delete("/api/models/:id", authRequired, (req, res) => {
  const models = loadModels().filter((m) => m.id !== req.params.id);
  saveModels(models);
  res.json({ ok: true });
});

app.post("/api/seed", authRequired, (_req, res) => {
  saveModels(SEED);
  res.json({ ok: true, models: SEED.map(enrich) });
});

app.get("/api/export.csv", authRequired, (_req, res) => {
  const models = loadModels().map(enrich);
  const lines = [
    "id,name,kind,cost_in_or_call,cost_out,sell_in_or_call,sell_out,official_in_or_call,official_out,margin_pct,vs_official_pct,note",
  ];
  for (const m of models) {
    if (m.kind === "image") {
      lines.push(
        [
          m.id,
          m.name,
          m.kind,
          m.costPerCall,
          "",
          m.sellPerCall,
          "",
          m.officialPerCall,
          "",
          m.marginPct,
          m.cheaperThanOfficialPct,
          JSON.stringify(m.note || ""),
        ].join(",")
      );
    } else {
      lines.push(
        [
          m.id,
          m.name,
          m.kind,
          m.costIn,
          m.costOut,
          m.sellIn,
          m.sellOut,
          m.officialIn,
          m.officialOut,
          `${m.marginInPct}/${m.marginOutPct}`,
          `${m.cheaperInPct}/${m.cheaperOutPct}`,
          JSON.stringify(m.note || ""),
        ].join(",")
      );
    }
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="pricing.csv"'
  );
  res.send("\uFEFF" + lines.join("\n"));
});

ensureData();
app.listen(PORT, () => {
  console.log(`Pricing admin: http://localhost:${PORT}`);
  console.log(`Default password: ${ADMIN_PASSWORD}`);
});
