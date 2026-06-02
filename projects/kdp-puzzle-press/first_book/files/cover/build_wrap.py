#!/usr/bin/env python3
"""Build the KDP paperback wrap (back + spine + front) for *Anna Sen Mennä*.

Geometry for 5.5x8.5 trim, 0.125" bleed, cream stock (0.0025"/page spine).
Front reuses the chosen Nano Banana art + composited type (safe-area aware);
spine and back are set in the matching palette. Exports a 300-DPI PNG (preview)
and a 300-DPI PDF (KDP upload).

Usage:  python build_wrap.py <art.jpg> [page_count]
"""

import sys
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FONTS = HERE.parents[2] / "assets" / "fonts"
PLAYFAIR = FONTS / "PlayfairDisplay-Regular.ttf"
LATO = FONTS / "Lato-Regular.ttf"
GEORGIA = Path("C:/Windows/Fonts/georgia.ttf")
GEORGIA_IT = Path("C:/Windows/Fonts/georgiai.ttf")

DPI = 300
TRIM_W, TRIM_H = 5.5, 8.5
BLEED = 0.125
PAPER_MULT = 0.0025  # cream/white B&W per-page spine thickness (inches)

BONE = (236, 231, 219)
BONE_DIM = (201, 195, 182)
INKBG_TOP = (14, 19, 34)
INKBG_BOT = (8, 11, 20)

TITLE = "ANNA SEN MENNÄ"
SUBTITLE = "A FOLK HORROR NOVEL"
AUTHOR = "SEVEN MARTIN"
TAGLINE = "Some things the cold keeps."
BLURB = (
    "For nineteen years, Aino Hietala stayed away. When her father dies alone "
    "in the snowbound town of Kivijärvi, she comes north to bury him and empty "
    "the house — a week, in and out.\n\n"
    "But the lake behind the house is wrong. Footprints end at the foundation "
    "each night. A knocking comes up through the floor, three at a time, keeping "
    "perfect time. And out over the ice stands the sauna her father tended alone "
    "every week of his life — and the ledgers, going back to 1919, that record "
    "what four men did to the woman who would not leave her land, and what they "
    "built to keep her down.\n\n"
    "The watch her family kept for a hundred years is broken. The thaw is coming "
    "early. And whatever waits beneath the ice is done waiting."
)
IMPRINT = "SEVEN MARTIN"


def px(inches):
    return round(inches * DPI)


def vgrad(w, h, top, bot):
    g = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        g.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return g.resize((w, h))


def vgrad_rgba(w, h, top, bot):
    g = Image.new("RGBA", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        g.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(4)))
    return g.resize((w, h))


def tracked_w(text, font, tr):
    return sum(font.getlength(c) for c in text) + tr * (len(text) - 1) if text else 0


def draw_tracked(draw, text, font, cx, y, tr, fill):
    total = tracked_w(text, font, tr)
    x = cx - total / 2
    for c in text:
        draw.text((x, y), c, font=font, fill=fill)
        x += font.getlength(c) + tr


def fit_font(text, path, max_w, tr_ratio, start, lo=30):
    for s in range(start, lo, -2):
        f = ImageFont.truetype(str(path), s)
        if tracked_w(text, f, s * tr_ratio) <= max_w:
            return s, f
    return lo, ImageFont.truetype(str(path), lo)


def wrap_text(text, font, max_w):
    out = []
    for para in text.split("\n\n"):
        if para == "":
            out.append("")
            continue
        words = para.split()
        line = ""
        for w in words:
            t = (line + " " + w).strip()
            if font.getlength(t) <= max_w:
                line = t
            else:
                out.append(line)
                line = w
        out.append(line)
        out.append("")  # paragraph gap
    if out and out[-1] == "":
        out.pop()
    return out


