/**
 * 生成「一键复制」HTML：把所有 vps-trust 分片按顺序放进页面，小白点按钮即可复制。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = __dirname;

function mustRead(name) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) throw new Error("missing " + name);
  return fs
    .readFileSync(p, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

const names = [];
for (let i = 1; i <= 7; i++) names.push(`vps-trust-mod-p${i}.txt`);
for (let i = 1; i <= 5; i++) names.push(`vps-trust-home-p${i}.txt`);
for (let i = 1; i <= 9; i++) names.push(`vps-trust-docs-p${i}.txt`);
names.push("vps-trust-status-p1.txt");
for (let i = 1; i <= 2; i++) names.push(`vps-trust-faq-p${i}.txt`);
names.push("vps-trust-integ-p1.txt");
for (let i = 1; i <= 3; i++) names.push(`vps-trust-terms-p${i}.txt`);
for (let i = 1; i <= 2; i++) names.push(`vps-trust-privacy-p${i}.txt`);
names.push("vps-trust-aup-p1.txt");
names.push("vps-trust-py-p1.txt");
names.push("vps-trust-deploy.txt");

const steps = names.map((name) => ({ name, text: mustRead(name) }));

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const cards = steps
  .map((s, idx) => {
    const n = idx + 1;
    const id = `s${n}`;
    return `<section class="card" id="${id}">
  <div class="head">
    <span class="n">第 ${n} / ${steps.length} 步</span>
    <code>${esc(s.name)}</code>
    <button type="button" data-target="${id}-ta">一键复制</button>
  </div>
  <textarea id="${id}-ta" readonly rows="5">${esc(s.text)}</textarea>
  <p class="hint">粘到 Workbench 后回车；看到 OK_… / DONE_… 再点下一步</p>
</section>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>KeyoAPI 信任门面部署 — 点复制即可</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a}
.wrap{max-width:920px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:1.4rem;margin:0 0 8px}
.sub{color:#64748b;margin:0 0 12px;line-height:1.65}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:0 0 14px}
.head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
.n{font-weight:700;background:#2563eb;color:#fff;padding:4px 10px;border-radius:999px;font-size:13px}
code{font-size:12px;color:#475569}
button{margin-left:auto;background:#2563eb;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer}
button:hover{background:#1d4ed8}
button.ok{background:#059669}
textarea{width:100%;box-sizing:border-box;font:12px/1.45 ui-monospace,Consolas,monospace;border:1px solid #cbd5e1;border-radius:8px;padding:10px;resize:vertical;min-height:96px;background:#f8fafc}
.hint{margin:8px 0 0;font-size:12px;color:#64748b}
.top{position:sticky;top:0;background:#f8fafc;padding:12px 0;z-index:5;border-bottom:1px solid #e2e8f0;margin-bottom:16px}
.top a{color:#2563eb;margin-right:12px;font-size:13px;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <h1>信任门面部署（点「一键复制」→ 粘贴到 Workbench）</h1>
    <p class="sub">共 <b>${steps.length}</b> 步。每步：点蓝色按钮 → 粘到服务器终端 → 回车。最后一步必须看到 <b>DONE_TRUST_FACADE</b>。不用再找我来回开文件。</p>
    <div>
      <a href="#s1">跳到第 1 步</a>
      <a href="#s${steps.length}">跳到最后一步</a>
    </div>
  </div>
  ${cards}
</div>
<script>
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-target]');
  if (!btn) return;
  const ta = document.getElementById(btn.getAttribute('data-target'));
  if (!ta) return;
  ta.focus();
  ta.select();
  try {
    await navigator.clipboard.writeText(ta.value);
    const old = btn.textContent;
    btn.textContent = '已复制';
    btn.classList.add('ok');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1200);
  } catch (err) {
    try { document.execCommand('copy'); } catch (_) {}
    alert('已选中文字，请按 Ctrl+C 复制');
  }
});
</script>
</body>
</html>
`;

const out = path.join(dir, "vps-trust-一键复制.html");
fs.writeFileSync(out, html, "utf8");
console.log(JSON.stringify({ out, steps: steps.length, bytes: html.length }, null, 2));
