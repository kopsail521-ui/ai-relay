import fs from "fs";

const p = "static/brand/keyo-docs.html";
let s = fs.readFileSync(p, "utf8");

const pairs = [
  [
    '"videoImagineNote": "grok-imagine-video-1.5-preview is available on this path (and via POST /v1/videos)."',
    '"videoImagineNote": "grok-imagine-video-1.5-preview requires aspect_ratio (e.g. \\"16:9\\" or \\"9:16\\") in the JSON body."',
  ],
  [
    '"videoImagineNote": "grok-imagine-video-1.5-preview 已可用：本路径或 POST /v1/videos 均可。"',
    '"videoImagineNote": "grok-imagine-video-1.5-preview 必须在 JSON 里带 aspect_ratio（如 \\"16:9\\" / \\"9:16\\"）。"',
  ],
  [
    '"videoImagineNote": "grok-imagine-video-1.5-preview 已可用：本路徑或 POST /v1/videos 均可。"',
    '"videoImagineNote": "grok-imagine-video-1.5-preview 必須在 JSON 帶 aspect_ratio（如 \\"16:9\\" / \\"9:16\\"）。"',
  ],
  [
    '"videoImagineNote": "grok-imagine-video-1.5-preview は利用可能（このパスまたは POST /v1/videos）。"',
    '"videoImagineNote": "grok-imagine-video-1.5-preview は JSON に aspect_ratio（例 \\"16:9\\"）必須。"',
  ],
  [
    '"videoImagineNote": "grok-imagine-video-1.5-preview est disponible sur ce chemin (et via POST /v1/videos)."',
    '"videoImagineNote": "grok-imagine-video-1.5-preview exige aspect_ratio (ex. \\"16:9\\")."',
  ],
  [
    '"videoImagineNote": "grok-imagine-video-1.5-preview доступен (этот путь или POST /v1/videos)."',
    '"videoImagineNote": "grok-imagine-video-1.5-preview требует aspect_ratio (напр. \\"16:9\\")."',
  ],
  [
    '"videoImagineNote": "grok-imagine-video-1.5-preview đã dùng được (path này hoặc POST /v1/videos)."',
    '"videoImagineNote": "grok-imagine-video-1.5-preview bắt buộc aspect_ratio (vd \\"16:9\\")."',
  ],
];

let n = 0;
for (const [a, b] of pairs) {
  if (s.includes(a)) {
    s = s.replaceAll(a, b);
    n++;
  } else {
    console.log("MISS", a.slice(0, 70));
  }
}

const oldPrice =
  '"nGrokImagineVideo": "Grok Imagine · $0.08825/s 480p · $0.1545/s 720p"';
const newPrice =
  '"nGrokImagineVideo": "Grok Imagine · requires aspect_ratio · $0.08825/s 480p · $0.1545/s 720p"';
if (s.includes(oldPrice)) {
  s = s.replaceAll(oldPrice, newPrice);
  n++;
}

s = s.replaceAll(
  '"nVeoComponents": "~8s · per request · supply may vary"',
  '"nVeoComponents": "(delisted)"'
);
s = s.replaceAll(
  '"nVeoComponents": "约 8 秒 · 按次 · 供应视库存而定"',
  '"nVeoComponents": "（已下架）"'
);
s = s.replaceAll(
  '"nVeoComponents": "約 8 秒 · 按次 · 供應視庫存而定"',
  '"nVeoComponents": "（已下架）"'
);

fs.writeFileSync(p, s);
console.log("patched", n);
