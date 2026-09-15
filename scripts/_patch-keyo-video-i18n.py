# -*- coding: utf-8 -*-
"""Inject dual-video i18n keys into keyo-docs.html for every locale."""
from pathlib import Path
import re

p = Path("static/brand/keyo-docs.html")
t = p.read_text(encoding="utf-8")

LOCALES = {
    "en": {
        "tocVideo": "Video A",
        "tocVideoGen": "Video B",
        "videoTitle": "Video — /v1/videos",
        "videoTitleGen": "Video — /v1/videos/generations",
        "videoIntroA": "Use this path only for the models in the table below. Do not send wan / Seedance / FLUX here.",
        "videoIntroB": "Use this path for wan / Seedance / FLUX / MiniMax / Gemini Omni. Wrong path → Invalid URL.",
        "videoHint": "Async: POST /v1/videos, then poll GET /v1/videos/{id}. Billing follows the console.",
        "videoHintGen": "Async: POST /v1/videos/generations, then poll GET /v1/tasks/{task_id}. Billing follows the console.",
        "videoImagineNote": "Note: grok-imagine-video-1.5-preview is temporarily unavailable — do not use it yet.",
        "nGrokVideo": "text/ref · 1–15s · per request",
        "nVeoComponents": "~8s · per request · supply may vary",
        "nWanVideo": "480P/720P/1080P · per second",
        "nSeedance25": "by resolution · per second",
        "nSeedance20": "by resolution · per second",
        "nFluxVideo": "DRAFT/HD/FHD · per second",
        "nMinimaxVideo": "768P / 2K · per second",
        "nGemOmni": "per second",
        "nGemOmniExt": "pack or ref /s",
    },
    "zhCN": {
        "tocVideo": "视频 A",
        "tocVideoGen": "视频 B",
        "videoTitle": "视频 — /v1/videos",
        "videoTitleGen": "视频 — /v1/videos/generations",
        "videoIntroA": "下表模型请用本路径。不要把 wan / Seedance / FLUX 打到这里。",
        "videoIntroB": "wan / Seedance / FLUX / MiniMax / Gemini Omni 请用本路径。路径错了会报 Invalid URL。",
        "videoHint": "异步：POST /v1/videos 创建，再 GET /v1/videos/{id} 查询。扣费以控制台为准。",
        "videoHintGen": "异步：POST /v1/videos/generations 创建，再 GET /v1/tasks/{task_id} 查询。扣费以控制台为准。",
        "videoImagineNote": "说明：grok-imagine-video-1.5-preview 暂不可用，请先不要调用。",
        "nGrokVideo": "文生/参考图 · 1–15 秒 · 按次",
        "nVeoComponents": "约 8 秒 · 按次 · 供应视上游而定",
        "nWanVideo": "480P/720P/1080P · 按秒",
        "nSeedance25": "按分辨率 · 按秒",
        "nSeedance20": "按分辨率 · 按秒",
        "nFluxVideo": "DRAFT/HD/FHD · 按秒",
        "nMinimaxVideo": "768P / 2K · 按秒",
        "nGemOmni": "按秒",
        "nGemOmniExt": "档位或参考按秒",
    },
    "zhTW": {
        "tocVideo": "影片 A",
        "tocVideoGen": "影片 B",
        "videoTitle": "影片 — /v1/videos",
        "videoTitleGen": "影片 — /v1/videos/generations",
        "videoIntroA": "下表模型請用本路徑。不要把 wan / Seedance / FLUX 打到這裡。",
        "videoIntroB": "wan / Seedance / FLUX / MiniMax / Gemini Omni 請用本路徑。路徑錯了會報 Invalid URL。",
        "videoHint": "非同步：POST /v1/videos 建立，再 GET /v1/videos/{id} 查詢。扣費以控制台為準。",
        "videoHintGen": "非同步：POST /v1/videos/generations 建立，再 GET /v1/tasks/{task_id} 查詢。扣費以控制台為準。",
        "videoImagineNote": "說明：grok-imagine-video-1.5-preview 暫不可用，請先不要呼叫。",
        "nGrokVideo": "文生/參考圖 · 1–15 秒 · 按次",
        "nVeoComponents": "約 8 秒 · 按次 · 供應視上游而定",
        "nWanVideo": "480P/720P/1080P · 按秒",
        "nSeedance25": "按解析度 · 按秒",
        "nSeedance20": "按解析度 · 按秒",
        "nFluxVideo": "DRAFT/HD/FHD · 按秒",
        "nMinimaxVideo": "768P / 2K · 按秒",
        "nGemOmni": "按秒",
        "nGemOmniExt": "檔位或參考按秒",
    },
    "ja": {
        "tocVideo": "動画 A",
        "tocVideoGen": "動画 B",
        "videoTitle": "動画 — /v1/videos",
        "videoTitleGen": "動画 — /v1/videos/generations",
        "videoIntroA": "下表のモデルのみこのパス。wan / Seedance / FLUX は送らないでください。",
        "videoIntroB": "wan / Seedance / FLUX / MiniMax / Gemini Omni はこのパス。誤ると Invalid URL。",
        "videoHint": "非同期：POST /v1/videos → GET /v1/videos/{id}。課金はコンソール準拠。",
        "videoHintGen": "非同期：POST /v1/videos/generations → GET /v1/tasks/{task_id}。課金はコンソール準拠。",
        "videoImagineNote": "注：grok-imagine-video-1.5-preview は一時利用不可。",
        "nGrokVideo": "テキスト/参照 · 1–15秒 · リクエスト課金",
        "nVeoComponents": "約8秒 · リクエスト · 供給は上流次第",
        "nWanVideo": "480P/720P/1080P · 秒課金",
        "nSeedance25": "解像度別 · 秒課金",
        "nSeedance20": "解像度別 · 秒課金",
        "nFluxVideo": "DRAFT/HD/FHD · 秒課金",
        "nMinimaxVideo": "768P / 2K · 秒課金",
        "nGemOmni": "秒課金",
        "nGemOmniExt": "パックまたは参照/秒",
    },
    "fr": {
        "tocVideo": "Vidéo A",
        "tocVideoGen": "Vidéo B",
        "videoTitle": "Vidéo — /v1/videos",
        "videoTitleGen": "Vidéo — /v1/videos/generations",
        "videoIntroA": "Utilisez ce chemin uniquement pour les modèles du tableau. Pas wan / Seedance / FLUX ici.",
        "videoIntroB": "wan / Seedance / FLUX / MiniMax / Gemini Omni : ce chemin. Sinon Invalid URL.",
        "videoHint": "Async : POST /v1/videos puis GET /v1/videos/{id}. Facturation = console.",
        "videoHintGen": "Async : POST /v1/videos/generations puis GET /v1/tasks/{task_id}. Facturation = console.",
        "videoImagineNote": "Note : grok-imagine-video-1.5-preview est temporairement indisponible.",
        "nGrokVideo": "texte/réf · 1–15s · par requête",
        "nVeoComponents": "~8s · par requête · stock variable",
        "nWanVideo": "480P/720P/1080P · par seconde",
        "nSeedance25": "par résolution · /s",
        "nSeedance20": "par résolution · /s",
        "nFluxVideo": "DRAFT/HD/FHD · /s",
        "nMinimaxVideo": "768P / 2K · /s",
        "nGemOmni": "par seconde",
        "nGemOmniExt": "pack ou réf /s",
    },
    "ru": {
        "tocVideo": "Видео A",
        "tocVideoGen": "Видео B",
        "videoTitle": "Видео — /v1/videos",
        "videoTitleGen": "Видео — /v1/videos/generations",
        "videoIntroA": "Только модели из таблицы. Не отправляйте wan / Seedance / FLUX сюда.",
        "videoIntroB": "wan / Seedance / FLUX / MiniMax / Gemini Omni — этот путь. Иначе Invalid URL.",
        "videoHint": "Асинхронно: POST /v1/videos, затем GET /v1/videos/{id}. Списание — по консоли.",
        "videoHintGen": "Асинхронно: POST /v1/videos/generations, затем GET /v1/tasks/{task_id}. Списание — по консоли.",
        "videoImagineNote": "Примечание: grok-imagine-video-1.5-preview временно недоступен.",
        "nGrokVideo": "текст/реф · 1–15с · за запрос",
        "nVeoComponents": "~8с · за запрос · наличие зависит от апстрима",
        "nWanVideo": "480P/720P/1080P · за секунду",
        "nSeedance25": "по разрешению · /с",
        "nSeedance20": "по разрешению · /с",
        "nFluxVideo": "DRAFT/HD/FHD · /с",
        "nMinimaxVideo": "768P / 2K · /с",
        "nGemOmni": "за секунду",
        "nGemOmniExt": "пакет или реф /с",
    },
    "vi": {
        "tocVideo": "Video A",
        "tocVideoGen": "Video B",
        "videoTitle": "Video — /v1/videos",
        "videoTitleGen": "Video — /v1/videos/generations",
        "videoIntroA": "Chỉ dùng path này cho bảng dưới. Đừng gửi wan / Seedance / FLUX vào đây.",
        "videoIntroB": "wan / Seedance / FLUX / MiniMax / Gemini Omni dùng path này. Sai path → Invalid URL.",
        "videoHint": "Async: POST /v1/videos rồi GET /v1/videos/{id}. Tính phí theo console.",
        "videoHintGen": "Async: POST /v1/videos/generations rồi GET /v1/tasks/{task_id}. Tính phí theo console.",
        "videoImagineNote": "Lưu ý: grok-imagine-video-1.5-preview tạm không dùng được.",
        "nGrokVideo": "text/ref · 1–15s · theo lần",
        "nVeoComponents": "~8s · theo lần · nguồn tùy upstream",
        "nWanVideo": "480P/720P/1080P · theo giây",
        "nSeedance25": "theo độ phân giải · /s",
        "nSeedance20": "theo độ phân giải · /s",
        "nFluxVideo": "DRAFT/HD/FHD · /s",
        "nMinimaxVideo": "768P / 2K · /s",
        "nGemOmni": "theo giây",
        "nGemOmniExt": "gói hoặc ref /s",
    },
}

