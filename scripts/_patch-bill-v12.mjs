/**
 * Patch creem billing inject → v12 (hard-mount OpenLux table + rewrite 按秒收费).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = path.join(root, "services/creem-moderation-proxy/server.mjs");
let s = fs.readFileSync(p, "utf8");

const start = s.indexOf("function buildBillingUnitScript()");
const end = s.indexOf("const LOCALE_DESC_SCRIPT");
if (start < 0 || end < 0) throw new Error("bounds not found");

const browserJs = `(function(){if(window.__keyoBillV12)return;window.__keyoBillV12=1;
function MAP(){return window.__KEYO_MKT_COPY||{}}
function lang(){try{var v=(localStorage.getItem("i18nextLng")||document.documentElement.lang||"").trim().replace(/_/g,"-").toLowerCase();if(v.indexOf("zh-tw")===0||v.indexOf("zh-hk")===0||v.indexOf("zh-hant")===0)return"zhTW";if(v.indexOf("zh")===0)return"zhCN";if(v.indexOf("ja")===0)return"ja";if(v.indexOf("fr")===0)return"fr";if(v.indexOf("ru")===0)return"ru";if(v.indexOf("vi")===0)return"vi";if(v.indexOf("en")===0)return"en"}catch(e){}return"zhCN"}
function L(bag){if(!bag)return"";if(typeof bag==="string")return bag;var c=lang();return bag[c]||bag.zhCN||bag.en||""}
function meta(n){return n?MAP()[n]:null}
function pricedIds(){try{return Object.keys(MAP()).filter(function(k){return k&&k.indexOf("__")!==0&&MAP()[k]&&MAP()[k].price_table&&MAP()[k].price_table.rows&&MAP()[k].price_table.rows.length}).sort(function(a,b){return b.length-a.length})}catch(e){return[]}}
function unitIds(){try{return Object.keys(MAP()).filter(function(k){var u=MAP()[k]&&MAP()[k].unit;return k&&k.indexOf("__")!==0&&u&&u!=="request"&&u!=="page"&&u!=="character"}).sort(function(a,b){return b.length-a.length})}catch(e){return[]}}
function pickIdInText(tx,keys){if(!tx)return null;var best=null;for(var i=0;i<keys.length;i++){if(tx.indexOf(keys[i])>=0){if(!best||keys[i].length>best.length)best=keys[i]}}return best}
function sheetRoots(){var out=[],seen={};function add(el){if(!el||seen[el])return;seen[el]=1;out.push(el)}try{document.querySelectorAll('[role="dialog"]').forEach(add);document.querySelectorAll('[data-state="open"]').forEach(function(el){var tx=(el.innerText||"");if(tx.indexOf("基础价格")>=0||tx.indexOf("Base Price")>=0||tx.indexOf("基礎價格")>=0)add(el)});document.querySelectorAll('[class*="SheetContent"],[class*="sheet-content"],[class*="DrawerContent"],[class*="drawer"]').forEach(add)}catch(e){}return out}
function findDetail(){var keys=pricedIds();if(!keys.length)keys=unitIds();if(!keys.length)return null;var sheets=sheetRoots();var i,el,tx,mid;for(i=0;i<sheets.length;i++){el=sheets[i];tx=(el.innerText||"");if(tx.length<40)continue;if(!/(基础价格|基礎價格|Base Price)/.test(tx))continue;mid=pickIdInText(tx,keys);if(mid)return{root:el,mid:mid}}var labs=[];var tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null);var n;while(n=tw.nextNode()){var t=(n.nodeValue||"").replace(/\\s+/g," ").trim();if(t==="基础价格"||t==="基礎價格"||t==="Base Price")labs.push(n.parentElement)}for(i=0;i<labs.length;i++){el=labs[i];for(var up=0;up<18&&el;up++){tx=(el.innerText||"");if(tx.length<40||tx.length>30000){el=el.parentElement;continue}if(!/(基础价格|基礎價格|Base Price)/.test(tx)){el=el.parentElement;continue}mid=pickIdInText(tx,keys);if(mid)return{root:el,mid:mid};el=el.parentElement}}return null}
function rewrite(root,u){if(!root||!u)return;if(u.unit==="request"||u.unit==="page"||u.unit==="character")return;var badge=L(u.badge)||u.badge_zh||"按秒收费";var pkey=L(u.price_key)||u.price_key_zh||"每秒";var suf=L(u.suffix)||u.suffix_zh||"/秒";if(u.unit==="10k_chars"){badge=L(u.badge)||u.badge_zh||"按万字符计费";pkey=L(u.price_key)||u.price_key_zh||"每万字符";suf=L(u.suffix)||u.suffix_zh||"/万字符"}function swap(t){if(t==="按次计费"||t==="按次計費"||t==="按次收费"||t==="Per Request"||t==="Per-call"||t==="Per request")return badge;if(t==="每次请求"||t==="每次請求"||t==="每请求")return pkey;if(t==="$/请求"||t==="$/請求"||t==="$/request"||t==="$ / request")return "$"+String(suf).replace(/^\\/?\\s*/,"");if(t==="/请求"||t==="/請求"||t==="/request")return suf;return null}var tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);var n;while(n=tw.nextNode()){var t=(n.nodeValue||"").replace(/\\s+/g," ").trim();if(!t)continue;var nv=swap(t);if(nv!=null)n.nodeValue=nv}try{var nodes=root.querySelectorAll("span,div,p,button,a,label,li");for(var i=0;i<nodes.length;i++){var el=nodes[i];if(!el||(el.children&&el.children.length))continue;var ct=(el.textContent||"").replace(/\\s+/g," ").trim();var nv2=swap(ct);if(nv2!=null&&ct!==nv2)el.textContent=nv2}}catch(e){}}
function rewriteListCards(){try{var ids=unitIds();if(!ids.length)return;var cards=document.querySelectorAll("article,[class*=Card],[class*=card],li,div");for(var i=0;i<cards.length;i++){var el=cards[i];if(!el||(el.children&&el.children.length>40))continue;var tx=(el.innerText||"").slice(0,700);if(!tx||tx.length<10||tx.length>1200)continue;if(tx.indexOf("基础价格")>=0||tx.indexOf("Base Price")>=0)continue;var mid=pickIdInText(tx,ids);if(!mid)continue;rewrite(el,meta(mid))}}catch(e){}}
function colsOf(pt){var c=pt.columns;if(Array.isArray(c))return c;return L(c)||(c&&(c.zhCN||c.en))||[]}
function findTextEl(root,labels){var tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);var n;while(n=tw.nextNode()){var t=(n.nodeValue||"").replace(/\\s+/g," ").trim();if(labels.indexOf(t)>=0)return n.parentElement}return null}
function priceSection(lab,root){var el=lab;for(var i=0;i<12&&el&&el!==root;i++){if(el.tagName&&String(el.tagName).toLowerCase()==="section")return el;var cls=el.className&&String(el.className)||"";if(/space-y|pricing|section/i.test(cls)&&el.children&&el.children.length)return el;el=el.parentElement}return lab&&lab.parentElement||lab}
function buildTable(id,u){var zh=lang().indexOf("zh")===0;var wrap=document.createElement("div");wrap.id=id;wrap.setAttribute("data-keyo-price-table","1");wrap.style.cssText="margin:14px 0 16px;overflow:auto;border:1px solid rgba(127,127,127,.28);border-radius:12px;background:rgba(127,127,127,.04)";var head=document.createElement("div");head.style.cssText="display:flex;align-items:center;gap:8px;padding:12px 12px 6px;flex-wrap:wrap";var cap=document.createElement("div");cap.textContent=zh?"分组价格":"Group pricing";cap.style.cssText="font-size:14px;font-weight:650";head.appendChild(cap);var badge=document.createElement("span");badge.textContent=L(u.badge)||u.badge_zh||(zh?"按秒收费":"Per second");badge.style.cssText="font-size:12px;padding:2px 8px;border-radius:999px;background:rgba(124,58,237,.16);color:inherit";head.appendChild(badge);wrap.appendChild(head);var tip=document.createElement("div");tip.textContent=zh?"上方「基础价格」仅为系统默认展示；实际扣费按下表分档（分辨率）。":"Base price above is a default display; billing follows the tier table.";tip.style.cssText="padding:0 12px 8px;font-size:12px;opacity:.72";wrap.appendChild(tip);var table=document.createElement("table");table.style.cssText="width:100%;border-collapse:collapse;font-size:13px;line-height:1.45";var thead=document.createElement("thead");var trh=document.createElement("tr");colsOf(u.price_table).forEach(function(c){var th=document.createElement("th");th.textContent=c;th.style.cssText="text-align:left;padding:10px 12px;background:rgba(127,127,127,.08);border-bottom:1px solid rgba(127,127,127,.2);white-space:nowrap";trh.appendChild(th)});thead.appendChild(trh);table.appendChild(thead);var tb=document.createElement("tbody");(u.price_table.rows||[]).forEach(function(row){var tr=document.createElement("tr");row.forEach(function(cell,idx){var td=document.createElement("td");td.textContent=cell;td.style.cssText="padding:9px 12px;border-bottom:1px solid rgba(127,127,127,.12)"+(idx===row.length-1?";font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600":"");tr.appendChild(td)});tb.appendChild(tr)});table.appendChild(tb);wrap.appendChild(table);return wrap}
function mountTable(root,mid,u){if(!root||!u||!u.price_table||!u.price_table.rows||!u.price_table.rows.length)return;var id="keyo-pt-"+mid.replace(/[^\\w.-]+/g,"_");var old=document.getElementById(id);if(old&&root.contains(old))return;if(old){try{old.remove()}catch(e){}}var lab=findTextEl(root,["基础价格","基礎價格","Base Price"]);var wrap=buildTable(id,u);if(!lab){root.appendChild(wrap);return}var sec=priceSection(lab,root);if(sec&&sec.parentElement){sec.parentElement.insertBefore(wrap,sec.nextSibling);return}if(sec&&sec.nextSibling){sec.parentElement.insertBefore(wrap,sec.nextSibling);return}root.appendChild(wrap)}
function tick(){try{rewriteListCards();var hit=findDetail();if(!hit)return;var u=meta(hit.mid);if(!u)return;rewrite(hit.root,u);if(u.price_table)mountTable(hit.root,hit.mid,u)}catch(e){}}
var _t=null;function schedule(){if(_t)return;_t=setTimeout(function(){_t=null;tick()},40)}
setInterval(tick,200);try{new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true})}catch(e){}
document.addEventListener("click",function(){setTimeout(tick,20);setTimeout(tick,80);setTimeout(tick,200)},true);
})();`;

const next =
  "function buildBillingUnitScript() {\n" +
  "  // v12: hard-find Sheet/dialog with 基础价格; rewrite leaf badges; remount OpenLux tier table.\n" +
  "  const js = `" +
  browserJs +
  "`;\n" +
  '  return "<script>" + js + "</script>";\n' +
  "}\n\n\n";

s = s.slice(0, start) + next + s.slice(end);
s = s.replace(/keyo-pricing-sort-v1[456]/g, "keyo-pricing-sort-v17");
fs.writeFileSync(p, s);

// Fix MiniMax-H3 price rows missing $
for (const rel of [
  "services/creem-moderation-proxy/marketplace-model-copy.json",
  "config/marketplace-model-copy.json",
]) {
  const jp = path.join(root, rel);
  const j = JSON.parse(fs.readFileSync(jp, "utf8"));
  const h = j["MiniMax-H3"];
  if (h && h.price_table) {
    h.price_table.rows = [
      ["480p", "标准输出", "$0.02055"],
      ["768p", "标准输出", "$0.02877"],
      ["1080p", "标准输出", "$0.04110"],
    ];
    h.badge = h.badge || {};
    h.badge.zhCN = "按秒收费";
    h.badge_zh = "按秒收费";
  }
  fs.writeFileSync(jp, JSON.stringify(j, null, 2) + "\n");
}

console.log(
  "ok",
  "v12=" + s.includes("__keyoBillV12"),
  "v17=" + s.includes("keyo-pricing-sort-v17")
);
