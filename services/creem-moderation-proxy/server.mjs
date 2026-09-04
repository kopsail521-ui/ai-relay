/**
 * Creem Moderation proxy — screens image prompts before New API.
 * Also injects a small fix so Google OAuth buttons are not stuck disabled
 * when Privacy/Terms consent checkbox is unchecked (Creem review).
 *
 * Env:
 *   UPSTREAM_URL=http://127.0.0.1:3000
 *   CREEM_API_KEY=creem_test_... or creem_...
 *   CREEM_TEST_MODE=true|false
 *   PORT=3001
 *   LISTEN_HOST=127.0.0.1
 */
import http from "http";
import { URL } from "url";
import zlib from "zlib";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const brotliDecompress = promisify(zlib.brotliDecompress);

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.LISTEN_HOST || "127.0.0.1";
const UPSTREAM = (process.env.UPSTREAM_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const CREEM_KEY = process.env.CREEM_API_KEY || "";
const TEST_MODE = String(process.env.CREEM_TEST_MODE || "true").toLowerCase() !== "false";
const CREEM_BASE = TEST_MODE ? "https://test-api.creem.io" : "https://api.creem.io";
const TIMEOUT_MS = Number(process.env.CREEM_MODERATION_TIMEOUT_MS || 5000);

const IMAGE_PATHS = new Set([
  "/v1/images/generations",
  "/v1/images/edits",
  "/v1/images/variations",
]);

/** 模型广场供应商展示顺序（越前越靠上）；「其他」永远最后 */
const VENDOR_ORDER = [
  "OpenAI",
  "Anthropic",
  "Google",
  "DeepSeek",
  "xAI",
  "Grok",
  "Midjourney",
  "Moonshot",
  "MiniMax",
  "Minimax",
  "Ollama",
  "Flux",
  "Xiaomi",
  "Vidu",
  "Kling",
  "Doubao",
  "Qwen",
  "阿里巴巴",
  "Wenxin",
  "文心",
  "SiliconFlow",
  "Spark",
  "讯飞",
  "ChatGLM",
  "智谱",
  "Suno",
  "PixVerse",
  "Meta",
  "百度",
  "BRIA AI",
  "腾讯",
  "哔哩哔哩",
  "阶跃星辰",
];

const VENDOR_ALIAS = {
  Minimax: "MiniMax",
  Grok: "xAI",
  文心: "Wenxin",
  讯飞: "Spark",
  智谱: "ChatGLM",
  阿里巴巴: "Qwen",
};

function canonVendor(name) {
  if (!name) return "";
  return VENDOR_ALIAS[name] || name;
}

function vendorRank(name) {
  if (!name) return 9000;
  if (name === "其他" || name === "模力方舟") return 9500;
  const n = canonVendor(name);
  for (let i = 0; i < VENDOR_ORDER.length; i++) {
    const v = canonVendor(VENDOR_ORDER[i]);
    if (n === v || name === VENDOR_ORDER[i]) return i;
  }
  const lower = n.toLowerCase();
  for (let i = 0; i < VENDOR_ORDER.length; i++) {
    const v = canonVendor(VENDOR_ORDER[i]).toLowerCase();
    if (lower.startsWith(v) || v.startsWith(lower) || lower.includes(v) || v.includes(lower))
      return i;
  }
  return 8000;
}

function verParts(s) {
  return (String(s).match(/\d+/g) || []).map(Number);
}

/** 同供应商内：版本号更大的靠前，再按名字倒序 */
function cmpModelNewFirst(a, b) {
  const na = a.model_name || a.model || "";
  const nb = b.model_name || b.model || "";
  const pa = verParts(na);
  const pb = verParts(nb);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return db - da;
  }
  return nb.localeCompare(na, "en");
}

function reorderPricingPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const models = Array.isArray(payload.data) ? payload.data : null;
  const vendors = Array.isArray(payload.vendors) ? payload.vendors : [];
  if (!models) return payload;

  const vendorName = Object.fromEntries(
    vendors.map((v) => [v.id, v.name || ""])
  );

  const sortedVendors = [...vendors].sort((a, b) => {
    const ra = vendorRank(a.name);
    const rb = vendorRank(b.name);
    if (ra !== rb) return ra - rb;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh");
  });

  const sortedModels = [...models].sort((a, b) => {
    const va = vendorName[a.vendor_id] || "";
    const vb = vendorName[b.vendor_id] || "";
    const ra = vendorRank(va);
    const rb = vendorRank(vb);
    if (ra !== rb) return ra - rb;
    return cmpModelNewFirst(a, b);
  });

  const ordered = { ...payload, data: sortedModels, vendors: sortedVendors };
  return enrichPricingPayload(ordered);
}