def build_front(art_path, panel_w, panel_h, safe):
    """Front panel image (panel_w x panel_h). Trim edges: left=0 (spine fold),
    top/right/bottom carry bleed. `safe` = px inset from trim for type."""
    img = Image.open(art_path).convert("RGB")
    scale = max(panel_w / img.width, panel_h / img.height)
    nw, nh = round(img.width * scale), round(img.height * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    # keep the sauna roughly centered; bias down slightly to keep sky up top
    left = (nw - panel_w) // 2
    top = int((nh - panel_h) * 0.6)
    img = img.crop((left, top, left + panel_w, top + panel_h)).convert("RGBA")

    # scrims
    img.alpha_composite(vgrad_rgba(panel_w, int(panel_h * 0.46), (8, 12, 24, 140), (8, 12, 24, 0)), (0, 0))
    bh = int(panel_h * 0.26)
    img.alpha_composite(vgrad_rgba(panel_w, bh, (8, 12, 24, 0), (8, 12, 24, 175)), (0, panel_h - bh))

    d = ImageDraw.Draw(img)
    # center on the FRONT TRIM (trim width = panel_w - bleed on right; left trim at 0)
    trim_w = panel_w - px(BLEED)
    cx = trim_w / 2
    max_w = trim_w - 2 * safe

    tsize, tfont = fit_font(TITLE, PLAYFAIR, max_w, 0.06, start=190)
    ty = px(BLEED) + safe + int(panel_h * 0.045)
    draw_tracked(d, TITLE, tfont, cx, ty, tsize * 0.06, BONE)

    ry = ty + tsize + int(tsize * 0.5)
    rw = int(max_w * 0.42)
    d.line([(cx - rw // 2, ry), (cx + rw // 2, ry)], fill=BONE_DIM, width=3)

    sfont = ImageFont.truetype(str(LATO), 44)
    draw_tracked(d, SUBTITLE, sfont, cx, ry + int(tsize * 0.38), 44 * 0.30, BONE_DIM)

    afont = ImageFont.truetype(str(PLAYFAIR), 62)
    ay = panel_h - px(BLEED) - safe - 62
    draw_tracked(d, AUTHOR, afont, cx, ay, 62 * 0.10, BONE)
    return img.convert("RGB")


def build_back(panel_w, panel_h, safe):
    img = vgrad(panel_w, panel_h, INKBG_TOP, INKBG_BOT)
    d = ImageDraw.Draw(img)
    # trim: outer (left) at x=bleed, inner (right=spine fold) at panel_w. top bleed, bottom bleed.
    left_trim = px(BLEED)
    txt_l = left_trim + safe
    txt_r = panel_w - safe
    cx = (txt_l + txt_r) / 2
    text_w = txt_r - txt_l

    y = px(BLEED) + safe + int(panel_h * 0.06)
    # tagline (italic)
    tagf = ImageFont.truetype(str(GEORGIA_IT), 52)
    tw = tagf.getlength(TAGLINE)
    d.text((cx - tw / 2, y), TAGLINE, font=tagf, fill=BONE)
    y += 52 + int(panel_h * 0.045)

    # blurb
    bf = ImageFont.truetype(str(GEORGIA), 41)
    lead = 57
    for line in wrap_text(BLURB, bf, text_w):
        if line == "":
            y += int(lead * 0.55)
            continue
        lw = bf.getlength(line)
        d.text((cx - lw / 2, y), line, font=bf, fill=BONE)
        y += lead

    # imprint at bottom-left (kept clear of the bottom-right barcode zone)
    impf = ImageFont.truetype(str(LATO), 30)
    draw_tracked(d, IMPRINT, impf, cx, panel_h - px(BLEED) - safe - 30, 30 * 0.25, BONE_DIM)
    return img


def build_spine(spine_w, spine_h):
    img = vgrad(spine_w, spine_h, INKBG_TOP, INKBG_BOT)
    # render spine text horizontally on a tall strip then rotate
    strip_w, strip_h = spine_h, spine_w  # before rotation
    strip = Image.new("RGB", (strip_w, strip_h), INKBG_TOP)
    sd = ImageDraw.Draw(strip)
    # vertical-center band
    tf = ImageFont.truetype(str(PLAYFAIR), int(spine_w * 0.42))
    af = ImageFont.truetype(str(LATO), int(spine_w * 0.26))
    title = "Anna Sen Mennä"
    cy = strip_h / 2
    # title left-of-center, author right-of-center along the strip length
    tw = tf.getlength(title)
    sd.text((strip_w * 0.10, cy - tf.size * 0.62), title, font=tf, fill=BONE)
    aw = af.getlength(AUTHOR)
    sd.text((strip_w - strip_w * 0.10 - aw, cy - af.size * 0.55), AUTHOR, font=af, fill=BONE_DIM)
    strip = strip.rotate(90, expand=True)
    # paste centered onto spine
    img.paste(strip, ((spine_w - strip.width) // 2, (spine_h - strip.height) // 2))
    return img


def main():
    art = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    pages = int(sys.argv[2]) if len(sys.argv) > 2 else 222
    if not art or not art.exists():
        print("usage: python build_wrap.py <art.jpg> [page_count]")
        sys.exit(1)

    spine_in = pages * PAPER_MULT
    full_w = px(BLEED + TRIM_W + spine_in + TRIM_W + BLEED)
    full_h = px(BLEED + TRIM_H + BLEED)
    back_w = px(BLEED + TRIM_W)       # outer bleed + back trim
    spine_w = px(spine_in)
    front_w = full_w - back_w - spine_w
    safe = px(0.25)

    print(f"pages={pages} spine={spine_in:.3f}in  full={full_w}x{full_h}px "
          f"({full_w/DPI:.3f}x{full_h/DPI:.3f}in)")

    canvas = Image.new("RGB", (full_w, full_h), INKBG_BOT)
    canvas.paste(build_back(back_w, full_h, safe), (0, 0))
    canvas.paste(build_spine(spine_w, full_h), (back_w, 0))
    canvas.paste(build_front(art, front_w, full_h, safe), (back_w + spine_w, 0))

    png = HERE / "anna_sen_menna_cover_wrap.png"
    pdf = HERE / "anna_sen_menna_cover_wrap.pdf"
    canvas.save(png, "PNG")
    canvas.save(pdf, "PDF", resolution=float(DPI))
    print(f"Wrote {png}")
    print(f"Wrote {pdf}")


if __name__ == "__main__":
    main()
