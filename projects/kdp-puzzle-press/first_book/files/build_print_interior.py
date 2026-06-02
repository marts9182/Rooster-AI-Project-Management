#!/usr/bin/env python3
"""Build the KDP paperback interior PDF for *Anna Sen Mennä* (5.5 x 8.5).

Reads chapters/*.md (same minimal dialect as build_book.mjs), adds front matter
(title + copyright) and back matter (about the author), and lays a print-ready
interior with embedded fonts, mir(symmetric)-safe margins meeting KDP gutter
minimums, running heads, folios, and chapter openers.

Body: Georgia (embeddable MS core web font). Display/openers + title page:
Playfair Display (OFL, matches the cover). Output yields the page count for the
spine. Run:  python build_print_interior.py
"""

import re
from pathlib import Path

from reportlab.lib.pagesizes import inch
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    NextPageTemplate, FrameBreak,
)

HERE = Path(__file__).resolve().parent
CHAPTERS_DIR = HERE / "chapters"
OUT = HERE / "anna_sen_menna_kdp_print_interior.pdf"
FONTS = HERE.parents[1] / "assets" / "fonts"  # projects/kdp-puzzle-press/assets/fonts
WINFONTS = Path("C:/Windows/Fonts")

BOOK_TITLE = "Anna Sen Mennä"
SUBTITLE = "A Folk Horror Novel"
AUTHOR = "Seven Martin"

# ---- fonts ---------------------------------------------------------------
pdfmetrics.registerFont(TTFont("Georgia", WINFONTS / "georgia.ttf"))
pdfmetrics.registerFont(TTFont("Georgia-Bold", WINFONTS / "georgiab.ttf"))
pdfmetrics.registerFont(TTFont("Georgia-Italic", WINFONTS / "georgiai.ttf"))
pdfmetrics.registerFont(TTFont("Georgia-BoldItalic", WINFONTS / "georgiaz.ttf"))
pdfmetrics.registerFontFamily(
    "Georgia", normal="Georgia", bold="Georgia-Bold",
    italic="Georgia-Italic", boldItalic="Georgia-BoldItalic",
)
# Note: the repo's PlayfairDisplay-Bold.ttf is byte-identical to the Regular,
# so there is no true bold; we use Playfair Display Regular for all display type
# (elegant and high-contrast — right for literary work, and matches the cover).
pdfmetrics.registerFont(TTFont("Playfair", FONTS / "PlayfairDisplay-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Lato", FONTS / "Lato-Regular.ttf"))

INK = HexColor("#1a1a1a")
GRAY = HexColor("#666666")

# ---- page geometry -------------------------------------------------------
PW, PH = 5.5 * inch, 8.5 * inch
M_IN = 0.75 * inch   # gutter side (>= KDP min for 150-300pp)
M_OUT = 0.6 * inch
M_TOP = 0.75 * inch
M_BOT = 0.7 * inch
FRONT_MATTER_PAGES = 2  # title + copyright (for folio offset)

# ---- styles --------------------------------------------------------------
body = ParagraphStyle("body", fontName="Georgia", fontSize=11, leading=15.6,
                      alignment=TA_JUSTIFY, firstLineIndent=15, textColor=INK)
body_first = ParagraphStyle("body_first", parent=body, firstLineIndent=0)
scene = ParagraphStyle("scene", parent=body, alignment=TA_CENTER,
                       firstLineIndent=0, spaceBefore=11, spaceAfter=11, textColor=GRAY)
ch_num = ParagraphStyle("ch_num", fontName="Lato", fontSize=10.5, leading=14,
                        alignment=TA_CENTER, textColor=GRAY, spaceBefore=64)
ch_title = ParagraphStyle("ch_title", fontName="Playfair", fontSize=19, leading=23,
                          alignment=TA_CENTER, textColor=INK, spaceBefore=10, spaceAfter=30)
cp = ParagraphStyle("cp", fontName="Georgia", fontSize=8.5, leading=13,
                    alignment=TA_CENTER, textColor=INK)
about_h = ParagraphStyle("about_h", fontName="Playfair", fontSize=16, leading=20,
                         alignment=TA_CENTER, textColor=INK, spaceBefore=72, spaceAfter=24)
about_b = ParagraphStyle("about_b", fontName="Georgia", fontSize=10.5, leading=15,
                         alignment=TA_CENTER, textColor=INK, spaceAfter=10)

SENS = re.compile(r"<!--\s*SENSITIVITY-FLAG:[\s\S]*?-->")


def md_inline(t):
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", t)
    return t


def read_chapters():
    chapters = []
    for f in CHAPTERS_DIR.glob("*.md"):
        raw = f.read_text(encoding="utf-8")
        lines = raw.split("\n")
        i = lines.index("---", 1)
        fm = {}
        for ln in lines[1:i]:
            if ":" in ln:
                k, v = ln.split(":", 1)
                fm[k.strip()] = v.strip()
        body_txt = SENS.sub("", "\n".join(lines[i + 1:]))
        blocks = [b.strip() for b in re.split(r"\n[ \t]*\n", body_txt) if b.strip()]
        chapters.append((int(fm["number"]), fm["title"], blocks))
    chapters.sort(key=lambda c: c[0])
    return chapters


