import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(root, "gen-seo-pages.mjs");
let s = fs.readFileSync(p, "utf8");

const newCss = `function css() {
  return \`
.wrap,.k-seo{max-width:880px;margin:0 auto;padding:28px 20px 64px}
.nav,.footer,.k-seo-nav,.k-seo-foot{display:flex;flex-wrap:wrap;gap:10px 16px;font-size:14px;color:var(--muted)}
.nav,.k-seo-nav{padding-bottom:20px;border-bottom:1px solid var(--line);margin-bottom:28px}
.footer,.k-seo-foot{padding-top:28px;border-top:1px solid var(--line);margin-top:40px}
.nav a,.footer a,.k-seo-nav a,.k-seo-foot a{color:var(--muted);text-decoration:none}
.nav a:hover,.footer a:hover,.k-seo-nav a:hover,.k-seo-foot a:hover{color:var(--ink)}
.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:0 0 10px}
h1{font-size:clamp(1.75rem,4vw,2.35rem);line-height:1.18;letter-spacing:-.03em;margin:0 0 14px;font-weight:600}
h2{font-size:1.15rem;margin:28px 0 10px;letter-spacing:-.02em}
p{margin:0 0 14px;color:var(--ink)}
.lead{font-size:1.05rem;color:var(--ink-2)}
.meta{font-size:14px;color:var(--muted);margin:0 0 18px}
.btnrow{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 28px}
.btn,.k-btn{display:inline-block;padding:10px 16px;border-radius:var(--radius);font-weight:600;font-size:14px;text-decoration:none;line-height:1.2}
.btn-primary,.k-btn-primary{background:var(--ink);color:#f6f5f1}
.btn-primary:hover,.k-btn-primary:hover{background:#000;color:#f6f5f1;text-decoration:none}
.btn-secondary,.k-btn-secondary{background:transparent;color:var(--ink);border:1px solid var(--line-strong,#c9c4b8)}
.btn-secondary:hover,.k-btn-secondary:hover{border-color:var(--ink);text-decoration:none}
.btn-link,.k-btn-link{background:transparent;color:var(--link);padding-inline:8px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;margin:16px 0}
pre,code{font-family:var(--mono)}
pre{background:var(--panel);color:var(--panel-ink);padding:14px 16px;border-radius:var(--radius);overflow:auto;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px;background:var(--surface)}
th,td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
th{background:color-mix(in srgb,var(--line) 40%,var(--surface));font-weight:600}
.ok{color:var(--ok);font-weight:600}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));margin:16px 0}
.grid a{display:block;padding:12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);color:var(--ink);text-decoration:none;font-weight:500}
.grid a:hover{border-color:var(--ink)}
ul{margin:0 0 14px;padding-left:1.2em}
.faq details{border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;margin:0 0 10px;background:var(--surface)}
.faq summary{cursor:pointer;font-weight:600}
.surfaces{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin:16px 0 8px}
.surf{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;font-size:14px}
.surf h3{font-size:15px;margin:0 0 8px}
.surf ul{margin:0;padding-left:1.15em;color:var(--muted)}
.topnav{max-width:960px;margin:0 auto;padding:18px 20px 0;display:flex;flex-wrap:wrap;gap:10px 16px;font-size:14px;color:var(--muted);font-weight:500}
.hero{padding:32px 20px 24px}
.inner{max-width:760px}
.panel{background:var(--panel);color:var(--panel-ink);border-radius:var(--radius);padding:18px;text-align:left;font-family:var(--mono);font-size:12.5px;overflow:auto;border:1px solid #2a2924}
.panel .label{color:var(--panel-muted);margin-bottom:5px;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.panel .label+.label{margin-top:14px}
.content{max-width:880px;margin:0 auto;padding:8px 20px 48px}
.foot{max-width:960px;margin:0 auto;padding:24px 20px 40px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
.frow{display:flex;flex-wrap:wrap;gap:10px 14px;margin-bottom:12px}
\`.trim();
}`;

if (!s.includes("function css()")) throw new Error("css() not found");
s = s.replace(/function css\(\) \{[\s\S]*?\n\}/, newCss);

const themeLink =
  '<meta property="og:image" content="${site}/brand/logo.svg" />\n<link rel="stylesheet" href="/brand/keyo-theme.css" />';
s = s.replace(
  /<meta property="og:image" content="\$\{site\}\/logo\.png" \/>/g,
  themeLink
);

// renderHome still has its own giant style block — replace blue/mint tokens with paper
s = s.replace(
  /:root\{--bg0:[^}]+\}/g,
  ""
);
s = s.replace(
  /html,body\{margin:0;min-height:100%;font-family:[^}]+\}/g,
  "html,body{margin:0;min-height:100%}"
);
s = s.replace(
  /a\{color:var\(--accent[^}]+\}/g,
  "a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline;color:var(--link-hover)}"
);
s = s.replace(
  /\.btn-primary\{background:var\(--accent\);color:#fff\}/g,
  ".btn-primary{background:var(--ink);color:#f6f5f1}"
);
s = s.replace(
  /\.btn-primary:hover\{background:var\(--accent-ink\);color:#fff\}/g,
  ".btn-primary:hover{background:#000;color:#f6f5f1}"
);
s = s.replace(
  /\.ok\{color:var\(--ok\);font-weight:600\}/g,
  ".ok{color:var(--ok);font-weight:600}"
);

// Ensure renderHome also loads theme CSS once
if (!s.includes('href="/brand/keyo-theme.css"')) {
  throw new Error("theme link missing after patch");
}

fs.writeFileSync(p, s);
console.log("OK patched", p);
