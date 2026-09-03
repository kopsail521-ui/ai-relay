/**
 * 重构 creem-moderation-proxy：从 JSON 加载多语言简介，注入脚本动态生成（只嵌一份 MAP）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const serverPath = path.join(root, "services/creem-moderation-proxy/server.mjs");
const copySrc = path.join(root, "config/marketplace-model-copy.json");
const copyDst = path.join(root, "services/creem-moderation-proxy/marketplace-model-copy.json");

fs.copyFileSync(copySrc, copyDst);

let s = fs.readFileSync(serverPath, "utf8").replace(/\r\n/g, "\n");

function stripConst(src, name) {
  const start = src.indexOf(`const ${name} =`);
  if (start < 0) return src;
  const endMarker = "</script>`;";
  const end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error("no end for " + name);
  let j = end + endMarker.length;
  while (j < src.length && (src[j] === "\n" || src[j] === "\r")) j++;
  return src.slice(0, start) + src.slice(j);
}

s = stripConst(s, "LOCALE_DESC_SCRIPT");
s = stripConst(s, "BILLING_UNIT_SCRIPT");

// remove any leftover MARKETPLACE_COPY literal block
s = s.replace(/\nconst MARKETPLACE_COPY = \{[\s\S]*?\nfunction enrichPricingPayload\([\s\S]*?\n\}\n+/g, "\n");
s = s.replace(/\nfunction sanitizeDescription\([\s\S]*?\nfunction enrichPricingPayload\([\s\S]*?\n\}\n+/g, "\n");
s = s.replace(/\nfunction pickMarketplaceDescription\([\s\S]*?\n\}\n+/g, "\n");

if (!s.includes('import fs from "fs"')) {
  s = s.replace(
    'import { promisify } from "util";\n',
    'import { promisify } from "util";\nimport fs from "fs";\nimport path from "path";\nimport { fileURLToPath } from "url";\n'
  );
}

const loader = `
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadMarketplaceCopy() {
  const candidates = [
    path.join(__dirname, "marketplace-model-copy.json"),
    path.join(__dirname, "../../config/marketplace-model-copy.json"),
    process.env.MARKETPLACE_COPY_PATH || "",
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {}
  }
  return {};
}

const MARKETPLACE_COPY = loadMarketplaceCopy();

function sanitizeDescription(desc) {
  if (!desc) return desc;
  return String(desc)
    .replace(/售\\s*¥[\\d.]+\\/[^（\\s。]*/g, "")
    .replace(/售\\s*¥[\\d.]+\\s*\\/\\s*M\\s*tokens?/gi, "")
    .replace(/·\\s*¥[\\d.]+\\/¥[\\d.]+\\s*per\\s*M/gi, "")
    .replace(/（成本×5）/g, "")
    .replace(/成本×5/g, "")
    .replace(/¥[\\d.]+/g, "")
    .replace(/\\s{2,}/g, " ")
    .replace(/。\\s*。/g, "。")
    .trim();
}

function pickMarketplaceDescription(entry, lang) {
  if (!entry) return "";
  const d = entry.descriptions || {};
  const code = lang || "zhCN";
  return (
    d[code] ||
    d.zhCN ||
    entry.description_zh ||
    entry.description ||
    d.en ||
    entry.description_en ||
    ""
  );
}

function enrichPricingPayload(payload) {
  if (!payload || !Array.isArray(payload.data)) return payload;
  const data = payload.data.map((m) => {
    const name = m.model_name || m.model;
    const entry = name ? MARKETPLACE_COPY[name] : null;
    if (entry) {
      return { ...m, description: pickMarketplaceDescription(entry, "zhCN") };
    }
    if (m.description) {
      return { ...m, description: sanitizeDescription(m.description) };
    }
    return m;
  });
  return { ...payload, data };
}