# ---- page furniture ------------------------------------------------------
def deco_body(canvas, doc):
    canvas.setFont("Georgia", 10.5)  # embedded default; clears ReportLab's parked Helvetica
    canvas.saveState()
    folio = doc.page - FRONT_MATTER_PAGES
    if folio >= 1:
        # running head
        head = AUTHOR if doc.page % 2 == 0 else BOOK_TITLE
        canvas.setFont("Georgia-Italic", 8.5)
        canvas.setFillColor(GRAY)
        canvas.drawCentredString(PW / 2, PH - 0.5 * inch, head)
        # folio
        canvas.setFont("Georgia", 9.5)
        canvas.setFillColor(INK)
        canvas.drawCentredString(PW / 2, 0.45 * inch, str(folio))
    canvas.restoreState()


def deco_plain(canvas, doc):
    canvas.setFont("Georgia", 10.5)  # embedded default; clears ReportLab's parked Helvetica


def main():
    chapters = read_chapters()

    # frames: gutter on the inside. We keep margins symmetric-safe (both sides
    # >= gutter min) so a single template is valid for both recto and verso.
    fx = M_IN
    fw = PW - M_IN - M_OUT
    frame = Frame(fx, M_BOT, fw, PH - M_TOP - M_BOT, id="f",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

    doc = BaseDocTemplate(
        str(OUT), pagesize=(PW, PH),
        pageTemplates=[
            PageTemplate(id="plain", frames=[frame], onPage=deco_plain),
            PageTemplate(id="body", frames=[frame], onPage=deco_body),
        ],
        title=BOOK_TITLE, author=AUTHOR,
    )

    story = []

    # ---- title page (plain) ----
    story.append(Spacer(1, 2.1 * inch))
    story.append(Paragraph(BOOK_TITLE, ParagraphStyle(
        "tp", fontName="Playfair", fontSize=34, leading=40,
        alignment=TA_CENTER, textColor=INK)))
    story.append(Spacer(1, 0.18 * inch))
    story.append(Paragraph(SUBTITLE.upper(), ParagraphStyle(
        "ts", fontName="Lato", fontSize=12, leading=16, alignment=TA_CENTER,
        textColor=GRAY)))
    story.append(Spacer(1, 2.4 * inch))
    story.append(Paragraph(AUTHOR, ParagraphStyle(
        "ta", fontName="Playfair", fontSize=15, leading=19, alignment=TA_CENTER,
        textColor=INK)))

    # ---- copyright page (plain, verso) ----
    story.append(PageBreak())
    story.append(Spacer(1, 2.0 * inch))
    cptext = [
        BOOK_TITLE,
        "Copyright © 2026 Seven Martin",
        "All rights reserved.",
        "",
        "This is a work of fiction. Names, characters, places, and incidents "
        "either are products of the author&#8217;s imagination or are used "
        "fictitiously. Any resemblance to actual persons, living or dead, "
        "events, or locales is entirely coincidental.",
        "",
        "The town of Tamarack and the Tamarack Lake Band of Lake Superior "
        "Ojibwe are fictional. While this novel is grounded in the real history "
        "and continuing presence of Lake Superior Ojibwe peoples, no actual "
        "band, community, or person is depicted.",
        "",
        "Cover image created with generative AI; cover design by the author.",
        "",
        "First edition, 2026.",
    ]
    for line in cptext:
        story.append(Paragraph(line if line else "&nbsp;", cp))

    # ---- body ----
    story.append(NextPageTemplate("body"))
    story.append(PageBreak())
    for idx, (num, title, blocks) in enumerate(chapters):
        if idx > 0:
            story.append(PageBreak())
        story.append(Paragraph(f"CHAPTER {num}", ch_num))
        story.append(Paragraph(md_inline(title), ch_title))
        first = True
        for b in blocks:
            if b == "---":
                story.append(Paragraph("&#8212;", scene))
                first = True
                continue
            story.append(Paragraph(md_inline(b), body_first if first else body))
            first = False

    # ---- about the author (plain) ----
    story.append(NextPageTemplate("plain"))
    story.append(PageBreak())
    story.append(Paragraph("About the Author", about_h))
    about = [
        "Seven Martin writes quiet, literary folk horror rooted in the cold "
        "country of the Upper Midwest&#8212;its lakes, its long winters, and the "
        "things its families keep to themselves.",
        "<i>Anna Sen Mennä</i> is the first novel.",
    ]
    for p in about:
        story.append(Paragraph(p, about_b))

    from reportlab.pdfgen.canvas import Canvas

    class EmbeddedDefaultCanvas(Canvas):
        """Default to an embedded font so ReportLab never parks Helvetica."""
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self.setFont("Georgia", 10.5)

    doc.build(story, canvasmaker=EmbeddedDefaultCanvas)
    print(f"Wrote {OUT}")
    print(f"PAGE COUNT: {doc.page}")


if __name__ == "__main__":
    main()
