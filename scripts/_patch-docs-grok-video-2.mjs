/**
 * Docs swap round 2: remove grok-imagine-video-1.5-preview / grok-1.5-video
 * leftovers and repoint #api-grok-imagine at the new chat model.
 * - keyo-docs.html: pricing row, api-grok-imagine article, pit2, videoImagineNote
 * - keyo-api-ref.md + keyo-api-ref.en.md: Path A -> pointer, new §4, §5.6 removal
 * - video-capabilities.json: drop the two delisted ids
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(root, p), s);

/* ---------- keyo-docs.html ---------- */
let s = read("static/brand/keyo-docs.html");

// 1) preview pricing row in #video-gen table
const previewRow = '<tr><td class="model"><button type="button" class="model-btn" data-copy="grok-imagine-video-1.5-preview">grok-imagine-video-1.5-preview</button></td><td class="price">$0.08825 / $0.1545 <span data-i18n="perSecond"></span></td><td class="note-cell"><a href="#api-grok-imagine" data-i18n="nGrokImagineVideo"></a></td></tr>';
if (!s.includes(previewRow)) throw new Error("preview pricing row not found");
s = s.replace(previewRow + "\n", "").replace(previewRow, "");

// 2) #api-grok-imagine article: repoint at the new chat model
const artId = s.indexOf('id="api-grok-imagine"');
if (artId < 0) throw new Error("api-grok-imagine not found");
const artStart = s.lastIndexOf("<article", artId);
const artEnd = s.indexOf("</article>", artId) + "</article>".length;
if (!(artStart > 0) || !(artEnd > artStart)) throw new Error("article bounds not found");
const newArticle = `          <article class="model-api" id="api-grok-imagine">
            <h3>grok-imagine-video-1.5</h3>
            <p class="model-lead" data-i18n="giLead"></p>
            <div class="table-wrap">
              <table class="field-table">
                <thead>
                  <tr><th data-i18n="thField"></th><th data-i18n="thType"></th><th data-i18n="thDesc"></th></tr>
                </thead>
                <tbody>
                  <tr><td>messages</td><td>array</td><td>chat 消息；prompt 写在 content（可用 <code>&lt;IMAGE_0&gt;</code> 引用参考图）</td></tr>
                  <tr><td>image</td><td>string</td><td>单图 URL/base64/file_id，钉首帧；与 last_frame 同传 = 首尾帧</td></tr>
                  <tr><td>last_frame</td><td>string</td><td>钉尾帧；也可只传此字段</td></tr>
                  <tr><td>reference_images</td><td>array</td><td><code>[{"url":"https://..."}]</code> 多参考图，不锁首帧</td></tr>
                  <tr><td>duration</td><td>integer</td><td>秒</td></tr>
                  <tr><td>resolution</td><td>string</td><td><code>480p</code> / <code>720p</code> / <code>1080p</code></td></tr>
                  <tr><td>aspect_ratio</td><td>string</td><td>如 <code>16:9</code></td></tr>
                </tbody>
              </table>
            </div>
            <div class="code-block" style="margin-top:12px">
              <div class="code-bar"><span class="lang">JSON · chat</span><button type="button" class="btn-copy" data-copy-target="ex-gi" data-i18n="copy"></button></div>
              <pre id="ex-gi"><code>{
  "model": "grok-imagine-video-1.5",
  "messages": [{"role": "user", "content": "gentle camera push in"}],
  "image": "https://example.com/still.jpg",
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "duration": 10
}</code></pre>
            </div>
          </article>`;
s = s.slice(0, artStart) + newArticle + s.slice(artEnd);

// 3) giLead (en + zh)
s = s.replace(
  '"giLead": "Image-to-video only. image.url is required (local still → /v1/uploads first)."',
  '"giLead": "Text / single image / first & last frame / multi-reference. Chat endpoint — the video link returns in the reply."'
);
s = s.replace(
  '"giLead": "仅图生。必须传 image.url（本机静帧先 /v1/uploads）。"',
  '"giLead": "文生 / 单图 / 首尾帧 / 多参考图。chat 接口，视频链接随回复返回。"'
);