function buildLocaleDescScript() {
  const map = JSON.stringify(MARKETPLACE_COPY);
  const js =
    "(function(){if(window.__keyoLocaleDesc)return;window.__keyoLocaleDesc=1;window.__KEYO_MKT_COPY=" +
    map +
    ';var MAP=window.__KEYO_MKT_COPY;var LANGS=["zhCN","zhTW","en","fr","ru","ja","vi"];function langCode(){try{var v=(localStorage.getItem("i18nextLng")||"").trim();if(!v&&document.documentElement)v=String(document.documentElement.lang||"");v=v.replace(/_/g,"-");var raw=v;var l=v.toLowerCase();if(LANGS.indexOf(raw)>=0)return raw;if(l==="zhcn"||l==="zh-cn"||l==="zh-hans"||l==="zh")return "zhCN";if(l==="zhtw"||l==="zh-tw"||l==="zh-hk"||l==="zh-mo"||l.indexOf("zh-hant")===0)return "zhTW";if(l.indexOf("ja")===0)return "ja";if(l.indexOf("fr")===0)return "fr";if(l.indexOf("ru")===0)return "ru";if(l.indexOf("vi")===0)return "vi";if(l.indexOf("en")===0)return "en";return "en"}catch(e){return "zhCN"}}function pickDesc(e){if(!e)return"";var code=langCode();var d=e.descriptions||{};return d[code]||d.zhCN||e.description_zh||e.description||d.en||e.description_en||""}function pickTag(tag){if(!tag)return tag;var code=langCode();var TAGS=MAP.__tags__||{};var bag=TAGS[tag];if(!bag)return tag;return bag[code]||bag.zhCN||tag}function applyPricing(d){try{if(!d||!Array.isArray(d.data))return d;for(var i=0;i<d.data.length;i++){var m=d.data[i];var n=m&&(m.model_name||m.model||m.key);var e=n&&MAP[n];if(e){var t=pickDesc(e);if(t)m.description=t}if(m.tags)m.tags=pickTag(m.tags)}}catch(err){}return d}var oparse=JSON.parse;JSON.parse=function(text){var v=oparse.apply(this,arguments);try{if(v&&Array.isArray(v.data)&&v.data[0]&&(v.data[0].model_name||v.data[0].model)&&(v.vendors||v.auto_groups||v.group_ratio!=null))applyPricing(v)}catch(e){}return v};try{var desc=Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,"responseText");if(desc&&desc.get){Object.defineProperty(XMLHttpRequest.prototype,"responseText",{configurable:true,enumerable:true,get:function(){var t=desc.get.call(this);try{if(this.readyState===4&&this.__keyoUrl&&String(this.__keyoUrl).indexOf("/api/pricing")>=0&&!this.__keyoLocaleCap){this.__keyoLocaleCap=1;var j=oparse(t);applyPricing(j);t=JSON.stringify(j)}}catch(e){}return t}})}}catch(e){}var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this.__keyoUrl=u;this.__keyoLocaleCap=0;return XO.apply(this,arguments)};var ofetch=window.fetch;window.fetch=function(){var args=arguments;return ofetch.apply(this,args).then(function(res){try{var u="";if(typeof args[0]==="string")u=args[0];else if(args[0]&&args[0].url)u=args[0].url;if(u&&u.indexOf("/api/pricing")>=0){return res.clone().json().then(function(d){applyPricing(d);return new Response(JSON.stringify(d),{status:res.status,statusText:res.statusText,headers:res.headers})}).catch(function(){return res})}}catch(e){}return res})};var last=null;try{last=localStorage.getItem("i18nextLng")}catch(e){}setInterval(function(){try{var cur=localStorage.getItem("i18nextLng");if(cur!==last){last=cur;location.reload()}}catch(e){}},500)})();';
  return "<script>" + js + "</script>";
}

