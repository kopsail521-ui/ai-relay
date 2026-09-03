const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const tbody = document.getElementById("tbody");
const dialog = document.getElementById("edit-dialog");
const editForm = document.getElementById("edit-form");

let models = [];
let editingId = null;

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

function pctClass(v) {
  if (v == null) return "";
  if (v >= 40) return "good";
  if (v >= 15) return "warn";
  return "bad";
}

function showLogin(show) {
  loginView.classList.toggle("hidden", !show);
  appView.classList.toggle("hidden", show);
}

function toggleKindFields() {
  const kind = document.getElementById("f-kind").value;
  const isCall = kind === "image" || kind === "video";
  document.getElementById("fields-text").classList.toggle("hidden", isCall);
  document.getElementById("fields-image").classList.toggle("hidden", !isCall);
}

function filtered() {
  const kind = document.getElementById("filter-kind").value;
  const q = document.getElementById("filter-q").value.trim().toLowerCase();
  const onlyEnabled = document.getElementById("filter-enabled").checked;
  return models.filter((m) => {
    if (kind !== "all" && m.kind !== kind) return false;
    if (onlyEnabled && !m.enabled) return false;
    if (q && !String(m.name).toLowerCase().includes(q)) return false;
    return true;
  });
}

function render() {
  const rows = filtered();
  tbody.innerHTML = rows
    .map((m) => {
      const isCall = m.kind === "image" || m.kind === "video";
      const cost = isCall
        ? `<div class="price-stack"><strong>${money(m.costPerCall)}</strong><span class="muted">/次</span></div>`
        : `<div class="price-stack"><span>入 ${money(m.costIn)}</span><span>出 ${money(m.costOut)}</span></div>`;
      const sell = isCall
        ? `<div class="price-stack"><strong>${money(m.sellPerCall)}</strong><span class="muted">/次</span></div>`
        : `<div class="price-stack"><span>入 ${money(m.sellIn)}</span><span>出 ${money(m.sellOut)}</span></div>`;
      const official = isCall
        ? `<div class="price-stack"><strong>${money(m.officialPerCall)}</strong><span class="muted">/次</span></div>`
        : `<div class="price-stack"><span>入 ${money(m.officialIn)}</span><span>出 ${money(m.officialOut)}</span></div>`;
      const margin = isCall
        ? `<span class="${pctClass(m.marginPct)}">${m.marginPct == null ? "—" : m.marginPct + "%"}</span>`
        : `<div class="price-stack"><span class="${pctClass(m.marginInPct)}">入 ${m.marginInPct ?? "—"}%</span><span class="${pctClass(m.marginOutPct)}">出 ${m.marginOutPct ?? "—"}%</span></div>`;
      const vs = isCall
        ? `<span class="${pctClass(m.cheaperThanOfficialPct)}">${m.cheaperThanOfficialPct == null ? "—" : m.cheaperThanOfficialPct + "%"}</span>`
        : `<div class="price-stack"><span class="${pctClass(m.cheaperInPct)}">入 ${m.cheaperInPct ?? "—"}%</span><span class="${pctClass(m.cheaperOutPct)}">出 ${m.cheaperOutPct ?? "—"}%</span></div>`;
      return `<tr>
        <td><strong>${escapeHtml(m.name)}</strong>${m.note ? `<div class="muted">${escapeHtml(m.note)}</div>` : ""}</td>
        <td><span class="badge">${escapeHtml(m.kind)}</span></td>
        <td class="cost">${cost}</td>
        <td class="sell">${sell}</td>
        <td class="official">${official}</td>
        <td>${margin}</td>
        <td>${vs}</td>
        <td>${m.enabled ? "✓" : "—"}</td>
        <td class="row-actions">
          <button type="button" class="ghost small" data-edit="${escapeHtml(m.id)}">编辑</button>
          <button type="button" class="ghost small danger" data-del="${escapeHtml(m.id)}">删</button>
        </td>
      </tr>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function refresh() {
  const data = await api("/api/models");
  models = data.models || [];
  render();
}

function openEdit(model) {
  editingId = model?.id || null;
  document.getElementById("edit-title").textContent = model ? "编辑模型" : "新增模型";
  document.getElementById("edit-id").value = model?.id || "";
  document.getElementById("f-name").value = model?.name || "";
  document.getElementById("f-kind").value = model?.kind || "text";
  document.getElementById("f-note").value = model?.note || "";
  document.getElementById("f-enabled").checked = model?.enabled !== false;
  document.getElementById("f-cost-in").value = model?.costIn ?? "";
  document.getElementById("f-cost-out").value = model?.costOut ?? "";
  document.getElementById("f-sell-in").value = model?.sellIn ?? "";
  document.getElementById("f-sell-out").value = model?.sellOut ?? "";
  document.getElementById("f-official-in").value = model?.officialIn ?? "";
  document.getElementById("f-official-out").value = model?.officialOut ?? "";
  document.getElementById("f-cost-call").value = model?.costPerCall ?? "";
  document.getElementById("f-sell-call").value = model?.sellPerCall ?? "";
  document.getElementById("f-official-call").value = model?.officialPerCall ?? "";
  toggleKindFields();
  dialog.showModal();
}

function collectForm() {
  const kind = document.getElementById("f-kind").value;
  const base = {
    id: document.getElementById("edit-id").value || undefined,
    name: document.getElementById("f-name").value.trim(),
    kind,
    note: document.getElementById("f-note").value.trim(),
    enabled: document.getElementById("f-enabled").checked,
  };
  if (kind === "image" || kind === "video") {
    return {
      ...base,
      costPerCall: Number(document.getElementById("f-cost-call").value || 0),
      sellPerCall: Number(document.getElementById("f-sell-call").value || 0),
      officialPerCall: Number(document.getElementById("f-official-call").value || 0),
    };
  }
  return {
    ...base,
    costIn: Number(document.getElementById("f-cost-in").value || 0),
    costOut: Number(document.getElementById("f-cost-out").value || 0),
    sellIn: Number(document.getElementById("f-sell-in").value || 0),
    sellOut: Number(document.getElementById("f-sell-out").value || 0),
    officialIn: Number(document.getElementById("f-official-in").value || 0),
    officialOut: Number(document.getElementById("f-official-out").value || 0),
  };
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("password").value;
  const err = document.getElementById("login-error");
  err.textContent = "";
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
    showLogin(false);
    await refresh();
  } catch (ex) {
    err.textContent = ex.message;
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  showLogin(true);
});

document.getElementById("btn-add").addEventListener("click", () => openEdit(null));
document.getElementById("btn-seed").addEventListener("click", async () => {
  if (!confirm("用示例数据覆盖当前全部模型？")) return;
  await api("/api/seed", { method: "POST", body: "{}" });
  await refresh();
});

document.getElementById("filter-kind").addEventListener("change", render);
document.getElementById("filter-q").addEventListener("input", render);
document.getElementById("filter-enabled").addEventListener("change", render);
document.getElementById("f-kind").addEventListener("change", toggleKindFields);

document.getElementById("btn-x3-text").addEventListener("click", () => {
  const cin = Number(document.getElementById("f-cost-in").value || 0);
  const cout = Number(document.getElementById("f-cost-out").value || 0);
  document.getElementById("f-sell-in").value = +(cin * 3).toFixed(6);
  document.getElementById("f-sell-out").value = +(cout * 3).toFixed(6);
});
document.getElementById("btn-x3-image").addEventListener("click", () => {
  const c = Number(document.getElementById("f-cost-call").value || 0);
  document.getElementById("f-sell-call").value = +(c * 3).toFixed(6);
});

document.getElementById("btn-cancel").addEventListener("click", () => dialog.close());

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = collectForm();
  if (editingId) {
    await api(`/api/models/${editingId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } else {
    await api("/api/models", { method: "POST", body: JSON.stringify(payload) });
  }
  dialog.close();
  await refresh();
});

tbody.addEventListener("click", async (e) => {
  const editId = e.target.getAttribute("data-edit");
  const delId = e.target.getAttribute("data-del");
  if (editId) {
    openEdit(models.find((m) => m.id === editId));
  }
  if (delId) {
    if (!confirm("确认删除？")) return;
    await api(`/api/models/${delId}`, { method: "DELETE" });
    await refresh();
  }
});

(async function init() {
  try {
    const me = await api("/api/me");
    if (me.loggedIn) {
      showLogin(false);
      await refresh();
    } else {
      showLogin(true);
    }
  } catch {
    showLogin(true);
  }
})();
