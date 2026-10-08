#!/usr/bin/env python3
"""Regenerate static/brand/logo.png + favicon.ico from the logo.svg geometry.

The SVG (static/brand/logo.svg) is the single source of the KeyoAPI mark:
64x64 viewBox, dark rounded square (#1c1c19), white square-capped K strokes
(#f6f5f1, width 5), green dot (#21564b). This script rasterises that exact
geometry (supersampled x16, LANCZOS downscale) so /logo.png and /favicon.ico
served by Caddy match the SVG mark instead of the new-api stock icons.

  py scripts/gen-brand-icons.py
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 16  # supersample: 64 * 16 = 1024

BG = "#1c1c19"
FG = "#f6f5f1"
DOT = "#21564b"

# SVG path segments in 64-unit space, stroke width 5, stroke-linecap="square".
# Square caps extend each end by w/2 = 2.5 along the segment direction.
SEGMENTS = [
    ((18, 14), (18, 50)),   # M18 14v36
    ((18, 32), (34, 16)),   # M18 32l16-16
    ((18, 32), (34, 48)),   # M18 32l16 16
    ((34, 32), (46, 32)),   # M34 32h12
]
DOT_C, DOT_R = (50, 32), 3.5


def _cap_extend(p, q, half_w):
    (x1, y1), (x2, y2) = p, q
    dx, dy = x2 - x1, y2 - y1
    length = (dx * dx + dy * dy) ** 0.5
    ux, uy = (dx / length, dy / length) if length else (0.0, 0.0)
    return (x1 - ux * half_w, y1 - uy * half_w), (x2 + ux * half_w, y2 + uy * half_w)


def render(size: int) -> Image.Image:
    img = Image.new("RGBA", (64 * S, 64 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, 64 * S - 1, 64 * S - 1], radius=8 * S, fill=BG)
    half_w = 2.5
    stroke = 5 * S
    for p, q in SEGMENTS:
        a, b = _cap_extend(p, q, half_w)
        d.line(
            [a[0] * S, a[1] * S, b[0] * S, b[1] * S],
            fill=FG, width=stroke,
        )
    cx, cy, r = DOT_C[0] * S, DOT_C[1] * S, DOT_R * S
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=DOT)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    big = render(1024)  # master
    png = render(512)
    png_path = os.path.join(ROOT, "static", "brand", "logo.png")
    png.save(png_path, format="PNG", optimize=True)
    print("wrote", png_path, png.size)

    ico_path = os.path.join(ROOT, "static", "brand", "favicon.ico")
    big.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("wrote", ico_path)


if __name__ == "__main__":
    main()
