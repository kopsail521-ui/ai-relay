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

// ---- 标签页：模型价格 / 转化漏斗 ----
let funnelLoaded = false;

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((b) => b.classList.toggle("active", b === btn));
    const tab = btn.getAttribute("data-tab");
    document.getElementById("tab-pricing").classList.toggle("hidden", tab !== "pricing");
    document.getElementById("tab-funnel").classList.toggle("hidden", tab !== "funnel");
    if (tab === "funnel" && !funnelLoaded) loadFunnel();
  });
});

const PAY_STATUS_LABEL = {
  success: "成功",
  completed: "成功",
  paid: "成功",
  pending: "待支付",
  failed: "失败",
  expired: "超时",
  canceled: "已取消",
};

function payStatusClass(status) {
  if (PAY_SUCCESS_STATUS_LABEL_SET.has(status)) return "good";
  if (status === "pending") return "warn";
  return "bad";
}
const PAY_SUCCESS_STATUS_LABEL_SET = new Set(["success", "completed", "paid"]);

function renderFunnel(data) {
  const f = data.funnel;
  const steps = [
    { label: "注册用户", value: f.registered, note: "含 Google / GitHub 登录" },
    { label: "创建 API Key", value: f.keyUsers, note: "拿到密钥才算激活" },
    { label: "实际调用过", value: f.consumeUsers, note: "至少一次成功消费" },
    { label: "付过费", value: f.paidUsers, note: `累计充值 ${f.paidMoney ?? 0}（币种以渠道为准）` },
  ];
  const conv = (a, b) =>
    a > 0 ? Math.round((b / a) * 1000) / 10 + "%" : "—";

  const funnelHtml = `
    <div class="funnel-cards">
      ${steps
        .map(
          (s, i) => `
        <div class="funnel-step${i > 0 ? " with-conv" : ""}">
          ${i > 0 ? `<span class="conv">${conv(steps[i - 1].value, s.value)}</span>` : ""}
          <strong>${money(s.value)}</strong>
          <span>${s.label}</span>
          <em>${s.note}</em>
        </div>`
        )
        .join("")}
    </div>`;

  const neverUsed = f.registered - (f.withRequest || 0);
  const insight = [
    f.registered === 0
      ? "还没有注册用户"
      : `注册后从未调用 API：${money(neverUsed)} 人（${conv(f.registered, neverUsed)}）`,
    f.paidUsers === 0 && f.registered > 0
      ? "还没有任何付费用户——若充值单大量 pending/failed，先查支付通道；若连充值单都没有，先看定价页与注册后的引导"
      : "",
  ]
    .filter(Boolean)
    .map((t) => `<li>${t}</li>`)
    .join("");

  const statusHtml = data.payStatus.length
    ? `
      <table style="min-width:0">
        <thead><tr><th>充值单状态</th><th>单数</th><th>金额</th></tr></thead>
        <tbody>
          ${data.payStatus
            .map(
              (s) => `<tr>
                <td><span class="badge ${payStatusClass(s.status)}">${PAY_STATUS_LABEL[s.status] || escapeHtml(s.status)}</span></td>
                <td>${money(s.n)}</td>
                <td>${s.money ?? "—"}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>`
    : `<p class="muted">暂无充值记录——若线上已开放充值，先确认支付通道（Creem / Stripe）是否已切换正式模式。</p>`;

  const maxDaily = Math.max(1, ...data.daily.map((r) => Math.max(r.users, r.consume)));
  const trendHtml = `
    <table style="min-width:0">
      <thead><tr><th>日期</th><th>新注册</th><th>消费请求</th><th>充值单</th><th>成功充值金额</th></tr></thead>
      <tbody>
        ${[...data.daily]
          .reverse()
          .map((r) => {
            const noData = !r.users && !r.consume && !r.topups;
            return `<tr class="${noData ? "muted-row" : ""}">
              <td>${r.d}</td>
              <td><div class="bar-cell"><span class="bar" style="width:${(r.users / maxDaily) * 100}%"></span>${r.users || ""}</div></td>
              <td><div class="bar-cell"><span class="bar c2" style="width:${(r.consume / maxDaily) * 100}%"></span>${r.consume || ""}</div></td>
              <td>${r.topups || ""}</td>
              <td>${r.paidMoney || ""}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;

  const topupHtml = data.recentTopups.length
    ? `
    <table style="min-width:0">
      <thead><tr><th>时间</th><th>用户</th><th>金额</th><th>到账额度</th><th>状态</th><th>渠道</th></tr></thead>
      <tbody>
        ${data.recentTopups
          .map(
            (t) => `<tr>
              <td>${t.create_time ? new Date(t.create_time * 1000).toLocaleString("zh-CN", { hour12: false }) : "—"}</td>
              <td>${escapeHtml(t.username || "—")}${t.email ? `<div class="muted">${escapeHtml(t.email)}</div>` : ""}</td>
              <td>${t.money ?? "—"}</td>
              <td>${t.amount ?? "—"}</td>
              <td><span class="badge ${payStatusClass(t.status)}">${PAY_STATUS_LABEL[t.status] || escapeHtml(t.status || "—")}</span></td>
              <td>${escapeHtml(t.payment_method || t.payment_provider || "—")}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`
    : `<p class="muted">暂无充值单记录</p>`;

  document.getElementById("funnel-body").innerHTML = `
    ${funnelHtml}
    <div class="funnel-note"><strong>先看这里</strong><ul>${insight}</ul></div>
    <div class="funnel-grid">
      <div class="funnel-card"><h3>充值单状态分布<span class="muted">（盯紧有没有 pending / failed 堆积，那是支付通道问题）</span></h3>${statusHtml}</div>
      <div class="funnel-card"><h3>最近充值记录<span class="muted">（金额为支付渠道币种）</span></h3>${topupHtml}</div>
    </div>
    <div class="funnel-card"><h3>近 30 天趋势</h3>${trendHtml}</div>
    <p class="muted" style="margin: 12px 28px">数据源：${escapeHtml(data.dbPath)} · 生成于 ${new Date(data.generatedAt).toLocaleString("zh-CN", { hour12: false })}</p>`;
}

async function loadFunnel() {
  const body = document.getElementById("funnel-body");
  try {
    const data = await api("/api/analytics/funnel");
    renderFunnel(data);
    funnelLoaded = true;
  } catch (ex) {
    body.innerHTML = `<div class="funnel-card"><h3>无法读取数据</h3><p>${escapeHtml(ex.message)}</p></div>`;
  }
}

document.getElementById("btn-funnel-refresh").addEventListener("click", loadFunnel);

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
