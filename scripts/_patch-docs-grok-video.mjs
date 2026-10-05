/**
 * Docs swap: grok-1.5-video (Path A) -> grok-imagine-video-1.5 (chat, 3 modes).
 * - keyo-docs.html: retitle Path A intro, move pricing row into a new 04c chat
 *   section with three curl examples, 7-locale i18n keys, TOC entry.
 * - keyo-api-ref.md: Path A section becomes a pointer; new §4 chat contract;
 *   drop the two delisted ids from lists/tables.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------- keyo-docs.html ---------------- */
const docsPath = path.join(root, "static/brand/keyo-docs.html");
let s = fs.readFileSync(docsPath, "utf8");

// 1) videoIntroA / videoIntroB: drop grok mentions (all locales)
s = s.split("Gemini Omni / grok-imagine").join("Gemini Omni");
const introA = [
  ["Use this path for grok-1.5-video. wan", "Auto-forward: wan"],
  ["下表模型请用本路径。wan", "自动转发路径：wan"],
  ["下表模型請用本路徑。wan", "自動轉發路徑：wan"],
  ["下表のモデルはこのパス。wan", "自動転送パス：wan"],
  ["Chemin pour grok-1.5-video. wan", "Chemin de transfert : wan"],
  ["Путь для grok-1.5-video. wan", "Путь перенаправления: wan"],
  ["Path cho grok-1.5-video. wan", "Path chuyển tiếp: wan"],
];
for (const [a, b] of introA) {
  if (!s.includes(a)) throw new Error("videoIntroA snippet not found: " + a);
  s = s.split(a).join(b);
}

// 2) nGrokVideo texts -> new capabilities (7 locales)
const nGrok = [
  ['"nGrokVideo": "text/ref · seconds 6|10 only · per request"',
   '"nGrokVideo": "text / 1 image / first·last / multi-ref · per request"'],
  ['"nGrokVideo": "文生/参考图 · 仅 seconds=6|10 · 按次"',
   '"nGrokVideo": "文生 / 单图 / 首尾帧 / 多参考图 · 按次"'],
  ['"nGrokVideo": "文生/參考圖 · 僅 6 秒或 10 秒 · 按次"',
   '"nGrokVideo": "文生 / 單圖 / 首尾幀 / 多參考圖 · 按次"'],
  ['"nGrokVideo": "テキスト/参照 · 1–15秒 · リクエスト課金"',
   '"nGrokVideo": "テキスト / 1画像 / 前後フレーム / マルチ参照 · リクエスト課金"'],
  ['"nGrokVideo": "texte/réf · 1–15s · par requête"',
   '"nGrokVideo": "texte / 1 image / première·dernière frame / multi-réf · par requête"'],
  ['"nGrokVideo": "текст/реф · 1–15с · за запрос"',
   '"nGrokVideo": "текст / 1 изображение / первый·последний кадр / мультиреф · за запрос"'],
  ['"nGrokVideo": "text/ref · 1–15s · theo lần"',
   '"nGrokVideo": "văn bản / 1 ảnh / đầu·cuối / đa tham chiếu · theo lần"'],
];
for (const [a, b] of nGrok) {
  if (!s.includes(a)) throw new Error("nGrokVideo snippet not found: " + a);
  s = s.split(a).join(b);
}

// 3) pricing row: out of section 04, into the new 04c section
const oldRow = '<tr><td class="model"><button type="button" class="model-btn" data-copy="grok-1.5-video">grok-1.5-video</button></td><td class="price">$0.60675 <span data-i18n="perVideo"></span></td><td class="note-cell" data-i18n="nGrokVideo"></td></tr>';
if (!s.includes(oldRow)) throw new Error("old pricing row not found");
const newRow = '<tr><td class="model"><button type="button" class="model-btn" data-copy="grok-imagine-video-1.5">grok-imagine-video-1.5</button></td><td class="price">$0.3082 <span data-i18n="perVideo"></span></td><td class="note-cell" data-i18n="nGrokVideo"></td></tr>';
const tableStart = s.indexOf('<div class="table-wrap">', s.indexOf('id="video"'));
const tableEnd = s.indexOf("</div>", s.indexOf("</table>", tableStart)) + "</div>".length;
if (!(tableStart > 0) || !(tableEnd > tableStart)) throw new Error("video table bounds not found");
if (!s.slice(tableStart, tableEnd).includes(oldRow)) throw new Error("table does not hold the grok row");
s = s.slice(0, tableStart) + s.slice(tableEnd);

