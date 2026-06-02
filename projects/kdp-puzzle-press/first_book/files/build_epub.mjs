#!/usr/bin/env node
// build_epub.mjs — assemble per-chapter markdown into a reflowable EPUB 3 for KDP.
//
// Reuses the same minimal markdown dialect as build_book.mjs (paragraphs, *em*,
// `---` scene breaks; SENSITIVITY-FLAG comments stripped). Emits a valid EPUB 3
// package: cover (the composited ebook cover PNG), title page, copyright page
// (mirroring the print interior), 26 chapter documents, an About-the-Author page,
// an EPUB 3 nav + an EPUB 2 NCX fallback. KDP prefers EPUB over reflowable HTML.
//
// Dependency-free generation. The final ZIP step uses Windows PowerShell's .NET
// System.IO.Compression — the `mimetype` entry is written FIRST and STORED
// (uncompressed), as the OCF spec requires; everything else is deflated.
//
// Run:  node build_epub.mjs

import {
  readFileSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAPTERS_DIR = join(HERE, "chapters");
const OUT_FILE = join(HERE, "anna_sen_menna_kdp_ebook.epub");
const BUILD_DIR = join(HERE, ".epub_build");
const COVER_SRC = join(HERE, "cover", "anna_sen_menna_cover_ebook.png");

const AUTHOR = "Seven Martin";
const BOOK_TITLE = "Anna Sen Mennä";
const SUBTITLE = "A Folk Horror Novel";
// Stable identifier for this edition (KDP assigns its own ASIN; this is the
// internal package id). Hardcoded so rebuilds are byte-reproducible.
const BOOK_UUID = "urn:uuid:5b2c8a14-3f6d-4e91-bc07-2a1f9e6d4c83";
const MODIFIED = "2026-06-02T00:00:00Z"; // dcterms:modified (EPUB3 requires it)

const SENSITIVITY_FLAG_RE = /^\s*<!--\s*SENSITIVITY-FLAG:[\s\S]*?-->\s*$/;

// ---- markdown parsing (shared dialect) ------------------------------------
function splitFrontmatter(raw) {
  const lines = raw.split("\n");
  if (lines[0].trim() !== "---") throw new Error("missing opening frontmatter fence");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error("missing closing frontmatter fence");
  return {
    frontmatter: lines.slice(1, end).join("\n"),
    body: lines.slice(end + 1).join("\n"),
  };
}

function parseFrontmatter(text) {
  const out = {};
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape XML, then turn *em* spans into <em>…</em> (inserted after escaping). */
function inline(text) {
  return esc(text).replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderBody(body) {
  const cleaned = body
    .split("\n")
    .filter((line) => !SENSITIVITY_FLAG_RE.test(line))
    .join("\n")
    .replace(/<!--\s*SENSITIVITY-FLAG:[\s\S]*?-->/g, "");

  const blocks = cleaned
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const out = [];
  let firstOfRun = true; // chapter start + each post-scene-break paragraph
  for (const block of blocks) {
    if (block === "---") {
      out.push(`    <p class="scene-break">&#8212;</p>`);
      firstOfRun = true;
      continue;
    }
    const cls = firstOfRun ? "first-para" : "body";
    out.push(`    <p class="${cls}">${inline(block)}</p>`);
    firstOfRun = false;
  }
  return out.join("\n");
}

// ---- XHTML document wrapper -----------------------------------------------
function xhtml(title, bodyInner, bodyClass = "") {
  const cls = bodyClass ? ` class="${bodyClass}"` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE html>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">\n` +
    `<head>\n` +
    `  <meta charset="UTF-8"/>\n` +
    `  <title>${esc(title)}</title>\n` +
    `  <link rel="stylesheet" type="text/css" href="style.css"/>\n` +
    `</head>\n` +
    `<body${cls}>\n${bodyInner}\n</body>\n</html>\n`
  );
}

const STYLE_CSS = `@charset "utf-8";
body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; margin: 0; padding: 0; }
h1, h2 { font-weight: normal; }
.cover-page { margin: 0; padding: 0; text-align: center; }
.cover-page img { max-width: 100%; height: auto; }
.title-page { text-align: center; margin-top: 25%; }
.title-page h1 { font-size: 2em; letter-spacing: 0.05em; margin-bottom: 0.4em; }
.title-page .subtitle { font-variant: small-caps; letter-spacing: 0.15em; color: #555; margin-bottom: 3em; }
.title-page .author { font-size: 1.1em; font-style: italic; }
.copyright { font-size: 0.82em; text-align: center; line-height: 1.5; margin: 12% 8% 0; }
.copyright p { margin: 0 0 0.9em; text-indent: 0; }
.chapter-number { text-align: center; font-size: 0.85em; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 12%; margin-bottom: 0.3em; color: #555; }
.chapter-title { text-align: center; font-size: 1.15em; font-style: italic; margin-top: 0; margin-bottom: 2.4em; }
p.first-para { text-indent: 0; margin: 0; }
p.body { text-indent: 1.5em; margin: 0; text-align: justify; }
p.scene-break { text-align: center; margin: 1.4em 0; text-indent: 0; }
.about h2 { text-align: center; font-style: italic; font-size: 1.3em; margin-top: 18%; margin-bottom: 1.4em; }
.about p { text-align: center; text-indent: 0; margin: 0 6% 0.9em; }
`;

// ---- build ----------------------------------------------------------------
function main() {
  const files = readdirSync(CHAPTERS_DIR).filter((f) => f.endsWith(".md"));
  const chapters = files
    .map((f) => {
      const raw = readFileSync(join(CHAPTERS_DIR, f), "utf8");
      const { frontmatter, body } = splitFrontmatter(raw);
      const fm = parseFrontmatter(frontmatter);
      return { number: Number(fm.number), title: fm.title, body };
    })
    .sort((a, b) => a.number - b.number);

  // ---- per-chapter XHTML ----
  const chapterDocs = chapters.map((c) => {
    const id = `chap-${String(c.number).padStart(2, "0")}`;
    const inner =
      `  <section class="chapter" epub:type="chapter" xmlns:epub="http://www.idpf.org/2007/ops">\n` +
      `    <p class="chapter-number">Chapter ${c.number}</p>\n` +
      `    <h2 class="chapter-title">${inline(c.title)}</h2>\n` +
      `${renderBody(c.body)}\n` +
      `  </section>`;
    return { id, file: `${id}.xhtml`, title: `Chapter ${c.number}`, label: `${c.number}. ${c.title}`, doc: xhtml(c.title, inner) };
  });

  // ---- front/back matter ----
  const coverDoc = xhtml(
    "Cover",
    `  <div class="cover-page"><img src="images/cover.png" alt="${esc(BOOK_TITLE)} — cover"/></div>`,
    "cover-page",
  );

  const titleDoc = xhtml(
    BOOK_TITLE,
    `  <div class="title-page">\n` +
      `    <h1>${esc(BOOK_TITLE)}</h1>\n` +
      `    <p class="subtitle">${esc(SUBTITLE)}</p>\n` +
      `    <p class="author">${esc(AUTHOR)}</p>\n` +
      `  </div>`,
  );

  const cpLines = [
    BOOK_TITLE,
    "Copyright © 2026 Seven Martin",
    "All rights reserved.",
    "This is a work of fiction. Names, characters, places, and incidents either are products of the author&#8217;s imagination or are used fictitiously. Any resemblance to actual persons, living or dead, events, or locales is entirely coincidental.",
    "The town of Tamarack and the Tamarack Lake Band of Lake Superior Ojibwe are fictional. While this novel is grounded in the real history and continuing presence of Lake Superior Ojibwe peoples, no actual band, community, or person is depicted.",
    "Cover image created with generative AI; cover design by the author.",
    "First edition, 2026.",
  ];
  const copyrightDoc = xhtml(
    "Copyright",
    `  <div class="copyright">\n` +
      cpLines.map((l) => `    <p>${l}</p>`).join("\n") +
      `\n  </div>`,
  );

  const aboutDoc = xhtml(
    "About the Author",
    `  <div class="about">\n` +
      `    <h2>About the Author</h2>\n` +
      `    <p>Seven Martin writes quiet, literary folk horror rooted in the cold country of the Upper Midwest&#8212;its lakes, its long winters, and the things its families keep to themselves.</p>\n` +
      `    <p><em>Anna Sen Mennä</em> is the first novel.</p>\n` +
      `  </div>`,
  );

  // ---- reading order (spine) ----
  const front = [
    { id: "cover", file: "cover.xhtml", title: "Cover", doc: coverDoc, linear: "no" },
    { id: "titlepage", file: "titlepage.xhtml", title: "Title Page", doc: titleDoc },
    { id: "copyright", file: "copyright.xhtml", title: "Copyright", doc: copyrightDoc },
  ];
  const back = [{ id: "about", file: "about.xhtml", title: "About the Author", doc: aboutDoc }];
  const readingDocs = [...front, ...chapterDocs, ...back];

  // ---- nav.xhtml (EPUB3 TOC) ----
  const navItems = [
    `      <li><a href="titlepage.xhtml">Title Page</a></li>`,
    ...chapterDocs.map((c) => `      <li><a href="${c.file}">${esc(c.label)}</a></li>`),
    `      <li><a href="about.xhtml">About the Author</a></li>`,
  ].join("\n");
  const navDoc =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE html>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">\n` +
    `<head>\n  <meta charset="UTF-8"/>\n  <title>Contents</title>\n  <link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n` +
    `<body>\n` +
    `  <nav epub:type="toc" id="toc">\n    <h1>Contents</h1>\n    <ol>\n${navItems}\n    </ol>\n  </nav>\n` +
    `  <nav epub:type="landmarks" hidden="hidden">\n    <ol>\n` +
    `      <li><a epub:type="cover" href="cover.xhtml">Cover</a></li>\n` +
    `      <li><a epub:type="bodymatter" href="${chapterDocs[0].file}">Begin Reading</a></li>\n` +
    `    </ol>\n  </nav>\n` +
    `</body>\n</html>\n`;

  // ---- toc.ncx (EPUB2 fallback) ----
  const ncxPoints = [
    { file: "titlepage.xhtml", label: "Title Page" },
    ...chapterDocs.map((c) => ({ file: c.file, label: c.label })),
    { file: "about.xhtml", label: "About the Author" },
  ]
    .map(
      (p, i) =>
        `    <navPoint id="np-${i + 1}" playOrder="${i + 1}">\n` +
        `      <navLabel><text>${esc(p.label)}</text></navLabel>\n` +
        `      <content src="${p.file}"/>\n    </navPoint>`,
    )
    .join("\n");
  const ncxDoc =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n` +
    `  <head>\n    <meta name="dtb:uid" content="${BOOK_UUID}"/>\n    <meta name="dtb:depth" content="1"/>\n` +
    `    <meta name="dtb:totalPageCount" content="0"/>\n    <meta name="dtb:maxPageNumber" content="0"/>\n  </head>\n` +
    `  <docTitle><text>${esc(BOOK_TITLE)}</text></docTitle>\n` +
    `  <navMap>\n${ncxPoints}\n  </navMap>\n</ncx>\n`;

  // ---- content.opf ----
  const manifestItems = [
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `    <item id="css" href="style.css" media-type="text/css"/>`,
    `    <item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>`,
    ...readingDocs.map(
      (d) =>
        `    <item id="${d.id}" href="${d.file}" media-type="application/xhtml+xml"${
          d.id === "cover" ? ' properties="svg"' : ""
        }/>`,
    ),
  ];
  // (the cover xhtml uses <img>, not inline svg — drop the svg property)
  const manifest = manifestItems
    .map((l) => l.replace(' properties="svg"', ""))
    .join("\n");

  const spine = readingDocs
    .map((d) => `    <itemref idref="${d.id}"${d.linear === "no" ? ' linear="no"' : ""}/>`)
    .join("\n");

  const opf =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">\n` +
    `  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
    `    <dc:identifier id="book-id">${BOOK_UUID}</dc:identifier>\n` +
    `    <dc:title>${esc(BOOK_TITLE)}</dc:title>\n` +
    `    <dc:creator id="creator">${esc(AUTHOR)}</dc:creator>\n` +
    `    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>\n` +
    `    <dc:language>en</dc:language>\n` +
    `    <dc:date>2026</dc:date>\n` +
    `    <dc:publisher>Seven Martin</dc:publisher>\n` +
    `    <dc:description>${esc(SUBTITLE)}</dc:description>\n` +
    `    <dc:rights>Copyright © 2026 Seven Martin. All rights reserved.</dc:rights>\n` +
    `    <meta property="dcterms:modified">${MODIFIED}</meta>\n` +
    `    <meta name="cover" content="cover-image"/>\n` +
    `  </metadata>\n` +
    `  <manifest>\n${manifest}\n  </manifest>\n` +
    `  <spine toc="ncx">\n${spine}\n  </spine>\n` +
    `</package>\n`;

  const containerXml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n` +
    `  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n` +
    `</container>\n`;

  // ---- lay out package on disk ----
  rmSync(BUILD_DIR, { recursive: true, force: true });
  mkdirSync(join(BUILD_DIR, "META-INF"), { recursive: true });
  mkdirSync(join(BUILD_DIR, "OEBPS", "images"), { recursive: true });

  writeFileSync(join(BUILD_DIR, "mimetype"), "application/epub+zip"); // no trailing newline
  writeFileSync(join(BUILD_DIR, "META-INF", "container.xml"), containerXml, "utf8");
  writeFileSync(join(BUILD_DIR, "OEBPS", "content.opf"), opf, "utf8");
  writeFileSync(join(BUILD_DIR, "OEBPS", "nav.xhtml"), navDoc, "utf8");
  writeFileSync(join(BUILD_DIR, "OEBPS", "toc.ncx"), ncxDoc, "utf8");
  writeFileSync(join(BUILD_DIR, "OEBPS", "style.css"), STYLE_CSS, "utf8");
  for (const d of readingDocs) writeFileSync(join(BUILD_DIR, "OEBPS", d.file), d.doc, "utf8");
  copyFileSync(COVER_SRC, join(BUILD_DIR, "OEBPS", "images", "cover.png"));

  // ---- zip: mimetype FIRST + truly STORED (method 0), the rest DEFLATED ----
  // .NET's System.IO.Compression cannot emit a method-0 "stored" entry (it always
  // deflates, even at NoCompression), which fails epubcheck's mimetype rule. So
  // the zip step runs in Python, whose zipfile supports ZIP_STORED properly.
  const entries = [
    ["META-INF/container.xml", "META-INF/container.xml"],
    ["OEBPS/content.opf", "OEBPS/content.opf"],
    ["OEBPS/nav.xhtml", "OEBPS/nav.xhtml"],
    ["OEBPS/toc.ncx", "OEBPS/toc.ncx"],
    ["OEBPS/style.css", "OEBPS/style.css"],
    ["OEBPS/images/cover.png", "OEBPS/images/cover.png"],
    ...readingDocs.map((d) => [`OEBPS/${d.file}`, `OEBPS/${d.file}`]),
  ];

  rmSync(OUT_FILE, { force: true });
  const pyEntries = entries
    .map(([disk, entry]) => `    (r${JSON.stringify(join(BUILD_DIR, disk))}, ${JSON.stringify(entry)}),`)
    .join("\n");
  const py =
    `import zipfile\n` +
    `out = r${JSON.stringify(OUT_FILE)}\n` +
    `z = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED)\n` +
    `# mimetype must be the first entry and STORED (uncompressed, method 0)\n` +
    `z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)\n` +
    `entries = [\n${pyEntries}\n]\n` +
    `for disk, name in entries:\n` +
    `    z.write(disk, name, compress_type=zipfile.ZIP_DEFLATED)\n` +
    `z.close()\n`;
  const pyPath = join(BUILD_DIR, "_zip.py");
  writeFileSync(pyPath, py, "utf8");
  execSync(`python "${pyPath}"`, { stdio: "inherit" });
  rmSync(BUILD_DIR, { recursive: true, force: true });

  console.log(`Wrote ${OUT_FILE} (${chapters.length} chapters + front/back matter).`);
}

main();