function buildBillingUnitScript() {
  const js =
    '(function(){if(window.__keyoBillingUnit)return;window.__keyoBillingUnit=1;function map(){return window.__KEYO_MKT_COPY||{}}var LANGS=["zhCN","zhTW","en","fr","ru","ja","vi"];function langCode(){try{var v=(localStorage.getItem("i18nextLng")||"").trim().replace(/_/g,"-");var l=v.toLowerCase();if(LANGS.indexOf(v)>=0)return v;if(l==="zhcn"||l==="zh-cn"||l==="zh-hans"||l==="zh")return "zhCN";if(l==="zhtw"||l==="zh-tw"||l==="zh-hk"||l==="zh-mo"||l.indexOf("zh-hant")===0)return "zhTW";if(l.indexOf("ja")===0)return "ja";if(l.indexOf("fr")===0)return "fr";if(l.indexOf("ru")===0)return "ru";if(l.indexOf("vi")===0)return "vi";if(l.indexOf("en")===0)return "en";return "zhCN"}catch(e){return "zhCN"}}function unitOf(n){return map()[n]||null}function label(u,field){var code=langCode();var bag=u[field]||{};if(typeof bag==="string")return bag;return bag[code]||bag.zhCN||bag.en||""}function climb(el){var c=el;for(var i=0;i<14&&c&&c.parentElement;i++){var p=c.parentElement;var cls=(p.getAttribute&&p.getAttribute("class"))||"";if(p.children&&p.children.length>=2&&/(grid|flex|card)/i.test(String(cls)))return c;c=p}return el.parentElement}function fix(){try{var nodes=document.querySelectorAll("h1,h2,h3,h4,h5,div,span,p,a,button,label");for(var i=0;i<nodes.length;i++){var el=nodes[i];if(el.children&&el.children.length>2)continue;var name=(el.textContent||"").replace(/\\s+/g," ").trim();var u=unitOf(name);if(!u||u.unit==="request"||u.unit==="token")continue;var card=climb(el);if(!card||!card.parentElement)continue;var scope=card.parentElement;var walk=scope.querySelectorAll("*");var badge=label(u,"badge");var pkey=label(u,"price_key");var suf=label(u,"suffix");for(var j=0;j<walk.length;j++){var n=walk[j];if(n.children&&n.children.length)continue;var t=(n.textContent||"").replace(/\\s+/g," ").trim();if(!t)continue;if(/^(按次计费|按次計費|Per Request|Par requête|За запрос|リクエスト課金|Theo lần gọi|按秒计费|按秒計費|Per Second|Par seconde|За секунду|秒課金|Theo giây|按页计费|按頁計費|Per Page|Par page|За страницу|ページ課金|Theo trang|按字符计费|按字元計費|Per Character|Par caractère|За символ|文字課金|Theo ký tự|按万字符计费|按萬字元計費|Per 10K Characters|Par 10k caractères|За 10 тыс\\. символов|万文字課金|Theo 10K ký tự)$/.test(t)){if(badge)n.textContent=badge;continue}if(/^(每次请求|每次請求|Per request|Par requête|За запрос|リクエストごと|Mỗi lần gọi|每秒|Per second|Par seconde|За секунду|秒ごと|Mỗi giây|每页|每頁|Per page|Par page|За страницу|ページごと|Mỗi trang|每字符|每字元|Per character|Par caractère|За символ|文字ごと|Mỗi ký tự|每万字符|每萬字元|Per 10K characters|Par 10k caractères|За 10 тыс\\. символов|万文字ごと|Mỗi 10K ký tự)$/.test(t)){if(pkey)n.textContent=pkey;continue}if(/\\/\\s*(request|second|page|character|10K chars|requête|seconde|стр\\.|символ|10к симв\\.|回|秒|ページ|文字|万文字|lần|giây|trang|ký tự|10K ký tự|次|頁|字符|字元|万字符|萬字元)$/i.test(t)){if(suf)n.textContent=t.replace(/\\/\\s*.+$/,suf);continue}}}}catch(e){}}setInterval(fix,700);document.addEventListener("click",function(){setTimeout(fix,120)},true)})();';
  return "<script>" + js + "</script>";
}

