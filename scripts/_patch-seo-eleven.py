#!/usr/bin/env python3
"""Generate static/seo/model/eleven-v4.html & eleven-v4-turbo.html
and add both models to models.html, tts-api.html, pricing.html, index.html,
sitemap.xml.

Prices: eleven-v4 ~$80 / 1M characters (cost $40 x2), v4-turbo ~$40 / 1M
(cost $20 x2), billed per input character. Sync POST /v1/audio/speech.
No upstream/reseller wording (OpenRouter/上游/二道/进货 must never appear).
"""
import io
import re
import sys

ROOT = "static/seo"
MODEL_DIR = ROOT + "/model"
TPL = io.open(MODEL_DIR + "/gemini-3.8-flash-tts.html", encoding="utf-8").read()

head = TPL.split("<body>", 1)[0] + "<body>\n"
tail = TPL.split("</main>", 1)[1]

HEADER = """<header class="k-nav">
  <a class="k-wordmark" href="/"><img src="/brand/logo.svg" alt="" width="22" height="22" />KeyoAPI</a>
  <nav aria-label="Primary">
    <a href="/pricing">Pricing</a>
    <a href="/models">Models</a>
    <a href="/compare">Compare</a>
    <a href="/brand/keyo-docs.html">Docs</a>
    <a href="/brand/faq.html">FAQ</a>
    <a href="/console">Console</a>
    <a href="/sign-in">Sign in</a>
    <a class="k-nav-cta" href="/sign-up">Get started</a>
  </nav>
</header>
"""


def build(m):
    return HEADER + """<main class="wrap">
<h1>%(h1)s</h1>
<p class="lead">%(lead)s</p>
<p class="meta">Listed price: <span class="ok">%(price)s</span> · Confirm live on <a href="/pricing">interactive pricing</a>.</p>
<div class="btnrow">
  <a class="btn btn-primary" href="/pricing">Open interactive pricing</a>
  <a class="btn btn-secondary" href="/compare">Compare API prices</a>
  <a class="btn btn-secondary" href="/sign-up">Create account</a>
</div>
<h2>Overview</h2>
<p>%(overview)s</p>
<h2>Quick start</h2>
<div class="card">
<p>Base URL: <code>https://www.keyoapi.xyz/v1</code></p>
<p>Endpoint: <code>POST /v1/audio/speech</code></p>
<p>Model: <code>model=%(id)s</code></p>
<pre><code>%(curl)s</code></pre>
<p>Auth uses the same Bearer API key as chat. Full notes: <a href="/brand/keyo-docs.html">Keyo docs</a>.</p>
</div>
<h2>FAQ</h2>
<div class="faq">%(faq)s</div>
<h2>Related models</h2>
<div class="grid">%(related)s</div>
<p class="meta">Guide for <strong>%(id)s</strong>. Catalog: <a href="/pricing">the pricing page</a> · Try/buy: <a href="/pricing">Model Square</a>.</p>
</main>
""" % m + tail