/** 前端只有 name/price 排序。名称排序时禁止打乱，保留 /api/pricing 已排好的供应商顺序 */

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
    .replace(/售\s*¥[\d.]+\/[^（\s。]*/g, "")
    .replace(/售\s*¥[\d.]+\s*\/\s*M\s*tokens?/gi, "")
    .replace(/·\s*¥[\d.]+\/¥[\d.]+\s*per\s*M/gi, "")
    .replace(/（成本×5）/g, "")
    .replace(/成本×5/g, "")
    .replace(/¥[\d.]+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/。\s*。/g, "。")
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
    ';var MAP=window.__KEYO_MKT_COPY;var LANGS=["zhCN","zhTW","en","fr","ru","ja","vi"];function langCode(){try{var v=(localStorage.getItem("i18nextLng")||"").trim();if(!v&&document.documentElement)v=String(document.documentElement.lang||"");v=v.replace(/_/g,"-");var raw=v;var l=v.toLowerCase();if(LANGS.indexOf(raw)>=0)return raw;if(l==="zhcn"||l==="zh-cn"||l==="zh-hans"||l==="zh"||l.indexOf("zh")===0)return "zhCN";if(l==="zhtw"||l==="zh-tw"||l==="zh-hk"||l==="zh-mo"||l.indexOf("zh-hant")===0)return "zhTW";if(l.indexOf("ja")===0)return "ja";if(l.indexOf("fr")===0)return "fr";if(l.indexOf("ru")===0)return "ru";if(l.indexOf("vi")===0)return "vi";if(l.indexOf("en")===0)return "en";return "zhCN"}catch(e){return "zhCN"}}function pickDesc(e){if(!e)return"";var code=langCode();var d=e.descriptions||{};return d[code]||d.zhCN||e.description_zh||e.description||d.en||e.description_en||""}function pickTag(tag){if(!tag)return tag;var code=langCode();var TAGS=MAP.__tags__||{};var bag=TAGS[tag];if(!bag)return tag;return bag[code]||bag.zhCN||tag}function applyPricing(d){try{if(!d||!Array.isArray(d.data))return d;for(var i=0;i<d.data.length;i++){var m=d.data[i];var n=m&&(m.model_name||m.model||m.key);var e=n&&MAP[n];if(e){var t=pickDesc(e);if(t)m.description=t}if(m.tags)m.tags=pickTag(m.tags)}}catch(err){}return d}var oparse=JSON.parse;JSON.parse=function(text){var v=oparse.apply(this,arguments);try{if(v&&Array.isArray(v.data)&&v.data[0]&&(v.data[0].model_name||v.data[0].model)&&(v.vendors||v.auto_groups||v.group_ratio!=null))applyPricing(v)}catch(e){}return v};try{var desc=Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,"responseText");if(desc&&desc.get){Object.defineProperty(XMLHttpRequest.prototype,"responseText",{configurable:true,enumerable:true,get:function(){var t=desc.get.call(this);try{if(this.readyState===4&&this.__keyoUrl&&String(this.__keyoUrl).indexOf("/api/pricing")>=0&&!this.__keyoLocaleCap){this.__keyoLocaleCap=1;var j=oparse(t);applyPricing(j);t=JSON.stringify(j)}}catch(e){}return t}})}}catch(e){}var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this.__keyoUrl=u;this.__keyoLocaleCap=0;return XO.apply(this,arguments)};var ofetch=window.fetch;window.fetch=function(){var args=arguments;return ofetch.apply(this,args).then(function(res){try{var u="";if(typeof args[0]==="string")u=args[0];else if(args[0]&&args[0].url)u=args[0].url;if(u&&u.indexOf("/api/pricing")>=0){return res.clone().json().then(function(d){applyPricing(d);return new Response(JSON.stringify(d),{status:res.status,statusText:res.statusText,headers:res.headers})}).catch(function(){return res})}}catch(e){}return res})};var last=null;try{last=localStorage.getItem("i18nextLng")}catch(e){}setInterval(function(){try{var cur=localStorage.getItem("i18nextLng");if(cur!==last){last=cur;location.reload()}}catch(e){}},500)})();';
  return "<script>" + js + "</script>";
}