const LOCALE_DESC_SCRIPT = buildLocaleDescScript();
const BILLING_UNIT_SCRIPT = buildBillingUnitScript();

`;

const insertAt = s.indexOf("const PRICING_SORT_SCRIPT");
if (insertAt < 0) {
  // already rebuilt — still refresh copy JSON; patch applyPricing if needed
  fs.copyFileSync(copySrc, copyDst);
  if (!s.includes("pickTag(tag)")) {
    s = s.replace(
      "function pickDesc(e){if(!e)return\"\";var code=langCode();var d=e.descriptions||{};return d[code]||d.zhCN||e.description_zh||e.description||d.en||e.description_en||\"\"}function applyPricing(d){try{if(!d||!Array.isArray(d.data))return d;for(var i=0;i<d.data.length;i++){var m=d.data[i];var n=m&&(m.model_name||m.model||m.key);var e=n&&MAP[n];if(e){var t=pickDesc(e);if(t)m.description=t}}}catch(err){}return d}",
      "function pickDesc(e){if(!e)return\"\";var code=langCode();var d=e.descriptions||{};return d[code]||d.zhCN||e.description_zh||e.description||d.en||e.description_en||\"\"}function pickTag(tag){if(!tag)return tag;var code=langCode();var TAGS=MAP.__tags__||{};var bag=TAGS[tag];if(!bag)return tag;return bag[code]||bag.zhCN||tag}function applyPricing(d){try{if(!d||!Array.isArray(d.data))return d;for(var i=0;i<d.data.length;i++){var m=d.data[i];var n=m&&(m.model_name||m.model||m.key);var e=n&&MAP[n];if(e){var t=pickDesc(e);if(t)m.description=t}if(m.tags)m.tags=pickTag(m.tags)}}catch(err){}return d}"
    );
    fs.writeFileSync(serverPath, s);
  }
  // bump inject marker so browsers drop old cached HTML inject
  if (!s.includes("keyo-pricing-sort-v6")) {
    s = fs.readFileSync(serverPath, "utf8").replace(/keyo-pricing-sort-v5/g, "keyo-pricing-sort-v6");
    fs.writeFileSync(serverPath, s);
  }
  console.log({
    skipped: true,
    patchedTag: s.includes("pickTag(tag)"),
    serverBytes: Buffer.byteLength(s),
    copyModels: Object.keys(JSON.parse(fs.readFileSync(copyDst, "utf8"))).filter((k) => k !== "__tags__").length,
  });
  process.exit(0);
}
s = s.slice(0, insertAt) + loader + s.slice(insertAt);

if (!s.includes("enrichPricingPayload(ordered)")) {
  s = s.replace(
    "return { ...payload, data: sortedModels, vendors: sortedVendors };\n}",
    `const ordered = { ...payload, data: sortedModels, vendors: sortedVendors };
  return enrichPricingPayload(ordered);
}`
  );
}

s = s.replace(/keyo-pricing-sort-v5/g, "keyo-pricing-sort-v5");
if (!s.includes("LOCALE_DESC_SCRIPT")) {
  throw new Error("LOCALE_DESC_SCRIPT not inserted");
}

fs.writeFileSync(serverPath, s);

// Dockerfile must copy json
fs.writeFileSync(
  path.join(root, "services/creem-moderation-proxy/Dockerfile"),
  `FROM node:22-alpine
WORKDIR /app
COPY server.mjs marketplace-model-copy.json ./
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server.mjs"]
`
);

console.log({
  serverBytes: Buffer.byteLength(s),
  copyModels: Object.keys(JSON.parse(fs.readFileSync(copyDst, "utf8"))).length,
  hasBuild: s.includes("buildLocaleDescScript"),
});
