(function () {
  if (window.__keyoBillV13) return;
  window.__keyoBillV13 = 1;
  function MAP() {
    return window.__KEYO_MKT_COPY || {};
  }
  function lang() {
    try {
      var v = (localStorage.getItem("i18nextLng") || document.documentElement.lang || "")
        .trim()
        .toLowerCase()
        .replace("_", "-");
      if (v.indexOf("zh-tw") === 0 || v.indexOf("zh-hk") === 0 || v.indexOf("zh-hant") === 0)
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
          var u = MAP()[k];
          return (
            k &&
            k.indexOf("__") !== 0 &&
            u &&
            u.price_table &&
            u.price_table.rows &&
            u.price_table.rows.length
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
      .split(/\s+/)
      .join(" ")
      .trim();
  }
  function findDetail() {
    var keys = pricedIds();
    if (!keys.length) keys = unitIds();
    if (!keys.length) return null;
    var nodes = document.querySelectorAll(
      'section,[role="dialog"],[data-state="open"],div'
    );
    var best = null,
      bestMid = null,
      bestScore = 1e15;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || !el.innerText) continue;
      var tx = el.innerText;
      if (tx.length < 50 || tx.length > 25000) continue;
      var hasPricing =
        tx.indexOf("定价") >= 0 ||
        tx.indexOf("Pricing") >= 0 ||
        tx.indexOf("基础价格") >= 0 ||
        tx.indexOf("基礎價格") >= 0 ||
        tx.indexOf("Base Price") >= 0;
      if (!hasPricing) continue;
      var hasBase =
        tx.indexOf("基础价格") >= 0 ||
        tx.indexOf("基礎價格") >= 0 ||
        tx.indexOf("Base Price") >= 0 ||
        tx.indexOf("每次请求") >= 0 ||
        tx.indexOf("Per request") >= 0 ||
        tx.indexOf("按分组") >= 0;
      if (!hasBase) continue;
      var mid = pickIdInText(tx, keys);
      if (!mid) continue;
      if (tx.length < bestScore) {
        bestScore = tx.length;
        best = el;
        bestMid = mid;
      }
    }
    return best && bestMid ? { root: best, mid: bestMid } : null;
  }
  function swapLabel(t, u) {
    var badge = L(u.badge) || u.badge_zh || "按秒收费";
    var pkey = L(u.price_key) || u.price_key_zh || "每秒";
    if (u.unit === "10k_chars") {
      badge = L(u.badge) || u.badge_zh || "按万字符计费";
      pkey = L(u.price_key) || u.price_key_zh || "每万字符";
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
      var els = root.querySelectorAll("span,div,p,button,a,label");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.children && el.children.length) continue;
        var ct = norm(el.textContent);
        var nv2 = swapLabel(ct, u);
        if (nv2 != null && ct !== nv2) el.textContent = nv2;
      }
    } catch (e) {}
  }
  function colsOf(pt) {
    var c = pt.columns;
    if (Array.isArray(c)) return c;
    return L(c) || (c && (c.zhCN || c.en)) || [];
  }
  function buildOpenLuxBlock(id, u) {
    var zh = lang().indexOf("zh") === 0;
    var wrap = document.createElement("div");
    wrap.id = id;
    wrap.setAttribute("data-keyo-price-table", "1");
    wrap.style.cssText = "margin:0;overflow:auto";
    var title = document.createElement("div");
    title.textContent = zh ? "分组价格" : "Group pricing";
    title.style.cssText = "font-size:14px;font-weight:650;margin-bottom:8px";
    wrap.appendChild(title);
    var table = document.createElement("table");
    table.style.cssText =
      "width:100%;border-collapse:collapse;font-size:13px;border:1px solid rgba(127,127,127,.28);border-radius:10px;overflow:hidden";
    var thead = document.createElement("thead");
    var trh = document.createElement("tr");
    var heads = zh
      ? ["分组", "计费类型", "价格"]
      : ["Group", "Billing", "Price"];
    heads.forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h;
      th.style.cssText =
        "text-align:left;padding:10px 12px;background:rgba(127,127,127,.08);border-bottom:1px solid rgba(127,127,127,.2)";
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    var tb = document.createElement("tbody");
    var tr = document.createElement("tr");
    var tdG = document.createElement("td");
    tdG.textContent = "default";
    tdG.style.cssText =
      "padding:10px 12px;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.12)";
    tr.appendChild(tdG);
    var tdB = document.createElement("td");
    var pill = document.createElement("span");
    pill.textContent =
      L(u.badge) || u.badge_zh || (zh ? "按秒收费" : "Per second");
    pill.style.cssText =
      "display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:rgba(124,58,237,.16)";
    tdB.appendChild(pill);
    tdB.style.cssText =
      "padding:10px 12px;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.12)";
    tr.appendChild(tdB);
    var tdP = document.createElement("td");
    tdP.style.cssText =
      "padding:6px 8px;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.12)";
    var inner = document.createElement("table");
    inner.style.cssText =
      "width:100%;border-collapse:collapse;font-size:12px";
    var ih = document.createElement("tr");
    colsOf(u.price_table).forEach(function (c) {
      var th = document.createElement("th");
      th.textContent = c;
      th.style.cssText =
        "text-align:left;padding:6px 8px;opacity:.75;border-bottom:1px solid rgba(127,127,127,.15);font-weight:600";
      ih.appendChild(th);
    });
    inner.appendChild(ih);
    (u.price_table.rows || []).forEach(function (row) {
      var r = document.createElement("tr");
      row.forEach(function (cell, idx) {
        var td = document.createElement("td");
        td.textContent = cell;
        td.style.cssText =
          "padding:6px 8px" +
          (idx === row.length - 1
            ? ";font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:650"
            : "");
        r.appendChild(td);
      });
      inner.appendChild(r);
    });
    tdP.appendChild(inner);
    tr.appendChild(tdP);
    tb.appendChild(tr);
    table.appendChild(tb);
    wrap.appendChild(table);
    return wrap;
  }
  function fillPricingSection(root, mid, u) {
    if (!root || !u || !u.price_table || !u.price_table.rows || !u.price_table.rows.length)
      return;
    var id = "keyo-pt-" + mid.replace(/[^A-Za-z0-9._-]+/g, "_");
    if (document.getElementById(id) && root.contains(document.getElementById(id))) {
      rewrite(root, u);
      return;
    }
    var old = document.getElementById(id);
    if (old) {
      try {
        old.remove();
      } catch (e) {}
    }
    var section = null;
    var cands = root.querySelectorAll("section");
    for (var i = 0; i < cands.length; i++) {
      var tx = cands[i].innerText || "";
      var isPricingCard =
        (tx.indexOf("定价") >= 0 || tx.indexOf("Pricing") >= 0) &&
        (tx.indexOf("基础价格") >= 0 ||
          tx.indexOf("Base Price") >= 0 ||
          tx.indexOf("按分组") >= 0 ||
          tx.indexOf("Group") >= 0);
      if (isPricingCard) {
        section = cands[i];
        break;
      }
    }
    if (!section) section = root;
    var kids = Array.prototype.slice.call(section.children);
    for (var k = 0; k < kids.length; k++) {
      var kid = kids[k];
      var kt = norm(kid.innerText).slice(0, 40);
      if (
        kt === "定价" ||
        kt === "Pricing" ||
        kt.indexOf("定价") === 0 ||
        kt.indexOf("Pricing") === 0
      )
        continue;
      kid.setAttribute("data-keyo-hide-native", "1");
      kid.style.display = "none";
    }
    section.appendChild(buildOpenLuxBlock(id, u));
    rewrite(root, u);
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
        if (
          tx.indexOf("基础价格") >= 0 ||
          tx.indexOf("Base Price") >= 0 ||
          tx.indexOf("定价") >= 0
        )
          continue;
        var mid = pickIdInText(tx, ids);
        if (!mid) continue;
        rewrite(el, meta(mid));
      }
    } catch (e) {}
  }
  function tick() {
    try {
      rewriteListCards();
      var hit = findDetail();
      if (!hit) return;
      var u = meta(hit.mid);
      if (!u) return;
      rewrite(hit.root, u);
      if (u.price_table) fillPricingSection(hit.root, hit.mid, u);
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
  setInterval(tick, 200);
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