function buildBillingUnitScript() {
  // Only mutate model DETAIL drawers — never the marketplace card grid.
  // v5: previous v4 wiped cards by rewriting any div whose text matched 参考视频.
  const js = `(function(){if(window.__keyoBillV5)return;window.__keyoBillV5=1;
function MAP(){return window.__KEYO_MKT_COPY||{}}
function lang(){try{var v=(localStorage.getItem("i18nextLng")||document.documentElement.lang||"").trim().replace(/_/g,"-").toLowerCase();if(v.indexOf("zh-tw")===0||v.indexOf("zh-hk")===0||v.indexOf("zh-hant")===0)return"zhTW";if(v.indexOf("zh")===0)return"zhCN";if(v.indexOf("ja")===0)return"ja";if(v.indexOf("fr")===0)return"fr";if(v.indexOf("ru")===0)return"ru";if(v.indexOf("vi")===0)return"vi";if(v.indexOf("en")===0)return"en"}catch(e){}return"zhCN"}
function L(bag){if(!bag)return"";if(typeof bag==="string")return bag;var c=lang();return bag[c]||bag.zhCN||bag.en||""}
function meta(n){return n?MAP()[n]:null}
function detailRoots(){var out=[];document.querySelectorAll("[role=dialog],[data-radix-portal]").forEach(function(el){out.push(el)});document.querySelectorAll("[data-state=open]").forEach(function(el){if(el.getAttribute("role")==="dialog"||(el.className&&String(el.className).indexOf("Drawer")>=0)||el.querySelector("h1,h2,h3"))out.push(el)});return out}
function detect(root){try{var keys=Object.keys(MAP()).filter(function(k){return k!=="__tags__"&&MAP()[k]&&(MAP()[k].price_table||MAP()[k].unit==="second")});var hs=root.querySelectorAll("h1,h2,h3,[class*=title]");for(var j=0;j<hs.length;j++){var t=(hs[j].textContent||"").replace(/\\s+/g," ").trim();for(var k=0;k<keys.length;k++){if(t===keys[k]||t.indexOf(keys[k])===0)return keys[k]}}var body=(root.innerText||"").slice(0,2000);for(var i=0;i<keys.length;i++){if(body.indexOf(keys[i])>=0)return keys[i]}}catch(e){}return null}
function rewrite(root,u){if(!root||!u||u.unit==="request")return;var badge=L(u.badge)||u.badge_zh||"按秒计费";var pkey=L(u.price_key)||u.price_key_zh||"每秒";var tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);var n;while(n=tw.nextNode()){var t=(n.nodeValue||"").replace(/\\s+/g," ").trim();if(!t)continue;if(t==="按次计费"||t==="按次計費"||t==="Per Request"||t==="Per-call")n.nodeValue=badge;else if(t==="每次请求"||t==="每次請求"||t==="Per request")n.nodeValue=pkey}}
function colsOf(pt){var c=pt.columns;if(Array.isArray(c))return c;return L(c)||(c&&(c.zhCN||c.en))||[]}
function mountTable(root,mid,u){if(!root||!u||!u.price_table||!u.price_table.rows)return;var id="keyo-pt-"+mid.replace(/[^\\w.-]/g,"_");if(root.querySelector("#"+id)||document.getElementById(id))return;var anchor=null;var nodes=root.querySelectorAll("h2,h3,h4,div,span,p,label");for(var i=0;i<nodes.length;i++){var el=nodes[i];var t=(el.childNodes.length===1?el.textContent:"").replace(/\\s+/g," ").trim();if(!t)continue;if(t==="基础价格"||t==="基礎價格"||t==="Base Price"){anchor=el.parentElement;break}if(t==="定价"||t==="Pricing"){anchor=el.parentElement;break}}if(!anchor)return;if(anchor.querySelector("#"+id))return;var wrap=document.createElement("div");wrap.id=id;wrap.setAttribute("data-keyo-price-table","1");wrap.style.cssText="margin:14px 0 8px;overflow:auto;border:1px solid rgba(127,127,127,.25);border-radius:12px";var table=document.createElement("table");table.style.cssText="width:100%;border-collapse:collapse;font-size:13px;line-height:1.4";var thead=document.createElement("thead");var trh=document.createElement("tr");colsOf(u.price_table).forEach(function(c){var th=document.createElement("th");th.textContent=c;th.style.cssText="text-align:left;padding:11px 12px;background:rgba(127,127,127,.08);border-bottom:1px solid rgba(127,127,127,.2);white-space:nowrap";trh.appendChild(th)});thead.appendChild(trh);table.appendChild(thead);var tb=document.createElement("tbody");u.price_table.rows.forEach(function(row){var tr=document.createElement("tr");row.forEach(function(cell,idx){var td=document.createElement("td");td.textContent=cell;td.style.cssText="padding:10px 12px;border-bottom:1px solid rgba(127,127,127,.12)"+(idx===row.length-1?";font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600":"");tr.appendChild(td)});tb.appendChild(tr)});table.appendChild(tb);wrap.appendChild(table);anchor.appendChild(wrap)}
function fixDesc(root,u){var want=L(u.descriptions)||u.description_zh||u.description;if(!want)return;var BAD=/bill\\s*\\(ref|Seedance\\s+[\\d.]+\\s+video generation;|per second|USD\\s*0\\.\\d+\\s*\\/\\s*sec|按秒：|售价\\s*USD/i;var nodes=root.querySelectorAll("p,span,div");for(var i=0;i<nodes.length;i++){var el=nodes[i];if(el.children&&el.children.length)continue;if(el.getAttribute&&el.getAttribute("data-keyo-price-table"))continue;var t=(el.textContent||"").replace(/\\s+/g," ").trim();if(!t||t.length<24||t.length>360)continue;if(t===want)continue;if(!BAD.test(t))continue;el.textContent=want;return}}
function tick(){try{var roots=detailRoots();if(!roots.length)return;for(var i=0;i<roots.length;i++){var root=roots[i];var mid=detect(root);if(!mid)continue;var u=meta(mid);if(!u)continue;rewrite(root,u);mountTable(root,mid,u);fixDesc(root,u)}}catch(e){}}
var _t=null;function schedule(){if(_t)return;_t=setTimeout(function(){_t=null;tick()},120)}
setInterval(tick,800);try{new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true})}catch(e){}
document.addEventListener("click",function(){setTimeout(tick,80)},true);
})();`;
  return "<script>" + js + "</script>";
}


