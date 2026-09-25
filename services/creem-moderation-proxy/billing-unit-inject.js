/**
 * Browser inject: replace Pricing card with OpenLux-style group price table.
 * Loaded by server.mjs as raw JS (no template-literal escaping).
 */
(function () {
  if (window.__keyoBillV13) return;
  window.__keyoBillV13 = 1;

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

  function detailRoots() {
    var out = [];
    var seen = {};
    function add(el) {
      if (!el || seen[el]) return;
      seen[el] = 1;
      out.push(el);
    }
    try {
      document.querySelectorAll('[role="dialog"]').forEach(add);
      document.querySelectorAll("[data-state='open']").forEach(function (el) {
        var tx = el.innerText || "";
        if (
          tx.indexOf("定价") >= 0 ||
          tx.indexOf("Pricing") >= 0 ||
          tx.indexOf("基础价格") >= 0 ||
          tx.indexOf("Base Price") >= 0
        )
          add(el);
      });
    } catch (e) {}
    if (!out.length) add(document.body);
    return out;
  }

  function findHit() {
    var keys = pricedIds();
    if (!keys.length) keys = unitIds();
    if (!keys.length) return null;
    var roots = detailRoots();
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      var tx = root.innerText || "";
      if (tx.length < 30) continue;
      var mid = pickIdInText(tx, keys);
      if (!mid) continue;
      if (
        tx.indexOf("定价") < 0 &&
        tx.indexOf("Pricing") < 0 &&
        tx.indexOf("基础价格") < 0 &&
        tx.indexOf("Base Price") < 0
      )
        continue;
      return { root: root, mid: mid };
    }
    return null;
  }

  function findPricingCard(root) {
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = tw.nextNode())) {
      var t = norm(n.nodeValue);
      if (t !== "定价" && t !== "Pricing" && t !== "定價") continue;
      var el = n.parentElement;
      for (var up = 0; up < 10 && el; up++) {
        if (el.tagName && String(el.tagName).toLowerCase() === "section")
          return el;
        var cls = (el.className && String(el.className)) || "";
        if (cls.indexOf("rounded-xl") >= 0 && cls.indexOf("border") >= 0)
          return el;
        el = el.parentElement;
      }
    }
    return null;
  }

  function swapLabel(t, u) {
    var badge = L(u.badge) || u.badge_zh || "按秒收费";
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

  function buildOpenLuxTable(id, mid, u) {
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
    bTag.textContent = L(u.badge) || u.badge_zh || (zh ? "按秒收费" : "Per second");
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

  function fillPricingCard(card, mid, u) {
    if (!card || !u || !u.price_table || !u.price_table.rows) return;
    var id = "keyo-pt-" + mid.replace(/[^\w.-]+/g, "_");
    var kids = Array.prototype.slice.call(card.children || []);
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i];
      if (!kid || kid.nodeType !== 1) continue;
      if (kid.getAttribute("data-keyo-price-table") === "1") continue;
      var tag = String(kid.tagName || "").toLowerCase();
      var txt = norm(kid.textContent).slice(0, 20);
      if (tag === "h2" && (txt === "定价" || txt === "Pricing" || txt === "定價"))
        continue;
      kid.style.setProperty("display", "none", "important");
      kid.setAttribute("data-keyo-hid", "1");
    }
    var old = document.getElementById(id);
    if (old && card.contains(old)) return;
    if (old) {
      try {
        old.remove();
      } catch (e) {}
    }
    card.appendChild(buildOpenLuxTable(id, mid, u));
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
        var mid = pickIdInText(tx, ids);
        if (!mid) continue;
        rewrite(el, meta(mid));
      }
    } catch (e) {}
  }

  function tick() {
    try {
      rewriteListCards();
      var hit = findHit();
      if (!hit) return;
      var u = meta(hit.mid);
      if (!u) return;
      rewrite(hit.root, u);
      if (!u.price_table) return;
      var card = findPricingCard(hit.root);
      if (card) fillPricingCard(card, hit.mid, u);
    } catch (e) {}
  }

  var _t = null;
  function schedule() {
    if (_t) return;
    _t = setTimeout(function () {
      _t = null;
      tick();
    }, 40);
  }
  setInterval(tick, 180);
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
      setTimeout(tick, 20);
      setTimeout(tick, 100);
      setTimeout(tick, 250);
    },
    true
  );
})();