MODELS = [
    {
        "id": "eleven-v4",
        "name": "Eleven V4",
        "price": "~$80 / 1M characters",
        "ld_price": "$80 / 1M characters",
        "title": "Eleven V4 API on KeyoAPI | Speech",
        "h1": "Eleven V4 API on KeyoAPI — High-Fidelity Speech",
        "lead": "Eleven V4 for expressive, high-fidelity text-to-speech on the same Keyo API key as chat — one POST /v1/audio/speech returns audio in a single round trip.",
        "overview": ("eleven-v4 is a high-fidelity neural text-to-speech model on KeyoAPI. "
                     "Indicative rates about $80 per 1M characters, billed per input character — "
                     "confirm live on <a href=\"/pricing\">Model Square</a>. Call POST /v1/audio/speech "
                     "with model=eleven-v4, an input string, and a built-in voice; audio comes back "
                     "synchronously in the response. Choose a voice by name (george, sarah, adam, alice, "
                     "bella, bill, brian, callum, charlie, chris, daniel, eric, harry, jessica, laura, "
                     "liam, lily, matilda, river, roger, will)."),
        "curl": ("curl https://www.keyoapi.xyz/v1/audio/speech \\\n"
                 '  -H "Authorization: Bearer YOUR_API_KEY" \\\n'
                 '  -H "Content-Type: application/json" \\\n'
                 '  -d \'{"model":"eleven-v4","input":"Hello from Eleven V4.","voice":"george","response_format":"mp3"}\' \\\n'
                 "  --output speech.mp3"),
        "faq": [
            ("Sync or async?",
             "Sync: POST /v1/audio/speech returns audio in the same response. Async TTS on Keyo remains Qwen3-TTS / CosyVoice3."),
            ("How is pricing metered?",
             "eleven-v4 bills per input character. Indicative ~$80 per 1M characters; confirm live rates on Model Square."),
            ("Which voices are available?",
             "Built-in voices include george, sarah, adam, alice, bella, bill, brian, callum, charlie, chris, daniel, eric, harry, jessica, laura, liam, lily, matilda, river, roger, and will."),
        ],
        "related": """<a href="/model/IndexTTS-2">IndexTTS-2 API</a>
<a href="/model/CosyVoice3">CosyVoice3 API</a>
<a href="/model/gemini-3.8-flash-tts">Gemini 3.8 Flash TTS API</a>
<a href="/model/eleven-v4-turbo">Eleven V4 Turbo API</a>""",
    },
    {
        "id": "eleven-v4-turbo",
        "name": "Eleven V4 Turbo",
        "price": "~$40 / 1M characters",
        "ld_price": "$40 / 1M characters",
        "title": "Eleven V4 Turbo API on KeyoAPI | Speech",
        "h1": "Eleven V4 Turbo API on KeyoAPI — Fast Speech",
        "lead": "Eleven V4 Turbo for low-latency, high-quality text-to-speech on the same Keyo API key as chat — POST /v1/audio/speech returns audio fast.",
        "overview": ("eleven-v4-turbo is a fast neural text-to-speech model on KeyoAPI. "
                     "Indicative rates about $40 per 1M characters, billed per input character — "
                     "confirm live on <a href=\"/pricing\">Model Square</a>. Call POST /v1/audio/speech "
                     "with model=eleven-v4-turbo, an input string, and a built-in voice; audio comes "
                     "back synchronously in the response. It is tuned for real-time interactions and "
                     "large-scale generation."),
        "curl": ("curl https://www.keyoapi.xyz/v1/audio/speech \\\n"
                 '  -H "Authorization: Bearer YOUR_API_KEY" \\\n'
                 '  -H "Content-Type: application/json" \\\n'
                 '  -d \'{"model":"eleven-v4-turbo","input":"Hello from Eleven V4 Turbo.","voice":"george","response_format":"mp3"}\' \\\n'
                 "  --output speech.mp3"),
        "faq": [
            ("Sync or async?",
             "Sync: POST /v1/audio/speech returns audio in the same response. Async TTS on Keyo remains Qwen3-TTS / CosyVoice3."),
            ("How is pricing metered?",
             "eleven-v4-turbo bills per input character. Indicative ~$40 per 1M characters; confirm live rates on Model Square."),
            ("Which voices are available?",
             "Built-in voices include george, sarah, adam, alice, bella, bill, brian, callum, charlie, chris, daniel, eric, harry, jessica, laura, liam, lily, matilda, river, roger, and will."),
        ],
        "related": """<a href="/model/IndexTTS-2">IndexTTS-2 API</a>
<a href="/model/CosyVoice3">CosyVoice3 API</a>
<a href="/model/gemini-3.8-flash-tts">Gemini 3.8 Flash TTS API</a>
<a href="/model/eleven-v4">Eleven V4 API</a>""",
    },
]

META_DESC = {
    "eleven-v4": "Call eleven-v4 on KeyoAPI (~$80 / 1M characters). Sync text-to-speech via POST /v1/audio/speech with expressive built-in voices.",
    "eleven-v4-turbo": "Call eleven-v4-turbo on KeyoAPI (~$40 / 1M characters). Sync text-to-speech via POST /v1/audio/speech for real-time voice.",
}