const LOCALE_DESC_SCRIPT = buildLocaleDescScript();
const BILLING_UNIT_SCRIPT = buildBillingUnitScript();

/** 旧前端 SPA 仍可能把 /models 当需登录路由；尽早改写到公开 /pricing */
const MODELS_PUBLIC_SCRIPT = `<script>(function(){if(window.__keyoModelsPublic)return;window.__keyoModelsPublic=1;function mapPath(p){if(p==="/models")return"/pricing";if(p.indexOf("/models/")===0)return"/pricing"+p.slice(7);return null}function rewriteUrl(u){try{var x=new URL(u,location.origin);if(x.origin!==location.origin)return u;var n=mapPath(x.pathname);return n?n+x.search+x.hash:u}catch(e){return u}}function bounce(){var n=mapPath(location.pathname);if(n)location.replace(n+location.search+location.hash)}bounce();var _ps=history.pushState;history.pushState=function(s,t,u){if(typeof u==="string")u=rewriteUrl(u);return _ps.call(this,s,t,u)};var _rs=history.replaceState;history.replaceState=function(s,t,u){if(typeof u==="string")u=rewriteUrl(u);return _rs.call(this,s,t,u)};document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var href=a.getAttribute("href");if(!href||href.charAt(0)==="#")return;try{var x=new URL(href,location.origin);if(x.origin!==location.origin)return;var n=mapPath(x.pathname);if(!n)return;e.preventDefault();e.stopPropagation();location.assign(n+x.search+x.hash)}catch(err){}},true)})();</script>`;