// 4) JS curl example on /v1/videos: swap to a surviving Path A model
const oldCurl = '"model": "grok-1.5-video",\\n    "prompt": "A red paper boat floating on calm water at sunset"';
if (!s.includes(oldCurl)) throw new Error("old curl-video example not found");
s = s.split(oldCurl).join('"model": "wan3.0-video",\\n    "prompt": "A red paper boat floating on calm water at sunset"');

// 5) new i18n keys: insert after each tocVideoGen entry, in block order
const LOCALES = ["en", "zh", "zhTW", "ja", "fr", "ru", "vi"];
const KEYS = {
  en: [
    '"tocGrok": "Grok video"',
    '"grokTitle": "Grok Imagine Video 1.5 — chat"',
    '"grokIntro": "Text / single image / first & last frame / multi-reference in one chat endpoint. Fields follow the official Grok Imagine Video API; the video link comes back in the reply."',
    '"grokMode1": "Single image (pinned first frame)"',
    '"grokMode2": "First & last frame"',
    '"grokMode3": "Multi-reference"',
    '"grokHint": "Also accepts prompt, duration, resolution (480p/720p/1080p) and aspect_ratio. Pricing: $0.3082 per request."',
  ],
  zh: [
    '"tocGrok": "Grok 视频"',
    '"grokTitle": "Grok Imagine Video 1.5 — chat 接口"',
    '"grokIntro": "文生 / 单图 / 首尾帧 / 多参考图同一个 chat 接口。字段与官方 Grok Imagine Video API 一致，视频链接随回复返回。"',
    '"grokMode1": "单图（钉首帧）"',
    '"grokMode2": "首尾帧"',
    '"grokMode3": "多参考图"',
    '"grokHint": "另支持 prompt、duration、resolution（480p/720p/1080p）与 aspect_ratio。计费：$0.3082/次。"',
  ],
  zhTW: [
    '"tocGrok": "Grok 影片"',
    '"grokTitle": "Grok Imagine Video 1.5 — chat 介面"',
    '"grokIntro": "文生 / 單圖 / 首尾幀 / 多參考圖同一個 chat 介面。欄位與官方 Grok Imagine Video API 一致，影片連結隨回覆返回。"',
    '"grokMode1": "單圖（釘首幀）"',
    '"grokMode2": "首尾幀"',
    '"grokMode3": "多參考圖"',
    '"grokHint": "另支援 prompt、duration、resolution（480p/720p/1080p）與 aspect_ratio。計費：$0.3082/次。"',
  ],
  ja: [
    '"tocGrok": "Grok 動画"',
    '"grokTitle": "Grok Imagine Video 1.5 — chat"',
    '"grokIntro": "テキスト／単一画像／最初と最後のフレーム／マルチ参照を 1 つの chat で。フィールドは公式 Grok Imagine Video API 準拠、動画リンクは応答で返却。"',
    '"grokMode1": "単一画像（先頭フレーム固定）"',
    '"grokMode2": "最初と最後のフレーム"',
    '"grokMode3": "マルチ参照"',
    '"grokHint": "prompt、duration、resolution（480p/720p/1080p）、aspect_ratio にも対応。料金：$0.3082/回。"',
  ],
  fr: [
    '"tocGrok": "Grok vidéo"',
    '"grokTitle": "Grok Imagine Video 1.5 — chat"',
    '"grokIntro": "Texte / image unique / première et dernière frame / multi-références dans un seul endpoint chat. Champs conformes à l\\u0027API officielle Grok Imagine Video ; le lien vidéo arrive dans la réponse."',
    '"grokMode1": "Image unique (première frame épinglée)"',
    '"grokMode2": "Première et dernière frame"',
    '"grokMode3": "Multi-références"',
    '"grokHint": "Accepte aussi prompt, duration, resolution (480p/720p/1080p) et aspect_ratio. Tarif : 0,3082 $ / requête."',
  ],
  ru: [
    '"tocGrok": "Grok видео"',
    '"grokTitle": "Grok Imagine Video 1.5 — chat"',
    '"grokIntro": "Текст / одно изображение / первый и последний кадр / мультиреференс в одном chat-эндпоинте. Поля как в официальном Grok Imagine Video API; ссылка на видео придёт в ответе."',
    '"grokMode1": "Одно изображение (первый кадр)"',
    '"grokMode2": "Первый и последний кадр"',
    '"grokMode3": "Мультиреференс"',
    '"grokHint": "Также принимает prompt, duration, resolution (480p/720p/1080p) и aspect_ratio. Тариф: $0.3082 / запрос."',
  ],
  vi: [
    '"tocGrok": "Grok video"',
    '"grokTitle": "Grok Imagine Video 1.5 — chat"',
    '"grokIntro": "Văn bản / một ảnh / khung đầu & cuối / đa tham chiếu trong một endpoint chat. Trường theo API chính thức Grok Imagine Video; liên kết video trả về trong phản hồi."',
    '"grokMode1": "Một ảnh (cố định khung đầu)"',
    '"grokMode2": "Khung đầu & cuối"',
    '"grokMode3": "Đa tham chiếu"',
    '"grokHint": "Hỗ trợ thêm prompt, duration, resolution (480p/720p/1080p) và aspect_ratio. Giá: $0.3082/ lần."',
  ],
};
let idx = 0;
s = s.replace(/"tocVideoGen": "[^"]*",/g, (m) => {
  const loc = LOCALES[idx];
  idx++;
  if (!loc) return m;
  return m + "\n    " + KEYS[loc].join(",\n    ") + ",";
});
if (idx !== 7) throw new Error("expected 7 tocVideoGen entries, got " + idx);

