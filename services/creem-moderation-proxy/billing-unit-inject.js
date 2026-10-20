/**
 * Browser inject: replace Pricing card with Keyo group price table.
 * Loaded by server.mjs as raw JS (no template-literal escaping).
 */
(function () {
  if (window.__keyoBillWeldedV1) return;
  window.__keyoBillWeldedV1 = 1;

  // 1. Inject permanent CSS rule into <head> so native cards can NEVER be shown
  function ensureWeldCss() {
    if (document.getElementById("keyo-weld-css")) return;
    try {
      var style = document.createElement("style");
      style.id = "keyo-weld-css";
      style.textContent =
        '[data-keyo-welded="1"] > *:not(h2):not([data-keyo-price-table="1"]) { display: none !important; }\n' +
        '[data-keyo-price-table="1"] { display: block !important; width: 100% !important; margin-top: 4px !important; }';
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
  }
  ensureWeldCss();

  function MAP() {
    return window.__KEYO_MKT_COPY || {};
  }

  function lang() {
    try {
      var v = (
        localStorage.getItem("i18nextLng") ||
        document.documentElement.lang ||
        ""
      )
        .trim()
        .replace(/_/g, "-")
        .toLowerCase();
      if (
        v.indexOf("zh-tw") === 0 ||
        v.indexOf("zh-hk") === 0 ||
        v.indexOf("zh-hant") === 0
      )
        return "zhTW";
      if (v.indexOf("zh") === 0) return "zhCN";
      if (v.indexOf("ja") === 0) return "ja";
      if (v.indexOf("fr") === 0) return "fr";
      if (v.indexOf("ru") === 0) return "ru";
      if (v.indexOf("vi") === 0) return "vi";
      if (v.indexOf("en") === 0) return "en";
    } catch (e) {}
    return "zhCN";
  }

  function L(bag) {
    if (!bag) return "";
    if (typeof bag === "string") return bag;
    var c = lang();
    return bag[c] || bag.zhCN || bag.en || "";
  }

  function meta(n) {
    return n ? MAP()[n] : null;
  }

  function pricedIds() {
    try {
      return Object.keys(MAP())
        .filter(function (k) {
          var e = MAP()[k];
          return (
            k &&
            k.indexOf("__") !== 0 &&
            e &&
            e.price_table &&
            e.price_table.rows &&
            e.price_table.rows.length
          );
        })
        .sort(function (a, b) {
          return b.length - a.length;
        });
    } catch (e) {
      return [];
    }
  }

  function unitIds() {
    try {
      return Object.keys(MAP())
        .filter(function (k) {
          var u = MAP()[k] && MAP()[k].unit;
          return (
            k &&
            k.indexOf("__") !== 0 &&
            u &&
            u !== "request" &&
            u !== "page" &&
            u !== "character"
          );
        })
        .sort(function (a, b) {
          return b.length - a.length;
        });
    } catch (e) {
      return [];
    }
  }

  var _aliasCache = null;
  function aliasToId(tx) {
    if (!tx) return null;
    if (!_aliasCache) {
      _aliasCache = [];
      try {
        var M = MAP();
        for (var k in M) {
          if (!k || k.indexOf("__") === 0) continue;
          var names = M[k] && M[k].display_names;
          if (!names) continue;
          var seen = {};
          var add = function (s) {
            s = String(s || "").trim();
            if (s && s !== k && !seen[s]) {
              seen[s] = 1;
              _aliasCache.push([s, k]);
            }
          };
          if (typeof names === "string") add(names);
          else for (var lg in names) add(names[lg]);
        }
      } catch (e) {}
      _aliasCache.sort(function (a, b) {
        return b[0].length - a[0].length;
      });
    }
    for (var i = 0; i < _aliasCache.length; i++) {
      if (tx.indexOf(_aliasCache[i][0]) >= 0) return _aliasCache[i][1];
    }
    return null;
  }

  function pickIdInText(tx, keys) {
    if (!tx) return null;
    var best = null;
    for (var i = 0; i < keys.length; i++) {
      if (tx.indexOf(keys[i]) >= 0) {
        if (!best || keys[i].length > best.length) best = keys[i];
      }
    }
    return best;
  }

  function resolveId(tx, keys) {
    var id = pickIdInText(tx, keys);
    if (id) return id;
    return aliasToId(tx);
  }

  function norm(t) {
    return String(t || "")
      .replace(/[\t\n\r ]+/g, " ")
      .trim();
  }

  function colsOf(pt) {
    var c = pt.columns;
    if (Array.isArray(c)) return c;
    return L(c) || (c && (c.zhCN || c.en)) || [];
  }

  // Find all open drawers / dialogs currently in the DOM
  function findActiveDrawers() {
    var list = [];
    var seen = new Set();
    var candidates = document.querySelectorAll(
      '[data-slot="sheet-content"], [data-slot="dialog-content"], [role="dialog"], [aria-modal="true"], aside, .SheetContent'
    );
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0) {
        list.push(el);
      }
    }
    if (list.length === 0 && location.pathname.indexOf("/pricing/") >= 0) {
      var root = document.getElementById("root") || document.body;
      if (root) list.push(root);
    }
    return list;
  }

  // Extract model ID from the drawer header
  function getDrawerModelId(drawer, pKeys, uKeys) {
    if (!drawer) return null;

    // 1. Direct h1 check (ModelHeader: <h1 className="...">{model.model_name}</h1>)
    var h1 = drawer.querySelector("h1");
    if (h1) {
      var raw = norm(h1.textContent).replace(/^[✦★•\s]+/, "").replace(/[\s]+$/, "");
      if (raw) {
        if (MAP()[raw]) return raw;
        var aid = aliasToId(raw);
        if (aid) return aid;
        for (var k = 0; k < pKeys.length; k++) {
          if (raw.indexOf(pKeys[k]) >= 0) return pKeys[k];
        }
        for (var k2 = 0; k2 < uKeys.length; k2++) {
          if (raw.indexOf(uKeys[k2]) >= 0) return uKeys[k2];
        }
      }
    }

    // 2. SheetTitle (rendered as <SheetTitle className="sr-only">{model.model_name}</SheetTitle>)
    var sheetTitle = drawer.querySelector('[data-slot="sheet-title"], [data-slot="dialog-title"]');
    if (sheetTitle) {
      var st = norm(sheetTitle.textContent).replace(/^[✦★•\s]+/, "").trim();
      if (st && MAP()[st]) return st;
    }

    // 3. Fallback: resolve from drawer text using known priced keys, then unit keys
    var tx = drawer.innerText || "";
    if (tx.length >= 30) {
      var hit = resolveId(tx, pKeys);
      if (hit) return hit;
      hit = resolveId(tx, uKeys);
      if (hit) return hit;
    }
    return null;
  }

  // Locate the Pricing card section within the drawer
  function findPricingCardInDrawer(drawer) {
    if (!drawer) return null;
    var sections = drawer.querySelectorAll("section");
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      var h2 = sec.querySelector("h2");
      if (h2) {
        var ht = norm(h2.textContent);
        if (
          ht === "定价" ||
          ht === "Pricing" ||
          ht === "定價" ||
          ht === "Tarification" ||
          ht === "Tarif" ||
          ht === "Ценообразование" ||
          ht === "料金" ||
          ht === "Giá"
        ) {
          return sec;
        }
      }
    }
    // Fallback: tree walker within drawer only
    var tw = document.createTreeWalker(drawer, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = tw.nextNode())) {
      var t = norm(n.nodeValue);
      if (t !== "定价" && t !== "Pricing" && t !== "定價") continue;
      var el = n.parentElement;
      for (var up = 0; up < 10 && el && el !== drawer; up++) {
        var tag = el.tagName ? el.tagName.toLowerCase() : "";
        if (tag === "section") return el;
        var cls = el.className ? String(el.className) : "";
        if (cls.indexOf("rounded-xl") >= 0 && cls.indexOf("border") >= 0) return el;
        el = el.parentElement;
      }
    }
    return null;
  }

  function swapLabel(t, u) {
    var badge = L(u.badge) || u.badge_zh || "按秒计费";
    var pkey = L(u.price_key) || u.price_key_zh || "每秒";
    var suf = L(u.suffix) || u.suffix_zh || "/秒";
    if (u.unit === "10k_chars") {
      badge = L(u.badge) || u.badge_zh || "按万字符计费";
      pkey = L(u.price_key) || u.price_key_zh || "每万字符";
      suf = L(u.suffix) || u.suffix_zh || "/万字符";
    }
    if (
      t === "按次计费" ||
      t === "按次計費" ||
      t === "按次收费" ||
      t === "Per Request" ||
      t === "Per-call" ||
      t === "Per request"
    )
      return badge;
    if (t === "每次请求" || t === "每次請求" || t === "每请求") return pkey;
    if (
      t === "$/请求" ||
      t === "$/請求" ||
      t === "$/request" ||
      t === "$ / request"
    )
      return "$" + String(suf).replace(/^\//, "");
    if (t === "/请求" || t === "/請求" || t === "/request") return suf;
    // List cards often keep one text node: "$0.0288 / 请求"
    if (/^\$[\d.]+\s*\/\s*(请求|請求|request)\s*$/i.test(t)) {
      var unit = String(suf || "/秒");
      if (unit.charAt(0) !== "/") unit = "/" + unit;
      return t.replace(/\/\s*(请求|請求|request)\s*$/i, unit.replace(/^\//, "/"));
    }
    return null;
  }

  function rewrite(root, u) {
    if (!root || !u) return;
    if (u.unit === "request" || u.unit === "page" || u.unit === "character")
      return;
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = tw.nextNode())) {
      var t = norm(n.nodeValue);
      if (!t) continue;
      var nv = swapLabel(t, u);
      if (nv != null) n.nodeValue = nv;
    }
    try {
      var nodes = root.querySelectorAll("span,div,p,button,a,label,li");
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || (el.children && el.children.length)) continue;
        var ct = norm(el.textContent);
        var nv2 = swapLabel(ct, u);
        if (nv2 != null && ct !== nv2) el.textContent = nv2;
      }
    } catch (e) {}
  }

  function buildGroupPriceTable(id, mid, u) {
    var zh = lang().indexOf("zh") === 0;
    var wrap = document.createElement("div");
    wrap.id = id;
    wrap.setAttribute("data-keyo-price-table", "1");
    wrap.style.cssText = "margin-top:4px";

    var head = document.createElement("div");
    head.style.cssText =
      "display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap";
    var left = document.createElement("div");
    var title = document.createElement("div");
    title.textContent = zh ? "分组价格" : "Group pricing";
    title.style.cssText = "font-size:14px;font-weight:650";
    var sub = document.createElement("div");
    sub.textContent = zh
      ? "不同用户分组的价格信息"
      : "Price information by user group";
    sub.style.cssText = "font-size:12px;opacity:.65;margin-top:2px";
    left.appendChild(title);
    left.appendChild(sub);
    head.appendChild(left);
    wrap.appendChild(head);

    var table = document.createElement("table");
    table.style.cssText =
      "width:100%;border-collapse:collapse;font-size:13px;line-height:1.45;border:1px solid rgba(127,127,127,.22);border-radius:10px;overflow:hidden";
    var thead = document.createElement("thead");
    var trh = document.createElement("tr");
    var headers = zh
      ? ["分组", "计费类型", "价格"]
      : ["Group", "Billing type", "Price"];
    headers.forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h;
      th.style.cssText =
        "text-align:left;padding:10px 12px;background:rgba(127,127,127,.08);border-bottom:1px solid rgba(127,127,127,.18);font-weight:600;white-space:nowrap";
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tb = document.createElement("tbody");
    var tr = document.createElement("tr");

    var tdG = document.createElement("td");
    tdG.style.cssText =
      "padding:12px;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.12)";
    var gTag = document.createElement("span");
    gTag.textContent = "default";
    gTag.style.cssText =
      "display:inline-block;padding:2px 10px;border-radius:999px;border:1px solid rgba(127,127,127,.25);font-size:12px";
    tdG.appendChild(gTag);
    tr.appendChild(tdG);

    var tdB = document.createElement("td");
    tdB.style.cssText =
      "padding:12px;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.12)";
    var bTag = document.createElement("span");
    bTag.textContent = L(u.badge) || u.badge_zh || (zh ? "按秒计费" : "Per second");
    bTag.style.cssText =
      "display:inline-block;padding:2px 10px;border-radius:999px;background:rgba(124,58,237,.14);font-size:12px";
    tdB.appendChild(bTag);
    tr.appendChild(tdB);

    var tdP = document.createElement("td");
    tdP.style.cssText =
      "padding:8px 12px;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.12)";
    var inner = document.createElement("table");
    inner.style.cssText =
      "width:100%;border-collapse:collapse;font-size:12px;min-width:220px";
    var ith = document.createElement("thead");
    var itr = document.createElement("tr");
    colsOf(u.price_table).forEach(function (c) {
      var th = document.createElement("th");
      th.textContent = c;
      th.style.cssText =
        "text-align:left;padding:6px 8px;opacity:.7;font-weight:500;border-bottom:1px solid rgba(127,127,127,.14);white-space:nowrap";
      itr.appendChild(th);
    });
    ith.appendChild(itr);
    inner.appendChild(ith);
    var itb = document.createElement("tbody");
    (u.price_table.rows || []).forEach(function (row) {
      var r = document.createElement("tr");
      row.forEach(function (cell, idx) {
        var td = document.createElement("td");
        td.textContent = cell;
        td.style.cssText =
          "padding:7px 8px;border-bottom:1px solid rgba(127,127,127,.08)" +
          (idx === row.length - 1
            ? ";font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600"
            : "");
        r.appendChild(td);
      });
      itb.appendChild(r);
    });
    inner.appendChild(itb);
    tdP.appendChild(inner);
    tr.appendChild(tdP);

    tb.appendChild(tr);
    table.appendChild(tb);
    wrap.appendChild(table);

    var tip = document.createElement("div");
    tip.textContent = zh
      ? "说明：系统「基础价格」仅为默认展示；实际扣费按上表分档。"
      : "Note: the default base price is display-only; billing follows the tier table.";
    tip.style.cssText = "margin-top:8px;font-size:11px;opacity:.6";
    wrap.appendChild(tip);
    return wrap;
  }

  // Weld the pricing card: marks with data-keyo-welded="1" and mounts the custom table
  function weldPricingCard(card, mid, u) {
    if (!card || !mid || !u || !u.price_table || !u.price_table.rows) return;
    var targetId = "keyo-pt-" + mid.replace(/[^\w.-]+/g, "_");

    // 1. Tag card to activate CSS rule: [data-keyo-welded="1"] > *:not(h2):not([data-keyo-price-table="1"]) { display: none !important; }
    card.setAttribute("data-keyo-welded", "1");
    card.setAttribute("data-keyo-mid", mid);

    // 2. Hide native children inline for immediate effect
    var kids = Array.prototype.slice.call(card.children || []);
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i];
      if (!kid || kid.nodeType !== 1) continue;
      if (kid.getAttribute("data-keyo-price-table") === "1") continue;
      var tag = String(kid.tagName || "").toLowerCase();
      var txt = norm(kid.textContent).slice(0, 20);
      if (
        tag === "h2" &&
        (txt === "定价" ||
          txt === "Pricing" ||
          txt === "定價" ||
          txt === "Tarification" ||
          txt === "Tarif" ||
          txt === "Ценообразование" ||
          txt === "料金" ||
          txt === "Giá")
      ) {
        continue;
      }
      kid.style.setProperty("display", "none", "important");
      kid.setAttribute("data-keyo-hid", "1");
    }

    // 3. Ensure target table exists and matches current model
    var existing = card.querySelector('[data-keyo-price-table="1"]');
    if (existing) {
      if (existing.id === targetId) {
        return; // Already welded and up to date!
      }
      existing.remove();
    }

    var oldById = document.getElementById(targetId);
    if (oldById && oldById.parentNode) {
      oldById.remove();
    }

    card.appendChild(buildGroupPriceTable(targetId, mid, u));
  }

  function rewriteListCards() {
    try {
      var ids = unitIds();
      if (!ids.length) return;
      var cards = document.querySelectorAll(
        "article,[class*=Card],[class*=card],li,div"
      );
      for (var i = 0; i < cards.length; i++) {
        var el = cards[i];
        if (!el || (el.children && el.children.length > 40)) continue;
        var tx = (el.innerText || "").slice(0, 700);
        if (!tx || tx.length < 10 || tx.length > 1200) continue;
        if (tx.indexOf("基础价格") >= 0 || tx.indexOf("定价") >= 0) continue;
        var mid = resolveId(tx, ids);
        if (!mid) continue;
        rewrite(el, meta(mid));
      }
    } catch (e) {}
  }

  function tick() {
    try {
      ensureWeldCss();
      rewriteListCards();
      var pKeys = pricedIds();
      var uKeys = unitIds();
      var drawers = findActiveDrawers();
      for (var d = 0; d < drawers.length; d++) {
        var drawer = drawers[d];
        var mid = getDrawerModelId(drawer, pKeys, uKeys);
        if (!mid) continue;
        var u = meta(mid);
        if (!u) continue;

        // Rewrite badges inside the drawer (e.g. 按次计费 -> 按秒计费)
        rewrite(drawer, u);

        if (u.price_table && u.price_table.rows && u.price_table.rows.length) {
          var card = findPricingCardInDrawer(drawer);
          if (card) {
            weldPricingCard(card, mid, u);
          }
        } else {
          // If this model has no custom price table, remove any leftover welded markers
          var stray = drawer.querySelector('[data-keyo-price-table="1"]');
          if (stray) stray.remove();
          var welded = drawer.querySelector('[data-keyo-welded="1"]');
          if (welded) welded.removeAttribute("data-keyo-welded");
        }
      }
    } catch (e) {}
  }

  var _t = null;
  function schedule() {
    if (_t) return;
    _t = setTimeout(function () {
      _t = null;
      tick();
    }, 25);
  }

  // Fast 80ms interval loop guarantees zero visible flicker & instantaneous welding
  setInterval(tick, 80);

  try {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  } catch (e) {}

  document.addEventListener(
    "click",
    function () {
      setTimeout(tick, 10);
      setTimeout(tick, 50);
      setTimeout(tick, 150);
      setTimeout(tick, 300);
      setTimeout(tick, 600);
    },
    true
  );

  document.addEventListener("DOMContentLoaded", tick);
  setTimeout(tick, 100);
})();