for m in MODELS:
    mid = m["id"]
    meta = META_DESC[mid]
    ld = (
        '{"@context":"https://schema.org","@type":"SoftwareApplication",'
        '"name":"KeyoAPI %(id)s","applicationCategory":"DeveloperApplication",'
        '"url":"https://www.keyoapi.xyz/model/%(id)s","description":"%(meta)s",'
        '"offers":{"@type":"Offer","priceCurrency":"USD","description":"%(ld)s"}}'
    ) % {"id": mid, "meta": meta, "ld": m["ld_price"]}

    head_m = head.replace("<title>Gemini 3.8 Flash TTS API on KeyoAPI | Speech</title>", "<title>%s</title>" % m["title"])
    head_m = re.sub(
        r'<meta name="description" content="[^"]*" />',
        '<meta name="description" content="%s" />' % meta,
        head_m,
    )
    head_m = re.sub(
        r'<link rel="canonical" href="https://www.keyoapi.xyz/model/gemini-3.8-flash-tts" />',
        '<link rel="canonical" href="https://www.keyoapi.xyz/model/%s" />' % mid,
        head_m,
    )
    head_m = re.sub(
        r'<meta property="og:url" content="https://www.keyoapi.xyz/model/gemini-3.8-flash-tts" />',
        '<meta property="og:url" content="https://www.keyoapi.xyz/model/%s" />' % mid,
        head_m,
    )
    head_m = re.sub(
        r'<meta property="og:title" content="[^"]*" />',
        '<meta property="og:title" content="%s" />' % m["title"],
        head_m,
    )
    head_m = re.sub(
        r'<meta property="og:description" content="[^"]*" />',
        '<meta property="og:description" content="%s" />' % meta,
        head_m,
    )
    head_m = re.sub(
        r'<meta name="twitter:title" content="[^"]*" />',
        '<meta name="twitter:title" content="%s" />' % m["title"],
        head_m,
    )
    head_m = re.sub(
        r'<meta name="twitter:description" content="[^"]*" />',
        '<meta name="twitter:description" content="%s" />' % meta,
        head_m,
    )
    head_m = head_m.replace(
        '<script type="application/ld+json">{...}</script>',
        "",
    )
    # replace the ld+json block
    head_m = re.sub(
        r'<script type="application/ld\+json">\{.*?\}</script>',
        '<script type="application/ld+json">%s</script>' % ld,
        head_m,
        flags=re.S,
    )

    faq = "".join(
        "<details><summary>%s</summary><p>%s</p></details>" % (s, p) for s, p in m["faq"]
    )
    body = build({**m, "faq": faq})
    out = head_m + body
    path = MODEL_DIR + "/" + mid + ".html"
    io.open(path, "w", encoding="utf-8", newline="\n").write(out)
    print("wrote", path, len(out), "bytes")

# ---- patch list pages ----
LEAK = re.compile(r"OpenRouter|openrouter|上游|二道|进货|转售|passthrough|reseller")


def load(p):
    return io.open(p, encoding="utf-8").read()


def save(p, s):
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)


def add_row(p, rows):
    s = load(p)
    for mid, price in rows:
        row = (
            '<tr><td><a href="/model/%s"><code>%s</code></a></td><td>speech</td>'
            '<td class="ok">%s</td><td><a href="/model/%s">Guide</a> · <a href="/pricing">Catalog</a></td></tr>'
            % (mid, mid, price, mid)
        )
        if row not in s:
            s = s.replace("</tbody>", row + "</tbody>", 1)
    save(p, s)
    print("patched", p)


# models.html: insert rows right after the gemini-3.8-flash-tts row (before </tbody>)
add_row(
    ROOT + "/models.html",
    [("eleven-v4", "~$80 / 1M characters"), ("eleven-v4-turbo", "~$40 / 1M characters")],
)

# pricing.html: same table shape, endpoint column
s = load(ROOT + "/pricing.html")
for mid, price in [("eleven-v4", "~$80 / 1M characters"), ("eleven-v4-turbo", "~$40 / 1M characters")]:
    row = (
        '<tr>\n  <td><a href="/model/%s"><code>%s</code></a></td>\n  <td>speech</td>\n'
        '  <td class="ok">%s</td>\n  <td><code>POST /v1/audio/speech</code></td>\n'
        '  <td><a href="/model/%s">Guide</a> · <a href="/pricing">Catalog</a></td>\n</tr>'
        % (mid, mid, price, mid)
    )
    if row not in s:
        s = s.replace("</tbody>", row + "</tbody>", 1)
