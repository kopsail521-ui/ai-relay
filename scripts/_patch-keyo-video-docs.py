# -*- coding: utf-8 -*-
"""Patch keyo-docs.html i18n + curl samples for dual video paths."""
from pathlib import Path

p = Path("static/brand/keyo-docs.html")
t = p.read_text(encoding="utf-8")

# --- renderSamples: add curl-video-gen, change video example to grok-1.5-video ---
old_video = """  if (video) {
    video.innerHTML = '<code><span class="tok-cmd">curl</span> https://www.keyoapi.xyz/v1/videos \\\\\\n' +
      '  -H <span class="tok-str">"Authorization: Bearer ' + escapeHtml(key) + '"</span> \\\\\\n' +
      '  -H <span class="tok-str">"Content-Type: application/json"</span> \\\\\\n' +
      '  -d <span class="tok-str">\\'{\\n    "model": "veo_3_1-components",\\n    "prompt": "A red paper boat floating on calm water at sunset"\\n  }\\'</span></code>';
  }"""

# Use actual file content (single backslashes in source)
old_video = """  if (video) {
    video.innerHTML = '<code><span class="tok-cmd">curl</span> https://www.keyoapi.xyz/v1/videos \\\\\\n' +
      '  -H <span class="tok-str">"Authorization: Bearer ' + escapeHtml(key) + '"</span> \\\\\\n' +
      '  -H <span class="tok-str">"Content-Type: application/json"</span> \\\\\\n' +
      '  -d <span class="tok-str">\\'{\\n    "model": "veo_3_1-components",\\n    "prompt": "A red paper boat floating on calm water at sunset"\\n  }\\'</span></code>';
  }"""

# Read exact snippet from file
start = t.find("  if (video) {")
end = t.find("  if (asr) {")
assert start > 0 and end > start, (start, end)
old_block = t[start:end]
new_block = """  if (video) {
    video.innerHTML = '<code><span class="tok-cmd">curl</span> https://www.keyoapi.xyz/v1/videos \\\\\\n' +
      '  -H <span class="tok-str">"Authorization: Bearer ' + escapeHtml(key) + '"</span> \\\\\\n' +
      '  -H <span class="tok-str">"Content-Type: application/json"</span> \\\\\\n' +
      '  -d <span class="tok-str">\\'{\\n    "model": "grok-1.5-video",\\n    "prompt": "A red paper boat floating on calm water at sunset"\\n  }\\'</span></code>';
  }
  const videoGen = document.getElementById('curl-video-gen');
  if (videoGen) {
    videoGen.innerHTML = '<code><span class="tok-cmd">curl</span> https://www.keyoapi.xyz/v1/videos/generations \\\\\\n' +
      '  -H <span class="tok-str">"Authorization: Bearer ' + escapeHtml(key) + '"</span> \\\\\\n' +
      '  -H <span class="tok-str">"Content-Type: application/json"</span> \\\\\\n' +
      '  -d <span class="tok-str">\\'{\\n    "model": "wan3.0-video",\\n    "prompt": "A kitten running on a moonlit rooftop",\\n    "resolution": "720P",\\n    "duration": 5\\n  }\\'</span></code>';
  }
"""
# Fix escaping - in the HTML file, the JS uses \\n for newline in strings and \\\ for line continuation
# Let me copy exact pattern from old_block
print("OLD BLOCK PREVIEW:")
print(repr(old_block[:200]))
print("---")
print(repr(old_block[-80:]))