const PRICING_SORT_SCRIPT = `<script>(function(){if(window.__keyoPricingSort)return;window.__keyoPricingSort=1;var order=[],vendors=[],orderMap={},vendorMap={},origSort=Array.prototype.sort,origToSorted=Array.prototype.toSorted;function rebuildMaps(){orderMap={};vendorMap={};for(var i=0;i<order.length;i++)orderMap[order[i]]=i;for(var j=0;j<vendors.length;j++)vendorMap[vendors[j]]=j}function capture(d){try{if(!d||!d.data)return;order=[];for(var i=0;i<d.data.length;i++){var n=d.data[i]&&(d.data[i].model_name||d.data[i].model||d.data[i].key);if(n)order.push(String(n))}vendors=[];var vs=d.vendors||[];for(var k=0;k<vs.length;k++){var vn=vs[k]&&vs[k].name;if(vn)vendors.push(String(vn))}rebuildMaps()}catch(e){}}function looksLikeModels(arr){if(!arr||arr.length<2)return false;var hit=0;for(var i=0;i<Math.min(arr.length,8);i++){var o=arr[i];if(o&&typeof o==='object'&&(o.model_name||o.model||o.key))hit++}return hit>=2}function looksLikeVendors(arr){if(!arr||arr.length<2||!vendors.length)return false;var o=arr[0];return!!(o&&typeof o==='object'&&o.name!=null&&('id' in o||'icon' in o))}function isPriceSort(cmp){if(!cmp)return false;try{var s=Function.prototype.toString.call(cmp);if(/localeCompare/i.test(s)&&!/model_price|price-low|price-high|inputPrice|outputPrice/i.test(s))return false;if(/model_price|getModelPrice|price-low|price-high|inputPrice|outputPrice|quota_type/i.test(s))return true}catch(e){}return false}function byVendorOrder(a,b){var na=String(a.model_name||a.model||a.key||'');var nb=String(b.model_name||b.model||b.key||'');var ra=orderMap[na],rb=orderMap[nb];if(ra==null)ra=9000;if(rb==null)rb=9000;if(ra!==rb)return ra-rb;return 0}function sortHook(cmp){try{if(looksLikeModels(this)){if(isPriceSort(cmp))return origSort.apply(this,arguments);if(order.length)return origSort.call(this,byVendorOrder);return this}if(looksLikeVendors(this)&&vendors.length)return origSort.call(this,function(a,b){var ra=vendorMap[a.name],rb=vendorMap[b.name];if(ra==null)ra=9000;if(rb==null)rb=9000;return ra-rb})}catch(e){}return origSort.apply(this,arguments)}Array.prototype.sort=sortHook;if(origToSorted){Array.prototype.toSorted=function(cmp){var c=this.slice();sortHook.call(c,cmp);return c}}var origLC=String.prototype.localeCompare;String.prototype.localeCompare=function(other){try{var a=String(this),b=String(other==null?'':other);if(orderMap[a]!=null&&orderMap[b]!=null)return orderMap[a]-orderMap[b]}catch(e){}return origLC.apply(this,arguments)};function maybeCaptureUrl(u,text){try{if(u&&String(u).indexOf('/api/pricing')>=0)capture(JSON.parse(text))}catch(e){}}try{var desc=Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,'responseText');if(desc&&desc.get){Object.defineProperty(XMLHttpRequest.prototype,'responseText',{configurable:true,enumerable:true,get:function(){var t=desc.get.call(this);if(this.readyState===4&&this.__keyoUrl&&!this.__keyoCap){this.__keyoCap=1;maybeCaptureUrl(this.__keyoUrl,t)}return t}})}var desc2=Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,'response');if(desc2&&desc2.get){Object.defineProperty(XMLHttpRequest.prototype,'response',{configurable:true,enumerable:true,get:function(){var t=desc2.get.call(this);if(this.readyState===4&&this.__keyoUrl&&!this.__keyoCap2&&typeof t==='string'){this.__keyoCap2=1;maybeCaptureUrl(this.__keyoUrl,t)}else if(this.readyState===4&&this.__keyoUrl&&!this.__keyoCap2&&t&&typeof t==='object'){this.__keyoCap2=1;capture(t)}return t}})}}catch(e){}var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this.__keyoUrl=u;this.__keyoCap=0;this.__keyoCap2=0;return XO.apply(this,arguments)};var oparse=JSON.parse;JSON.parse=function(text){var v=oparse.apply(this,arguments);try{if(v&&Array.isArray(v.data)&&v.data.length&&v.data[0]&&(v.data[0].model_name||v.data[0].model)&&(v.vendors||v.auto_groups||v.group_ratio!=null))capture(v)}catch(e){}return v};var ofetch=window.fetch;window.fetch=function(){var args=arguments;return ofetch.apply(this,args).then(function(res){try{var u='';if(typeof args[0]==='string')u=args[0];else if(args[0]&&args[0].url)u=args[0].url;if(u&&u.indexOf('/api/pricing')>=0){return res.clone().json().then(function(d){capture(d);return res}).catch(function(){return res})}}catch(e){}return res})};function fixLabel(){try{document.querySelectorAll('button').forEach(function(el){var t=(el.textContent||'').replace(/\\s+/g,' ').trim();if(t==='名称'||t==='↑↓ 名称'||/^↑↓\\s*名称$/.test(t)||t==='Name'||t==='↑↓ Name')el.textContent='↑↓ 推荐顺序'})}catch(e){}}setInterval(fixLabel,800);try{ofetch('/api/pricing').then(function(r){return r.json()}).then(capture).catch(function(){})}catch(e){}})();</script>`;
const OAUTH_ENABLE_SCRIPT = `<script>(function(){var MSG={zhCN:'请先勾选同意隐私政策和服务条款',zhTW:'請先勾選同意隱私權政策與服務條款',en:'Please check the box to agree to the Privacy Policy and Terms first',ja:'先にプライバシーポリシーと利用規約に同意してください',fr:'Veuillez d\\'abord cocher la case pour accepter la politique de confidentialité et les conditions',ru:'Сначала отметьте согласие с политикой конфиденциальности и условиями',vi:'Vui lòng tích vào ô đồng ý Chính sách quyền riêng tư và Điều khoản trước'};function lang(){try{var v=(localStorage.getItem('i18nextLng')||'').trim();if(!v&&document.documentElement)v=document.documentElement.lang||'';v=v.replace(/_/g,'-');var l=v.toLowerCase();if(l==='zhcn'||l==='zh-cn'||l==='zh-hans'||l==='zh')return 'zhCN';if(l==='zhtw'||l==='zh-tw'||l==='zh-hk'||l==='zh-mo'||l.indexOf('zh-hant')===0)return 'zhTW';if(l.indexOf('ja')===0)return 'ja';if(l.indexOf('fr')===0)return 'fr';if(l.indexOf('ru')===0)return 'ru';if(l.indexOf('vi')===0)return 'vi';if(MSG[v])return v}catch(e){}return 'en'}function msg(){return MSG[lang()]||MSG.en}function isGoogleBtn(b){var t=(b.textContent||'').replace(/\\s+/g,' ').trim();if(!t||t.length>80||!/Google/i.test(t))return false;return /Continue with|使用\\s*Google|Google\\s*で続行|Google\\s*で続ける|Continuer avec|Продолжить с|Tiếp tục với|繼續/i.test(t)}function legalOk(){var cb=document.getElementById('legal-consent');if(!cb)return true;if(cb.getAttribute('data-state')==='checked')return true;if(cb.getAttribute('aria-checked')==='true')return true;if(cb.checked===true)return true;return false}function remind(){var box=document.getElementById('legal-consent-box')||document.getElementById('legal-consent');if(box){try{box.scrollIntoView({behavior:'smooth',block:'center'})}catch(e){}var t=box.closest?box.closest('#legal-consent-box')||box:box;t.style.outline='2px solid #ef4444';t.style.outlineOffset='4px';setTimeout(function(){t.style.outline='';t.style.outlineOffset=''},2500)}var text=msg();var old=document.getElementById('keyo-legal-toast');if(old)old.remove();var el=document.createElement('div');el.id='keyo-legal-toast';el.setAttribute('role','alert');el.textContent=text;el.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#dc2626;color:#fff;padding:12px 18px;border-radius:10px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.28);max-width:min(920px,92vw);text-align:center';document.body.appendChild(el);setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el)},3000);try{if(window.sonner&&typeof window.sonner.error==='function')window.sonner.error(text)}catch(e){}}function enable(){try{document.querySelectorAll('button').forEach(function(b){if(!isGoogleBtn(b))return;b.disabled=false;b.removeAttribute('disabled');b.removeAttribute('aria-disabled');b.classList.remove('pointer-events-none','opacity-50');b.style.pointerEvents='auto';b.style.opacity='1'})}catch(e){}}document.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('button');if(!b||!isGoogleBtn(b))return;if(legalOk())return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();remind()},true);enable();setInterval(enable,400)})();</script>`;