save(ROOT + "/pricing.html", s)
print("patched pricing.html")

# tts-api.html: model table rows before </tbody>
s = load(ROOT + "/tts-api.html")
for mid, desc, price in [
    ("eleven-v4", "Sync high-fidelity TTS — token-billed per input character", "~$80 / 1M characters"),
    ("eleven-v4-turbo", "Sync low-latency TTS — token-billed per input character", "~$40 / 1M characters"),
]:
    row = (
        '<tr>\n  <td><a href="/model/%s"><code>%s</code></a></td>\n  <td>%s</td>\n'
        '  <td class="ok">%s</td>\n'
        '  <td>POST /v1/audio/speech · guide <a href="/model/%s">the %s model page</a></td>\n</tr>'
        % (mid, mid, desc, price, mid, mid)
    )
    if row not in s:
        s = s.replace("</tbody>", row + "</tbody>", 1)
# also update the "Indicative rates above" paragraph to reference new guides
old_guides = 'and <a href="/model/gemini-3.8-flash-tts">the gemini-3.8-flash-tts model page</a> (live rates on <a href="/pricing">the pricing page</a>).'
new_guides = 'the <a href="/model/eleven-v4">eleven-v4 model page</a>, <a href="/model/eleven-v4-turbo">the eleven-v4-turbo model page</a>, and <a href="/model/gemini-3.8-flash-tts">the gemini-3.8-flash-tts model page</a> (live rates on <a href="/pricing">the pricing page</a>).'
if old_guides in s:
    s = s.replace(old_guides, new_guides)
save(ROOT + "/tts-api.html", s)
print("patched tts-api.html")

# index.html: add model links before the closing </div> of the model grid
s = load(ROOT + "/index.html")
for mid in ["eleven-v4", "eleven-v4-turbo"]:
    link = '<a href="/model/%s">%s</a>' % (mid, mid)
    if link not in s:
        s = s.replace('<a href="/model/gemini-3.8-flash-tts">gemini-3.8-flash-tts</a>', link + "\n<a href=\"/model/gemini-3.8-flash-tts\">gemini-3.8-flash-tts</a>", 1)
save(ROOT + "/index.html", s)
print("patched index.html")

# sitemap.xml: add <url> entries after the gemini-3.8-flash-tts url
for p in (ROOT + "/sitemap.xml",):
    s = load(p)
    anchor = "<url><loc>https://www.keyoapi.xyz/model/gemini-3.8-flash-tts</loc>"
    assert anchor in s, p
    entries = ""
    for mid in ("eleven-v4", "eleven-v4-turbo"):
        if ("https://www.keyoapi.xyz/model/%s</loc>" % mid) in s:
            continue
        e = (
            "<url><loc>https://www.keyoapi.xyz/model/%s</loc><lastmod>2026-10-12</lastmod>"
            "<changefreq>weekly</changefreq><priority>0.9</priority></url>"
        ) % mid
        entries += e + "\n  "
    if entries:
        s = s.replace(anchor, entries + anchor, 1)
    save(p, s)
    print("patched", p)

# ---- verification ----
blob = "\n".join(load(p) for p in [
    MODEL_DIR + "/eleven-v4.html",
    MODEL_DIR + "/eleven-v4-turbo.html",
    ROOT + "/models.html",
    ROOT + "/tts-api.html",
    ROOT + "/pricing.html",
    ROOT + "/index.html",
])
leaks = LEAK.findall(blob)
assert not leaks, leaks
for mid in ("eleven-v4", "eleven-v4-turbo"):
    assert load(MODEL_DIR + "/" + mid + ".html").count("/pricing") >= 3, mid
    assert load(ROOT + "/models.html").count(">" + mid + "<") >= 1
    assert load(ROOT + "/pricing.html").count(">" + mid + "<") >= 1
    assert load(ROOT + "/tts-api.html").count(">" + mid + "<") >= 1
    assert load(ROOT + "/index.html").count(">" + mid + "<") >= 1
    assert load(ROOT + "/sitemap.xml").count("https://www.keyoapi.xyz/model/" + mid + "</loc>") == 1
print("SEO_PATCH_OK")