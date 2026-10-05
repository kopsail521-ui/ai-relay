(function () {
  if (window.__keyoModelIconsV5) return;
  window.__keyoModelIconsV5 = 1;
  var MAP = window.__keyoIconMap || {};
  var LOGO = "/brand/logo.svg";
  var need = {};
  function put(name, src) {
    if (!name) return;
    need[String(name)] = src || LOGO;
  }
  Object.keys(MAP).forEach(function (k) {
    put(k, MAP[k] || LOGO);
  });
  function missingIcon(ic) {
    ic = String(ic || "").trim();
    return !ic || ic === "Custom";
  }
  function ingest(j) {
    try {
      var data = (j && j.data) || [];
      for (var i = 0; i < data.length; i++) {
        var m = data[i];
        if (!m) continue;
        var n = String(m.model_name || m.model || "");
        if (!n) continue;
        var ic = m.icon && !missingIcon(m.icon) ? m.icon : m.vendor_icon;
        if (MAP[n] || missingIcon(ic)) put(n, MAP[n] || LOGO);
      }
    } catch (e) {}
  }
  function srcFor(t) {
    if (!t) return "";
    t = String(t).replace(/\s+/g, " ").trim();
    if (!t || t.length > 80) return "";
    if (need[t]) return need[t];
    var keys = Object.keys(need);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf(t) === 0 || t.indexOf(k) === 0) return need[k];
    }
    return "";
  }
  function paint(slot, src, alt) {
    if (!slot || !src) return;
    if (
      slot.getAttribute("data-keyo-icon") === "1" &&
      slot.getAttribute("data-keyo-icon-src") === src
    )
      return;
    var img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    img.width = 28;
    img.height = 28;
    img.decoding = "async";
    img.loading = "lazy";
    img.setAttribute("translate", "no");
    img.className = "notranslate";
    img.style.cssText =
      "width:28px;height:28px;border-radius:10px;object-fit:contain;display:block;background:#111";
    slot.innerHTML = "";
    slot.appendChild(img);
    slot.setAttribute("data-keyo-icon", "1");
    slot.setAttribute("data-keyo-icon-src", src);
    slot.setAttribute("translate", "no");
  }
  function apply() {
    try {
      var slots = document.querySelectorAll(
        '[class*="size-9"],[class*="size-10"],[class*="bg-muted/40"],[class*="bg-muted\\/40"]'
      );
      for (var i = 0; i < slots.length; i++) {
        var slot = slots[i];
        var root = slot.parentElement;
        var h = root && root.querySelector("h3");
        var t = h && (h.textContent || "").replace(/\s+/g, " ").trim();
        var src = srcFor(t);
        if (src) paint(slot, src, t);
      }
      var nodes = document.querySelectorAll("h3,h2");
      for (var j = 0; j < nodes.length; j++) {
        var el = nodes[j];
        var name = (el.textContent || "").replace(/\s+/g, " ").trim();
        var href = srcFor(name);
        if (!href) continue;
        var p = el.parentElement;
        var slot2 = null;
        for (var d = 0; d < 6 && p; d++) {
          var cand = p.querySelector(
            '[class*="bg-muted/40"],[class*="bg-muted\\/40"],[class*="size-9"],[class*="size-10"]'
          );
          if (cand) {
            slot2 = cand;
            break;
          }
          p = p.parentElement;
        }
        if (slot2) paint(slot2, href, name);
      }
    } catch (e) {}
  }
  try {
    fetch("/api/pricing", { credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        ingest(j);
        apply();
      })
      .catch(function () {});
  } catch (e) {}
  setInterval(apply, 500);
  try {
    new MutationObserver(function () {
      apply();
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
  document.addEventListener("DOMContentLoaded", apply);
  setTimeout(apply, 300);
})();
