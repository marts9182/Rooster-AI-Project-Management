#!/usr/bin/env python3
"""Compose the ebook front cover for *Anna Sen Mennä*.

Takes a Nano Banana art PNG/JPG (no text), fits it to the KDP ebook canvas
(1600x2560), lays subtle top/bottom scrims for legibility, and composites
crisp, letter-spaced typography using the repo's Playfair Display / Lato TTFs.

Usage:
    python compose_cover.py <input-art> [output.png]
"""

import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FONTS = HERE.parents[2] / "assets" / "fonts"  # projects/kdp-puzzle-press/assets/fonts
PLAYFAIR_BOLD = FONTS / "PlayfairDisplay-Bold.ttf"
PLAYFAIR_REG = FONTS / "PlayfairDisplay-Regular.ttf"
LATO_REG = FONTS / "Lato-Regular.ttf"

W, H = 1600, 2560
BONE = (236, 231, 219)
BONE_DIM = (200, 194, 181)

TITLE = "ANNA SEN MENNÄ"
SUBTITLE = "A FOLK HORROR NOVEL"
AUTHOR = "SEVEN MARTIN"


def fit_cover(img, w, h):
    """Scale to cover the canvas, then center-crop to exactly w x h."""
    img = img.convert("RGB")
    scale = max(w / img.width, h / img.height)
    nw, nh = round(img.width * scale), round(img.height * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    # bias the crop slightly downward so we keep more open sky at the top for the title
    top = int((nh - h) * 0.62)
    return img.crop((left, top, left + w, top + h))


def vgradient(w, h, top_rgba, bot_rgba):
    """Vertical gradient image (RGBA) from top_rgba to bot_rgba."""
    grad = Image.new("RGBA", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        px = tuple(round(top_rgba[i] + (bot_rgba[i] - top_rgba[i]) * t) for i in range(4))
        grad.putpixel((0, y), px)
    return grad.resize((w, h))


def tracked_width(text, font, tracking):
    if not text:
        return 0
    return sum(font.getlength(c) for c in text) + tracking * (len(text) - 1)


def draw_tracked(draw, text, font, cx, y, tracking, fill, anchor_v="top"):
    """Draw letter-spaced text horizontally centered on cx, top at y."""
    total = tracked_width(text, font, tracking)
    x = cx - total / 2
    asc, desc = font.getmetrics()
    yy = y
    if anchor_v == "mid":
        yy = y - (asc + desc) / 2
    for c in text:
        draw.text((x, yy), c, font=font, fill=fill)
        x += font.getlength(c) + tracking


def fit_font_size(text, font_path, max_w, tracking_ratio, start, lo=40):
    """Largest size whose tracked width fits max_w (tracking = size*tracking_ratio)."""
    for size in range(start, lo, -2):
        f = ImageFont.truetype(str(font_path), size)
        if tracked_width(text, f, size * tracking_ratio) <= max_w:
            return size, f
    f = ImageFont.truetype(str(font_path), lo)
    return lo, f


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if not src or not src.exists():
        print("usage: python compose_cover.py <input-art> [output.png]")
        sys.exit(1)
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "anna_sen_menna_cover_ebook.png"

    base = fit_cover(Image.open(src), W, H).convert("RGBA")

    # Subtle scrims: deepen the top behind the title and the very bottom behind the byline.
    shadow = (8, 12, 24, 0)
    top_scrim = vgradient(W, int(H * 0.46), (8, 12, 24, 135), shadow)
    base.alpha_composite(top_scrim, (0, 0))
    bot_h = int(H * 0.30)
    bot_scrim = vgradient(W, bot_h, shadow, (8, 12, 24, 175))
    base.alpha_composite(bot_scrim, (0, H - bot_h))

    draw = ImageDraw.Draw(base)
    cx = W // 2
    margin = 150
    max_w = W - 2 * margin

    # Title — Playfair Bold, all caps, tracked, fit to one line.
    tsize, tfont = fit_font_size(TITLE, PLAYFAIR_BOLD, max_w, 0.06, start=200)
    title_y = int(H * 0.10)
    draw_tracked(draw, TITLE, tfont, cx, title_y, tsize * 0.06, BONE)

    # Thin rule under the title.
    rule_y = title_y + tsize + int(tsize * 0.55)
    rule_w = int(max_w * 0.42)
    draw.line([(cx - rule_w // 2, rule_y), (cx + rule_w // 2, rule_y)], fill=BONE_DIM, width=3)

    # Subtitle — Lato, all caps, widely tracked, under the rule.
    sfont = ImageFont.truetype(str(LATO_REG), 46)
    sub_y = rule_y + int(tsize * 0.40)
    draw_tracked(draw, SUBTITLE, sfont, cx, sub_y, 46 * 0.30, BONE_DIM)

    # Byline — Playfair Regular caps, tracked, near the bottom.
    afont = ImageFont.truetype(str(PLAYFAIR_REG), 64)
    a_y = int(H * 0.905)
    draw_tracked(draw, AUTHOR, afont, cx, a_y, 64 * 0.10, BONE)

    base.convert("RGB").save(out, "PNG")
    print(f"Wrote {out} ({base.width}x{base.height})")


if __name__ == "__main__":
    main()