// 6) TOC link
const tocAnchor = '<a href="#video-gen" data-i18n="tocVideoGen"></a>';
if (!s.includes(tocAnchor)) throw new Error("TOC anchor not found");
s = s.replace(tocAnchor, tocAnchor + '\n        <a href="#grok-video" data-i18n="tocGrok"></a>');

// 7) new section 04c right before #video-api
const secStart = s.indexOf('<section id="video-api"');
if (secStart < 0) throw new Error("#video-api section not found");
const section = `      <section id="grok-video">
        <div class="sec-head">
          <span class="num">04c</span>
          <h2 data-i18n="grokTitle"></h2>
        </div>
        <p class="sec-desc" data-i18n="grokIntro"></p>
        <div class="endpoint">
          <span class="method">POST</span>
          <span class="path">/v1/chat/completions</span>
          <button type="button" class="btn-copy" data-copy="https://www.keyoapi.xyz/v1/chat/completions" data-i18n="copyUrl"></button>
        </div>

        <div class="code-block">
          <div class="code-bar">
            <span class="lang">cURL</span>
            <span data-i18n="grokMode1"></span>
            <button type="button" class="btn-copy" data-copy-target="curl-grok-i2v" data-i18n="copy"></button>
          </div>
          <pre id="curl-grok-i2v"></pre>
        </div>

        <div class="code-block">
          <div class="code-bar">
            <span class="lang">cURL</span>
            <span data-i18n="grokMode2"></span>
            <button type="button" class="btn-copy" data-copy-target="curl-grok-flf" data-i18n="copy"></button>
          </div>
          <pre id="curl-grok-flf"></pre>
        </div>

        <div class="code-block">
          <div class="code-bar">
            <span class="lang">cURL</span>
            <span data-i18n="grokMode3"></span>
            <button type="button" class="btn-copy" data-copy-target="curl-grok-ref" data-i18n="copy"></button>
          </div>
          <pre id="curl-grok-ref"></pre>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th data-i18n="thModel"></th>
                <th data-i18n="thPrice"></th>
                <th data-i18n="thNote"></th>
              </tr>
            </thead>
            <tbody>
${newRow}
            </tbody>
          </table>
        </div>
        <p class="hint" data-i18n="grokHint"></p>
      </section>

`;
s = s.slice(0, secStart) + section + s.slice(secStart);