KEYS_ORDER = [
    "tocVideo",
    "tocVideoGen",
    "videoTitle",
    "videoTitleGen",
    "videoIntroA",
    "videoIntroB",
    "videoHint",
    "videoHintGen",
    "videoImagineNote",
    "nGrokVideo",
    "nVeoComponents",
    "nWanVideo",
    "nSeedance25",
    "nSeedance20",
    "nFluxVideo",
    "nMinimaxVideo",
    "nGemOmni",
    "nGemOmniExt",
]


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def upsert_locale(block: str, locale: str) -> str:
    bag = LOCALES[locale]
    # Remove old keys we manage if present, then insert after tocVideo or videoTitle area
    for k in KEYS_ORDER:
        block = re.sub(rf'\s*"{k}":\s*"(?:\\.|[^"\\])*",?\n', "\n", block)
    # Insert after "tocVideo" line if exists, else after tocImage
    insert = "".join(f'    "{k}": "{esc(bag[k])}",\n' for k in KEYS_ORDER)
    if '"tocImage"' in block:
        block = re.sub(
            r'("tocImage":\s*"(?:\\.|[^"\\])*",\n)',
            r"\1" + insert,
            block,
            count=1,
        )
    else:
        # fallback: after language object open is wrong; append before closing of known key
        block = insert + block
    return block


# Split I18N object by top-level locale keys
# Pattern: "en": { ... },
pattern = re.compile(
    r'("(?P<loc>en|zhCN|zhTW|ja|fr|ru|vi)":\s*\{)(?P<body>.*?)(\n  \},)',
    re.S,
)


def repl(m):
    loc = m.group("loc")
    body = m.group("body")
    # body is content inside locale object without outer braces - actually includes leading newline
    # Reconstruct as full object content
    full = m.group(1) + body + m.group(3)
    # Work on the body+we need to upsert into body
    new_body = upsert_locale(body, loc)
    return m.group(1) + new_body + m.group(3)


new_t, n = pattern.subn(repl, t)
print("locales patched", n)
if n != 7:
    raise SystemExit("expected 7 locales, got %s" % n)
p.write_text(new_t, encoding="utf-8")
print("ok", p)