// 4) pit2 (en + zh)
const pit2EnOld = '"pit2": "grok-imagine-video-1.5-preview: image:{\\"url\\":\\"https://...\\"} is required (prompt-only fails)."';
if (!s.includes(pit2EnOld)) throw new Error("pit2 en not found");
s = s.replace(
  pit2EnOld,
  '"pit2": "grok-imagine-video-1.5: image / last_frame / reference_images go as top-level chat body fields (official Grok Imagine Video API contract)."'
);
const pit2ZhOld = '"pit2": "grok-imagine：必须 image:{\\"url\\":\\"https://...\\"}，只传 prompt 会失败。"';
if (!s.includes(pit2ZhOld)) throw new Error("pit2 zh not found");
s = s.replace(
  pit2ZhOld,
  '"pit2": "grok-imagine-video-1.5：image / last_frame / reference_images 直接放在 chat 请求体顶层（字段与官方一致）。"'
);

// 5) videoImagineNote (5 locales mentioning the preview)
const vim = [
  ['"videoImagineNote": "grok-imagine-video-1.5-preview 僅支援圖生影片。必填 image:{\\"url\\":\\"https://...\\"}。預設 aspect_ratio 16:9、resolution 480p、duration 5。也接受 image_url / image_urls[0]。"',
   '"videoImagineNote": "grok-imagine-video-1.5：chat 介面（欄位見 #api-grok-imagine）。"'],
  ['"videoImagineNote": "grok-imagine-video-1.5-preview は画像→動画のみ。必須: image:{\\"url\\":\\"https://...\\"}。省略時 16:9 / 480p / 5s。image_url / image_urls[0] も可。"',
   '"videoImagineNote": "grok-imagine-video-1.5：chat エンドポイント（フィールドは #api-grok-imagine）。"'],
  ['"videoImagineNote": "grok-imagine-video-1.5-preview = image→vidéo uniquement. Requis: image:{\\"url\\":\\"https://...\\"}. Défauts 16:9 / 480p / 5s. Alias image_url / image_urls[0]."',
   '"videoImagineNote": "grok-imagine-video-1.5 : endpoint chat (champs : #api-grok-imagine)."'],
  ['"videoImagineNote": "grok-imagine-video-1.5-preview только image→video. Нужно: image:{\\"url\\":\\"https://...\\"}. По умолчанию 16:9 / 480p / 5с. Также image_url / image_urls[0]."',
   '"videoImagineNote": "grok-imagine-video-1.5: chat-эндпоинт (поля: #api-grok-imagine)."'],
  ['"videoImagineNote": "grok-imagine-video-1.5-preview chỉ image→video. Bắt buộc: image:{\\"url\\":\\"https://...\\"}. Mặc định 16:9 / 480p / 5s. Cũng nhận image_url / image_urls[0]."',
   '"videoImagineNote": "grok-imagine-video-1.5: endpoint chat (trường: #api-grok-imagine)."'],
];
for (const [a, b] of vim) {
  if (!s.includes(a)) throw new Error("videoImagineNote snippet not found: " + a.slice(0, 60));
  s = s.split(a).join(b);
}
write("static/brand/keyo-docs.html", s);
console.log("keyo-docs.html round-2 patched");

/* ---------- keyo-api-ref.md ---------- */
let r = read("static/brand/keyo-api-ref.md");
const sec56zh = r.indexOf("### 5.6 grok-imagine-video-1.5-preview");
const sec6zh = r.indexOf("## 6. 语音识别 ASR");
if (!(sec56zh > 0) || !(sec6zh > sec56zh)) throw new Error("api-ref §5.6 bounds not found");
r = r.slice(0, sec56zh) +
  "### 5.6 grok-imagine-video-1.5 → 已改走 chat 接口\n\n文生 / 单图 / 首尾帧 / 多参考图统一走 `POST /v1/chat/completions`（字段与官方一致），见 §4。不属于 Path B。\n\n" +
  r.slice(sec6zh);
write("static/brand/keyo-api-ref.md", r);
console.log("keyo-api-ref.md §5.6 repointed");

/* ---------- keyo-api-ref.en.md ---------- */
let e = read("static/brand/keyo-api-ref.en.md");