// 8) JS builders for the three examples (insert before the curlMm builder)
const jsAnchor = "  const curlMm = document.getElementById('curl-mm-h3');";
if (!s.includes(jsAnchor)) throw new Error("curlMm builder anchor not found");
const builders = `  const grokI2v = document.getElementById('curl-grok-i2v');
  if (grokI2v) {
    grokI2v.innerHTML = '<code><span class="tok-cmd">curl</span> https://www.keyoapi.xyz/v1/chat/completions \\\n' +
      '  -H <span class="tok-str">"Authorization: Bearer ' + escapeHtml(key) + '"</span> \\\n' +
      '  -H <span class="tok-str">"Content-Type: application/json"</span> \\\n' +
      '  -d <span class="tok-str">\\'{\\n    "model": "grok-imagine-video-1.5",\\n    "messages": [{"role": "user", "content": "a red paper boat drifting on calm water at sunset"}],\\n    "image": "https://example.com/first.jpg",\\n    "duration": 10,\\n    "resolution": "720p"\\n  }\\'</span></code>';
  }
  const grokFlf = document.getElementById('curl-grok-flf');
  if (grokFlf) {
    grokFlf.innerHTML = '<code><span class="tok-cmd">curl</span> https://www.keyoapi.xyz/v1/chat/completions \\\n' +
      '  -H <span class="tok-str">"Authorization: Bearer ' + escapeHtml(key) + '"</span> \\\n' +
      '  -H <span class="tok-str">"Content-Type: application/json"</span> \\\n' +
      '  -d <span class="tok-str">\\'{\\n    "model": "grok-imagine-video-1.5",\\n    "messages": [{"role": "user", "content": "camera glides from the day scene into the night skyline"}],\\n    "image": "https://example.com/first.jpg",\\n    "last_frame": "https://example.com/last.jpg"\\n  }\\'</span></code>';
  }
  const grokRef = document.getElementById('curl-grok-ref');
  if (grokRef) {
    grokRef.innerHTML = '<code><span class="tok-cmd">curl</span> https://www.keyoapi.xyz/v1/chat/completions \\\n' +
      '  -H <span class="tok-str">"Authorization: Bearer ' + escapeHtml(key) + '"</span> \\\n' +
      '  -H <span class="tok-str">"Content-Type: application/json"</span> \\\n' +
      '  -d <span class="tok-str">\\'{\\n    "model": "grok-imagine-video-1.5",\\n    "messages": [{"role": "user", "content": "the model from <IMAGE_0> wears the shirt from <IMAGE_1> and walks the runway"}],\\n    "reference_images": [\\n      {"url": "https://example.com/model.jpg"},\\n      {"url": "https://example.com/shirt.jpg"}\\n    ],\\n    "duration": 10,\\n    "aspect_ratio": "16:9"\\n  }\\'</span></code>';
  }
`;
s = s.replace(jsAnchor, builders + jsAnchor);

fs.writeFileSync(docsPath, s);
console.log("keyo-docs.html patched");

