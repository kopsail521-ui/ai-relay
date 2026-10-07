#!/usr/bin/env python3
html=open("/tmp/pricing-page.html",encoding="utf-8",errors="ignore").read()
print("icon_v5", "__keyoModelIconsV5" in html)
print("icon_logo", "/brand/logo.svg" in html)
print("icon_custom_png", "/brand/model-icons/" in html)
print("DONE_FIX_MODEL_ICONS")