e = e.replace(
  "| Video Path A (`grok-1.5-video`) | `id` | `status` = `completed` | read **`url`** (same as Path B). Do not call `/v1/videos/{id}/content` |",
  "| Video Path A (auto-forward) | `id` | `status` = `completed` | read **`url`**. Path A has no own models; it only forwards to Path B |"
);
e = e.replace(
  "### 1.3 Video Path A → `POST /v1/videos` → poll `GET /v1/videos/{id}`\n\n`grok-1.5-video`",
  "### 1.3 Video Path A → `POST /v1/videos` (forward only)\n\nPath A has no own models: wan / Seedance / FLUX / MiniMax / Gemini Omni posted here are forwarded to Path B. Grok video moved to the chat endpoint (see §4)."
);
e = e.replace("`gemini-omni-1.1-flash-ext` · `grok-imagine-video-1.5-preview` · `seedance-2.0-1080p`",
  "`gemini-omni-1.1-flash-ext` · `seedance-2.0-1080p`");

const sec4en = e.indexOf("## 4. Video Path A");
const sec5en = e.indexOf("## 5. Video Path B");
if (!(sec4en > 0) || !(sec5en > sec4en)) throw new Error("en §4/§5 bounds not found");
const newSec4en = `## 4. Grok Imagine Video 1.5 (chat)

\`POST https://www.keyoapi.xyz/v1/chat/completions\` · model=\`grok-imagine-video-1.5\` · **$0.3082/request**

Text / single image / first & last frame / multi-reference in one endpoint; fields follow the official Grok Imagine Video API and the video link returns in the reply. Optional \`duration\`, \`resolution\` (\`480p\`/\`720p\`/\`1080p\`), \`aspect_ratio\` (e.g. \`16:9\`).

**Single image (pinned first frame)**
\`\`\`json
{
  "model": "grok-imagine-video-1.5",
  "messages": [{"role": "user", "content": "a red paper boat drifting on calm water at sunset"}],
  "image": "https://example.com/first.jpg",
  "duration": 10,
  "resolution": "720p"
}
\`\`\`

**First & last frame** (\`image\` pins the first frame; \`last_frame\` alone pins only the tail)
\`\`\`json
{
  "model": "grok-imagine-video-1.5",
  "messages": [{"role": "user", "content": "camera glides from the day scene into the night skyline"}],
  "image": "https://example.com/first.jpg",
  "last_frame": "https://example.com/last.jpg"
}
\`\`\`

**Multi-reference** (first frame not locked; reference via \`<IMAGE_0>\`, \`<IMAGE_1>\` in the prompt)
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
e = e.slice(0, sec4en) + newSec4en + e.slice(sec5en);

e = e.replace("| `grok-imagine-video-1.5-preview` | **1–15** | `480p`/`720p` | image-to-video |\n", "");
e = e.replace("| `grok-1.5-video` | **6 or 10 only** | Path A | see §4 |\n", "");

const sec56en = e.indexOf("### 5.6 grok-imagine-video-1.5-preview");
const sec6en = e.indexOf("## 6. ASR");
if (!(sec56en > 0) || !(sec6en > sec56en)) throw new Error("en §5.6 bounds not found");
e = e.slice(0, sec56en) +
  "### 5.6 grok-imagine-video-1.5 → moved to the chat endpoint\n\nText / single image / first & last frame / multi-reference all go through `POST /v1/chat/completions` (official fields); see §4. Not part of Path B.\n\n" +
  e.slice(sec6en);

if (e.includes("grok-1.5-video") || e.includes("grok-imagine-video-1.5-preview")) {
  throw new Error("en ref still mentions delisted ids");
}
write("static/brand/keyo-api-ref.en.md", e);
console.log("keyo-api-ref.en.md patched");

/* ---------- video-capabilities.json ---------- */
const capPath = "static/brand/video-capabilities.json";
const cap = JSON.parse(read(capPath));
if (cap.models) {
  delete cap.models["grok-1.5-video"];
  delete cap.models["grok-imagine-video-1.5-preview"];
}
write(capPath, JSON.stringify(cap, null, 2) + "\n");
console.log("video-capabilities.json cleaned:", Object.keys(cap.models || {}).length, "models left");
console.log("DONE_DOCS_GROK_SWAP_R2");