/* ---------------- keyo-api-ref.md ---------------- */
const refPath = path.join(root, "static/brand/keyo-api-ref.md");
let r = fs.readFileSync(refPath, "utf8");

r = r.replace(
  "| 视频 Path A（grok-1.5-video） | `id` | `status` = `completed` | 读 **`url`**（与 Path B 相同）。不要再请求 `/v1/videos/{id}/content` |",
  "| 视频 Path A（自动转发） | `id` | `status` = `completed` | 读 **`url`**。Path A 已无独立模型，仅作为 Path B 的自动转发入口 |"
);
r = r.replace(
  "### 1.3 视频 Path A → `POST /v1/videos` → 轮询 `GET /v1/videos/{id}`\n\n`grok-1.5-video`",
  "### 1.3 视频 Path A → `POST /v1/videos`（仅自动转发）\n\nPath A 已无独立模型：打到这里的 wan / Seedance / FLUX / MiniMax / Gemini Omni 会自动转发到 Path B。Grok 视频改走 chat 接口（见 §4）。"
);
r = r.replace(
  "`gemini-omni-1.1-flash-ext` · `grok-imagine-video-1.5-preview` · `seedance-2.0-1080p`",
  "`gemini-omni-1.1-flash-ext` · `seedance-2.0-1080p`"
);

const sec4 = r.indexOf("## 4. 视频 Path A");
const sec5 = r.indexOf("## 5. 视频 Path B");
if (!(sec4 > 0) || !(sec5 > sec4)) throw new Error("api-ref §4/§5 bounds not found");
const newSec4 = `## 4. Grok Imagine Video 1.5（chat 接口）

\`POST https://www.keyoapi.xyz/v1/chat/completions\` · model=\`grok-imagine-video-1.5\` · **$0.3082/次**

文生 / 单图 / 首尾帧 / 多参考图同一个接口；字段与官方 Grok Imagine Video API 一致，视频链接随回复返回。可选 \`duration\`、\`resolution\`（\`480p\`/\`720p\`/\`1080p\`）、\`aspect_ratio\`（如 \`16:9\`）。

**单图（钉首帧）**
\`\`\`json
{
  "model": "grok-imagine-video-1.5",
  "messages": [{"role": "user", "content": "a red paper boat drifting on calm water at sunset"}],
  "image": "https://example.com/first.jpg",
  "duration": 10,
  "resolution": "720p"
}
\`\`\`

**首尾帧**（\`image\` 钉首帧；只传 \`last_frame\` 则只钉尾帧）
\`\`\`json
{
  "model": "grok-imagine-video-1.5",
  "messages": [{"role": "user", "content": "camera glides from the day scene into the night skyline"}],
  "image": "https://example.com/first.jpg",
  "last_frame": "https://example.com/last.jpg"
}
\`\`\`

**多参考图**（不锁首帧；prompt 里用 \`<IMAGE_0>\`、\`<IMAGE_1>\` 引用）
\`\`\`json
{
  "model": "grok-imagine-video-1.5",
  "messages": [{"role": "user", "content": "the model from <IMAGE_0> wears the shirt from <IMAGE_1> and walks the runway"}],
  "reference_images": [
    {"url": "https://example.com/model.jpg"},
    {"url": "https://example.com/shirt.jpg"}
  ],
  "duration": 10,
  "aspect_ratio": "16:9"
}
\`\`\`

---

`;
r = r.slice(0, sec4) + newSec4 + r.slice(sec5);

r = r.replace("| `grok-imagine-video-1.5-preview` | **1–15** | `480p`/`720p` | 图生为主 |\n", "");
r = r.replace("| `grok-1.5-video` | **仅 6 或 10** | Path A | 见 §4 |\n", "");

if (r.includes("grok-1.5-video")) throw new Error("api-ref still mentions grok-1.5-video");
fs.writeFileSync(refPath, r);
console.log("keyo-api-ref.md patched");
console.log("DONE_DOCS_GROK_SWAP");
