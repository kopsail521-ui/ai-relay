(function () {
  if (window.__keyoModelIconsV6) return;
  window.__keyoModelIconsV6 = 1;
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
  function paint(slot, src, alt) {
    if (!slot || !src) return;
    if (slot.matches('a,button,input,[role="tablist"],[role="tab"]') ||
        slot.querySelector('a,button,input,select,textarea,[role="tablist"],[role="tab"]')) return;
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
      // Only components can designate icon containers. Style classes are also
      // used by tabs and must never authorize destructive DOM replacement.
      var slots = document.querySelectorAll('[data-keyo-model-icon]');
      for (var i = 0; i < slots.length; i++) {
        var slot = slots[i];
        var t = slot.getAttribute('data-keyo-model-icon');
        var src = need[t];
        if (src) paint(slot, src, t);
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
  setInterval(apply, 1500);
  try {
    new MutationObserver(function () {
      apply();
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
  document.addEventListener("DOMContentLoaded", apply);
  setTimeout(apply, 300);
})();
