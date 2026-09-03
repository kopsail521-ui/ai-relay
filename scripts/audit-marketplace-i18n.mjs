/**
 * 全量审计：线上全部模型 × 7 语简介/标签/注入逻辑
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const LANGS = ["zhCN", "zhTW", "en", "fr", "ru", "ja", "vi"];

spawnSync(process.execPath, [path.join(__dirname, "_gen-marketplace-copy.mjs")], {
  cwd: root,
  stdio: "inherit",
});
spawnSync(process.execPath, [path.join(__dirname, "rebuild-moderation-i18n.mjs")], {
  cwd: root,
  stdio: "inherit",
});

const livePath = process.env.TEMP
  ? path.join(process.env.TEMP, "keyo-pricing.json")
  : path.join(root, "_tmp_live_pricing.json");
if (!fs.existsSync(livePath)) {
  console.error("缺少线上 pricing 缓存:", livePath);
  process.exit(2);
}

const live = JSON.parse(fs.readFileSync(livePath, "utf8"));
const copy = JSON.parse(
  fs.readFileSync(path.join(root, "config/marketplace-model-copy.json"), "utf8")
);
const tags = copy.__tags__ || {};
const models = live.data || [];
const copyModels = Object.keys(copy).filter((k) => !k.startsWith("__"));

const report = {
  liveModels: models.length,
  copyModels: copyModels.length,
  missingFromCopy: [],
  emptyDesc: [],
  incompleteLangs: [],
  sameAsZhCN: [],
  missingTagsOnModels: [],
  tagLangGaps: {},
  unitStats: {},
  injectChecks: {},
  liveVsLocal: {},
};

for (const m of models) {
  const name = m.model_name;
  const entry = copy[name];
  if (!entry) {
    report.missingFromCopy.push(name);
    continue;
  }
  const d = entry.descriptions || {};
  const missing = LANGS.filter((L) => !(d[L] && String(d[L]).trim()));
  if (missing.length) report.incompleteLangs.push({ name, missing });
  for (const L of LANGS) {
    if (!(d[L] && String(d[L]).trim())) report.emptyDesc.push(`${name}@${L}`);
  }
  for (const L of ["en", "fr", "ru", "ja", "vi"]) {
    if (d[L] && d.zhCN && d[L] === d.zhCN) report.sameAsZhCN.push(`${name}@${L}`);
  }
  const unit = entry.unit || "?";
  report.unitStats[unit] = (report.unitStats[unit] || 0) + 1;
  if (m.tags && !tags[m.tags]) report.missingTagsOnModels.push(`${name}:${m.tags}`);
}

for (const [tag, bag] of Object.entries(tags)) {
  const miss = LANGS.filter((L) => !(bag[L] && String(bag[L]).trim()));
  if (miss.length) report.tagLangGaps[tag] = miss;
}

const server = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/server.mjs"),
  "utf8"
);
const docker = fs.readFileSync(
  path.join(root, "services/creem-moderation-proxy/Dockerfile"),
  "utf8"
);
const svcCopyPath = path.join(
  root,
  "services/creem-moderation-proxy/marketplace-model-copy.json"
);
const svcCopy = fs.existsSync(svcCopyPath)
  ? JSON.parse(fs.readFileSync(svcCopyPath, "utf8"))
  : null;

report.injectChecks = {
  pickTag: server.includes("pickTag(tag)"),
  langList: server.includes('["zhCN","zhTW","en","fr","ru","ja","vi"]'),
  reloadOnChange: /i18nextLng[\s\S]{0,200}location\.reload/.test(server),
  injectV6: server.includes("keyo-pricing-sort-v6"),
  dockerCopiesJson: /COPY .*marketplace-model-copy\.json/.test(docker),
  svcCopyModels: svcCopy
    ? Object.keys(svcCopy).filter((k) => !k.startsWith("__")).length
    : 0,
  svcSynced: svcCopy ? JSON.stringify(svcCopy) === JSON.stringify(copy) : false,
  hasTagsMeta: !!(copy.__tags__ && Object.keys(copy.__tags__).length),
};

for (const n of [
  "gpt-5.6-terra",
  "claude-fable-5-1",
  "whisper-large-v3-turbo",
  "Duix-Avatar",
  "Qwen3-TTS",
  "gemma-4-26B-A4B-it",
]) {
  const m = models.find((x) => x.model_name === n);
  const e = copy[n];
  report.liveVsLocal[n] = {
    liveDescHead: (m?.description || "").slice(0, 50),
    langs: e ? LANGS.filter((L) => e.descriptions?.[L]).length : 0,
    jaHead: (e?.descriptions?.ja || "").slice(0, 40),
    frHead: (e?.descriptions?.fr || "").slice(0, 40),
    unit: e?.unit,
    tag: m?.tags,
  };
}

const failReasons = [];
if (report.missingFromCopy.length) failReasons.push("missingFromCopy");
if (report.emptyDesc.length) failReasons.push("emptyDesc");
if (report.incompleteLangs.length) failReasons.push("incompleteLangs");
if (report.sameAsZhCN.length) failReasons.push("sameAsZhCN");
if (report.missingTagsOnModels.length) failReasons.push("missingTagsOnModels");
if (Object.keys(report.tagLangGaps).length) failReasons.push("tagLangGaps");
if (!report.injectChecks.pickTag) failReasons.push("noPickTag");
if (!report.injectChecks.langList) failReasons.push("noLangList");
if (!report.injectChecks.reloadOnChange) failReasons.push("noReload");
if (!report.injectChecks.dockerCopiesJson) failReasons.push("dockerNoJson");
if (!report.injectChecks.svcSynced) failReasons.push("svcCopyNotSynced");
if (report.injectChecks.svcCopyModels !== report.copyModels)
  failReasons.push("svcCopyCountMismatch");
if (report.copyModels !== report.liveModels) failReasons.push("copyCount!=liveCount");

report.PASS = failReasons.length === 0;
report.failReasons = failReasons;

console.log(JSON.stringify(report, null, 2));
process.exit(report.PASS ? 0 : 1);
