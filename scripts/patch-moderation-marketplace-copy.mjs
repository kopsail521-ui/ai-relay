/**
 * 把 marketplace-model-copy.json 写入 creem-moderation-proxy/server.mjs
 * 简介/计费文案跟随 i18nextLng：zhCN/zhTW/en/fr/ru/ja/vi
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const copy = JSON.parse(
  fs.readFileSync(path.join(root, "config/marketplace-model-copy.json"), "utf8")
);
const serverPath = path.join(root, "services/creem-moderation-proxy/server.mjs");
let src = fs.readFileSync(serverPath, "utf8").replace(/\r\n/g, "\n");
const copyLiteral = JSON.stringify(copy);

const enrichBlock = `const MARKETPLACE_COPY = ${copyLiteral};

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
    entry["description_" + code] ||
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

`;

// Shared language normalize + description rewrite + reload on language change
const localeJs =
  "(function(){if(window.__keyoLocaleDesc)return;window.__keyoLocaleDesc=1;var MAP=" +
  copyLiteral +
  ';var LANGS=["zhCN","zhTW","en","fr","ru","ja","vi"];function langCode(){try{var v=(localStorage.getItem("i18nextLng")||"").trim();if(!v&&document.documentElement)v=String(document.documentElement.lang||"");v=v.replace(/_/g,"-");var raw=v;var l=v.toLowerCase();if(LANGS.indexOf(raw)>=0)return raw;if(l==="zhcn"||l==="zh-cn"||l==="zh-hans"||l==="zh")return "zhCN";if(l==="zhtw"||l==="zh-tw"||l==="zh-hk"||l==="zh-mo"||l.indexOf("zh-hant")===0)return "zhTW";if(l.indexOf("ja")===0)return "ja";if(l.indexOf("fr")===0)return "fr";if(l.indexOf("ru")===0)return "ru";if(l.indexOf("vi")===0)return "vi";if(l.indexOf("en")===0)return "en";return "en"}catch(e){return "zhCN"}}function pickDesc(e){if(!e)return"";var code=langCode();var d=e.descriptions||{};return d[code]||e["description_"+code]||d.zhCN||e.description_zh||e.description||d.en||e.description_en||""}function applyPricing(d){try{if(!d||!Array.isArray(d.data))return d;for(var i=0;i<d.data.length;i++){var m=d.data[i];var n=m&&(m.model_name||m.model||m.key);var e=n&&MAP[n];if(e){var t=pickDesc(e);if(t)m.description=t}}}catch(err){}return d}var oparse=JSON.parse;JSON.parse=function(text){var v=oparse.apply(this,arguments);try{if(v&&Array.isArray(v.data)&&v.data[0]&&(v.data[0].model_name||v.data[0].model)&&(v.vendors||v.auto_groups||v.group_ratio!=null))applyPricing(v)}catch(e){}return v};try{var desc=Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,"responseText");if(desc&&desc.get){Object.defineProperty(XMLHttpRequest.prototype,"responseText",{configurable:true,enumerable:true,get:function(){var t=desc.get.call(this);try{if(this.readyState===4&&this.__keyoUrl&&String(this.__keyoUrl).indexOf("/api/pricing")>=0&&!this.__keyoLocaleCap){this.__keyoLocaleCap=1;var j=oparse(t);applyPricing(j);t=JSON.stringify(j)}}catch(e){}return t}})}}catch(e){}var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this.__keyoUrl=u;this.__keyoLocaleCap=0;return XO.apply(this,arguments)};var ofetch=window.fetch;window.fetch=function(){var args=arguments;return ofetch.apply(this,args).then(function(res){try{var u="";if(typeof args[0]==="string")u=args[0];else if(args[0]&&args[0].url)u=args[0].url;if(u&&u.indexOf("/api/pricing")>=0){return res.clone().json().then(function(d){applyPricing(d);var body=JSON.stringify(d);return new Response(body,{status:res.status,statusText:res.statusText,headers:res.headers})}).catch(function(){return res})}}catch(e){}return res})};var last=null;try{last=localStorage.getItem("i18nextLng")}catch(e){}setInterval(function(){try{var cur=localStorage.getItem("i18nextLng");if(cur!==last){last=cur;location.reload()}}catch(e){}},500);window.addEventListener("storage",function(ev){if(ev&&ev.key==="i18nextLng")location.reload()})})();';

const billingJs =
  "(function(){if(window.__keyoBillingUnit)return;window.__keyoBillingUnit=1;var MAP=" +
  copyLiteral +
  ';var LANGS=["zhCN","zhTW","en","fr","ru","ja","vi"];function langCode(){try{var v=(localStorage.getItem("i18nextLng")||"").trim().replace(/_/g,"-");var l=v.toLowerCase();if(LANGS.indexOf(v)>=0)return v;if(l==="zhcn"||l==="zh-cn"||l==="zh-hans"||l==="zh")return "zhCN";if(l==="zhtw"||l==="zh-tw"||l==="zh-hk"||l==="zh-mo"||l.indexOf("zh-hant")===0)return "zhTW";if(l.indexOf("ja")===0)return "ja";if(l.indexOf("fr")===0)return "fr";if(l.indexOf("ru")===0)return "ru";if(l.indexOf("vi")===0)return "vi";if(l.indexOf("en")===0)return "en";return "zhCN"}catch(e){return "zhCN"}}function unitOf(n){return MAP[n]||null}function label(u,field){var code=langCode();var bag=u[field]||{};if(typeof bag==="string")return bag;return bag[code]||bag.zhCN||bag.en||u[field+"_zh"]||u[field+"_en"]||""}function climb(el){var c=el;for(var i=0;i<14&&c&&c.parentElement;i++){var p=c.parentElement;var cls=(p.getAttribute&&p.getAttribute("class"))||"";if(p.children&&p.children.length>=2&&/(grid|flex|card)/i.test(String(cls)))return c;c=p}return el.parentElement}function fix(){try{var nodes=document.querySelectorAll("h1,h2,h3,h4,h5,div,span,p,a,button,label");for(var i=0;i<nodes.length;i++){var el=nodes[i];if(el.children&&el.children.length>2)continue;var name=(el.textContent||"").replace(/\\s+/g," ").trim();var u=unitOf(name);if(!u||u.unit==="request"||u.unit==="token")continue;var card=climb(el);if(!card||!card.parentElement)continue;var scope=card.parentElement;var walk=scope.querySelectorAll("*");var badge=label(u,"badge");var pkey=label(u,"price_key");var suf=label(u,"suffix");for(var j=0;j<walk.length;j++){var n=walk[j];if(n.children&&n.children.length)continue;var t=(n.textContent||"").replace(/\\s+/g," ").trim();if(!t)continue;if(/^(按次计费|按次計費|Per Request|Par requête|За запрос|リクエスト課金|Theo lần gọi|按秒计费|按秒計費|Per Second|Par seconde|За секунду|秒課金|Theo giây|按页计费|按頁計費|Per Page|Par page|За страницу|ページ課金|Theo trang|按字符计费|按字元計費|Per Character|Par caractère|За символ|文字課金|Theo ký tự|按万字符计费|按萬字元計費|Per 10K Characters|Par 10k caractères|За 10 тыс\\. символов|万文字課金|Theo 10K ký tự)$/.test(t)){if(badge)n.textContent=badge;continue}if(/^(每次请求|每次請求|Per request|Par requête|За запрос|リクエストごと|Mỗi lần gọi|每秒|Per second|Par seconde|За секунду|秒ごと|Mỗi giây|每页|每頁|Per page|Par page|За страницу|ページごと|Mỗi trang|每字符|每字元|Per character|Par caractère|За символ|文字ごと|Mỗi ký tự|每万字符|每萬字元|Per 10K characters|Par 10k caractères|За 10 тыс\\. символов|万文字ごと|Mỗi 10K ký tự)$/.test(t)){if(pkey)n.textContent=pkey;continue}if(/\\/\\s*(request|second|page|character|10K chars|requête|seconde|стр\\.|символ|10к симв\\.|回|秒|ページ|文字|万文字|lần|giây|trang|ký tự|10K ký tự|次|頁|字符|字元|万字符|萬字元)$/i.test(t)){if(suf)n.textContent=t.replace(/\\/\\s*.+$/,suf);continue}}}}catch(e){}}setInterval(fix,700);document.addEventListener("click",function(){setTimeout(fix,120)},true)})();';

function toTemplateScript(js) {
  return (
    "`<script>" +
    js.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") +
    "</script>`"
  );
}

const billingConst = "const BILLING_UNIT_SCRIPT = " + toTemplateScript(billingJs) + ";\n";
const localeConst = "const LOCALE_DESC_SCRIPT = " + toTemplateScript(localeJs) + ";\n";

src = src.replace(/\nconst MARKETPLACE_COPY = \{[\s\S]*?\nfunction enrichPricingPayload\([\s\S]*?\n\}\n\n/g, "\n");
src = src.replace(/\nconst BILLING_UNIT_SCRIPT = `[\s\S]*?<\/script>`;\n/g, "\n");
src = src.replace(/\nconst LOCALE_DESC_SCRIPT = `[\s\S]*?<\/script>`;\n/g, "\n");
src = src.replace(
  /const ordered = \{ \.\.\.payload, data: sortedModels, vendors: sortedVendors \};\n  return enrichPricingPayload\(ordered\);\n\}/,
  "return { ...payload, data: sortedModels, vendors: sortedVendors };\n}"
);

if (!src.includes("function reorderPricingPayload")) {
  throw new Error("reorderPricingPayload not found");
}

src = src.replace(
  "function reorderPricingPayload(payload) {",
  enrichBlock + "function reorderPricingPayload(payload) {"
);
src = src.replace(
  "return { ...payload, data: sortedModels, vendors: sortedVendors };\n}",
  `const ordered = { ...payload, data: sortedModels, vendors: sortedVendors };
  return enrichPricingPayload(ordered);
}`
);

src = src.replace(
  "const OAUTH_ENABLE_SCRIPT =",
  localeConst + billingConst + "const OAUTH_ENABLE_SCRIPT ="
);

// bump inject to v5
src = src.replace(
  /if \(!html\.includes\("keyo-pricing-sort-v[34]"\)\) \{[\s\S]*?\n      \}/,
  `if (!html.includes("keyo-pricing-sort-v5")) {
        html = html
          .replace(/<!--keyo-pricing-sort(?:-v\\d+)?-->[\\s\\S]*?<\\/script>/g, "")
          .replace(/<!--keyo-billing-unit-->[\\s\\S]*?<\\/script>/g, "")
          .replace(/<!--keyo-locale-desc-->[\\s\\S]*?<\\/script>/g, "");
        const inject = \`<!--keyo-pricing-sort-v5-->\${PRICING_SORT_SCRIPT}<!--keyo-locale-desc-->\${LOCALE_DESC_SCRIPT}<!--keyo-billing-unit-->\${BILLING_UNIT_SCRIPT}\`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", \`<head>\${inject}\`);
          changed = true;
        } else if (html.includes("</body>")) {
          html = html.replace("</body>", \`\${inject}</body>\`);
          changed = true;
        }
      }`
);

if (!src.includes("keyo-pricing-sort-v5")) {
  src = src.replace(/keyo-pricing-sort-v4/g, "keyo-pricing-sort-v5");
  if (!src.includes("${LOCALE_DESC_SCRIPT}")) {
    src = src.replace(
      "${PRICING_SORT_SCRIPT}<!--keyo-billing-unit-->${BILLING_UNIT_SCRIPT}",
      "${PRICING_SORT_SCRIPT}<!--keyo-locale-desc-->${LOCALE_DESC_SCRIPT}<!--keyo-billing-unit-->${BILLING_UNIT_SCRIPT}"
    );
  }
}

fs.writeFileSync(serverPath, src);
console.log({
  models: Object.keys(copy).length,
  langs: Object.keys(copy["gemma-4-26B-A4B-it"]?.descriptions || {}),
  hasV5: src.includes("keyo-pricing-sort-v5"),
  hasLocale: src.includes("LOCALE_DESC_SCRIPT"),
  sampleJa: copy["gemma-4-26B-A4B-it"]?.descriptions?.ja?.slice(0, 50),
});