function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function screenPrompt(prompt, externalId) {
  if (!CREEM_KEY) {
    const err = new Error("CREEM_API_KEY not configured");
    err.code = "moderation_not_configured";
    throw err;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${CREEM_BASE}/v1/moderation/prompt`, {
      method: "POST",
      headers: {
        "x-api-key": CREEM_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        external_id: externalId,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      const err = new Error(`moderation_http_${r.status}: ${text.slice(0, 200)}`);
      err.code = "moderation_unavailable";
      throw err;
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function extractPrompt(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.prompt === "string") return payload.prompt;
  return "";
}

async function decodeBody(buf, encoding) {
  const enc = (encoding || "").toLowerCase();
  if (!enc || enc === "identity") return buf;
  if (enc.includes("br")) return brotliDecompress(buf);
  if (enc.includes("gzip")) return gunzip(buf);
  if (enc.includes("deflate")) return inflate(buf);
  return buf;
}

async function proxyRequest(req, res, bodyBuf) {
  const target = new URL(req.url || "/", UPSTREAM);
  const headers = { ...req.headers, host: target.host };
  delete headers["content-length"];
  // 避免与 Caddy encode gzip 叠压，导致前端 JS 传输中断、官网白屏
  headers["accept-encoding"] = "identity";

  const upstreamRes = await fetch(target, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method || "") ? undefined : bodyBuf,
    redirect: "manual",
  });

  const outHeaders = {};
  upstreamRes.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk === "transfer-encoding") return;
    outHeaders[k] = v;
  });

  let buf = Buffer.from(await upstreamRes.arrayBuffer());
  const ctype = String(upstreamRes.headers.get("content-type") || "").toLowerCase();
  const pathOnly = (req.url || "/").split("?")[0];

  // 模型广场：按供应商顺序重排 /api/pricing（绕过无 display_order 的旧 New API）
  if (
    req.method === "GET" &&
    pathOnly === "/api/pricing" &&
    ctype.includes("application/json") &&
    buf.length > 0
  ) {
    try {
      const enc = upstreamRes.headers.get("content-encoding") || "";
      let raw = await decodeBody(buf, enc);
      const parsed = JSON.parse(raw.toString("utf8"));
      const reordered =
        parsed && parsed.success === false
          ? parsed
          : reorderPricingPayload(parsed);
      buf = Buffer.from(JSON.stringify(reordered), "utf8");
      delete outHeaders["content-encoding"];
      delete outHeaders["Content-Encoding"];
      outHeaders["content-length"] = String(buf.length);
      outHeaders["Content-Length"] = String(buf.length);
      outHeaders["content-type"] = "application/json; charset=utf-8";
    } catch (e) {
      console.error("[pricing-reorder]", e.message || e);
    }
  }

  const isSpaShell =
    req.method === "GET" &&
    ctype.includes("text/html") &&
    buf.includes('id="root"');

  if (isSpaShell && buf.length > 0) {
    try {
      const enc = upstreamRes.headers.get("content-encoding") || "";
      let htmlBuf = await decodeBody(buf, enc);
      let html = htmlBuf.toString("utf8");
      let changed = false;
      if (html.includes("</body>") && !html.includes("keyo-oauth-enable")) {
        html = html.replace(
          "</body>",
          `<!--keyo-oauth-enable-->${OAUTH_ENABLE_SCRIPT}</body>`
        );
        changed = true;
      }
      if (!html.includes("keyo-models-public")) {
        const pub = `<!--keyo-models-public-->${MODELS_PUBLIC_SCRIPT}`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${pub}`);
          changed = true;
        } else if (html.includes("</body>")) {
          html = html.replace("</body>", `${pub}</body>`);
          changed = true;
        }
      }
      // v10: 计费 UI 只改详情抽屉，禁止动广场卡片网格（v9/v4 曾误删卡片）
      if (!html.includes("keyo-pricing-sort-v10")) {
        html = html
          .replace(/<!--keyo-pricing-sort(?:-v\d+)?-->[\s\S]*?<\/script>/g, "")
          .replace(/<!--keyo-billing-unit-->[\s\S]*?<\/script>/g, "")
          .replace(/<!--keyo-locale-desc-->[\s\S]*?<\/script>/g, "");
        const inject = `<!--keyo-pricing-sort-v10-->${PRICING_SORT_SCRIPT}<!--keyo-locale-desc-->${LOCALE_DESC_SCRIPT}<!--keyo-billing-unit-->${BILLING_UNIT_SCRIPT}`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${inject}`);
          changed = true;
        } else if (html.includes("</body>")) {
          html = html.replace("</body>", `${inject}</body>`);
          changed = true;
        }
      }
      if (changed) {
        buf = Buffer.from(html, "utf8");
        delete outHeaders["content-encoding"];
        delete outHeaders["Content-Encoding"];
        outHeaders["content-length"] = String(buf.length);
        outHeaders["Content-Length"] = String(buf.length);
      }
    } catch (e) {
      console.error("[html-inject]", e.message || e);
    }
  }

  res.writeHead(upstreamRes.status, outHeaders);
  res.end(buf);
}

/** SPA 缺页或旧路由 → 公开品牌页 / 价目页 */
const PUBLIC_REDIRECTS = {
  "/models": "/pricing",
  "/status": "/brand/status.html",
  "/faq": "/brand/faq.html",
  "/integrations": "/brand/integrations.html",
  "/use-cases": "/brand/integrations.html",
};

function redirectPublicPaths(req, res) {
  const raw = req.url || "/";
  const q = raw.indexOf("?");
  const pathOnly = q >= 0 ? raw.slice(0, q) : raw;
  const search = q >= 0 ? raw.slice(q) : "";
  if (!["GET", "HEAD"].includes(req.method || "GET")) return false;

  let dest = PUBLIC_REDIRECTS[pathOnly];
  if (!dest && pathOnly.startsWith("/models/")) {
    dest = "/pricing" + pathOnly.slice("/models".length);
  }
  if (!dest && pathOnly.startsWith("/integrations/")) {
    dest = "/brand/integrations.html";
  }
  if (!dest && pathOnly.startsWith("/use-cases/")) {
    dest = "/brand/integrations.html";
  }
  if (!dest) return false;

  res.writeHead(302, {
    Location: dest + search,
    "Cache-Control": "no-store",
  });
  res.end();
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const pathOnly = (req.url || "/").split("?")[0];
    if (redirectPublicPaths(req, res)) return;

    const bodyBuf = ["GET", "HEAD"].includes(req.method || "")
      ? Buffer.alloc(0)
      : await readBody(req);

    if (req.method === "POST" && IMAGE_PATHS.has(pathOnly)) {
      let payload;
      try {
        payload = JSON.parse(bodyBuf.toString("utf8") || "{}");
      } catch {
        return json(res, 400, {
          error: { message: "Invalid JSON body", type: "invalid_request_error" },
        });
      }
      const prompt = extractPrompt(payload).trim();
      if (!prompt) {
        return json(res, 400, {
          error: {
            message: "prompt is required for image generation and must be screened",
            type: "invalid_request_error",
            code: "prompt_required",
          },
        });
      }

      let moderation;
      try {
        const auth = String(req.headers.authorization || "").slice(0, 24);
        moderation = await screenPrompt(
          prompt,
          `keyo:${Date.now()}:${auth || "anon"}`
        );
      } catch (e) {
        console.error("[creem-moderation]", e.message || e);
        return json(res, 503, {
          error: {
            message: "Content moderation temporarily unavailable. Please retry.",
            type: "api_error",
            code: e.code || "moderation_unavailable",
          },
        });
      }

      const decision = String(moderation?.decision || "").toLowerCase();
      if (decision === "deny" || decision === "flag") {
        return json(res, 400, {
          error: {
            message:
              "Your prompt was rejected because it violates our content policy. Please revise and try again.",
            type: "invalid_request_error",
            code: decision === "flag" ? "prompt_flagged" : "prompt_rejected",
          },
        });
      }
      if (decision !== "allow") {
        return json(res, 503, {
          error: {
            message: "Content moderation returned an unexpected decision.",
            type: "api_error",
            code: "moderation_unavailable",
          },
        });
      }
    }

    await proxyRequest(req, res, bodyBuf);
  } catch (e) {
    console.error("[proxy]", e);
    if (!res.headersSent) {
      json(res, 502, {
        error: { message: "Bad gateway", type: "api_error" },
      });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `creem-moderation-proxy on http://${HOST}:${PORT} -> ${UPSTREAM} (creem ${TEST_MODE ? "test" : "live"})`
  );
});
