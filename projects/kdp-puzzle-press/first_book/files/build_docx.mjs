#!/usr/bin/env node
// build_docx.mjs — generate a content-current print DOCX from chapters/*.md.
//
// Reuses the same minimal markdown dialect as build_book.mjs (paragraphs, *em*,
// `---` scene breaks; SENSITIVITY-FLAG comments stripped). Emits a minimal but
// valid OOXML (.docx) package: a title page crediting "Seven Martin", then each
// chapter on a new page with a centered chapter number + italic title and
// justified, first-line-indented body.
//
// Dependency-free generation. The final ZIP step uses Windows PowerShell's .NET
// System.IO.Compression (no pandoc/Word/LibreOffice required). This produces a
// content-complete manuscript DOCX; final KDP print formatting (trim size,
// running heads, page numbers, font embedding) is still a manual/Word pass.

import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAPTERS_DIR = join(HERE, "chapters");
const OUT_FILE = join(HERE, "anna_sen_menna_kdp_print.docx");
const BUILD_DIR = join(HERE, ".docx_build");

const AUTHOR = "Seven Martin";
const BOOK_TITLE = "Anna Sen Mennä";

const SENSITIVITY_FLAG_RE = /^\s*<!--\s*SENSITIVITY-FLAG:[\s\S]*?-->\s*$/;

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

/** Convert one paragraph's text to <w:r> runs, honoring *italic* spans. */
function runs(text) {
  const parts = text.split("*");
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg === "") continue;
    const italic = i % 2 === 1;
    const rpr = italic ? "<w:rPr><w:i/></w:rPr>" : "";
    out += `<w:r>${rpr}<w:t xml:space="preserve">${esc(seg)}</w:t></w:r>`;
  }
  return out || `<w:r><w:t xml:space="preserve"></w:t></w:r>`;
}

/** A styled single-run paragraph (title page / chapter headings). */
function styledPara(text, { jc, before, after, bold, italic, sz, pageBreakBefore } = {}) {
  let ppr = "<w:pPr>";
  if (pageBreakBefore) ppr += "<w:pageBreakBefore/>";
  if (jc) ppr += `<w:jc w:val="${jc}"/>`;
  if (before != null || after != null) {
    ppr += `<w:spacing${before != null ? ` w:before="${before}"` : ""}${after != null ? ` w:after="${after}"` : ""}/>`;
  }
  ppr += "</w:pPr>";
  let rpr = "";
  if (bold || italic || sz) {
    rpr = "<w:rPr>";
    if (bold) rpr += "<w:b/>";
    if (italic) rpr += "<w:i/>";
    if (sz) rpr += `<w:sz w:val="${sz}"/>`;
    rpr += "</w:rPr>";
  }
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

/** A body prose paragraph (justified; first-line indent unless first-of-run). */
function bodyPara(text, firstOfRun) {
  const ind = firstOfRun ? "" : `<w:ind w:firstLine="360"/>`;
  return `<w:p><w:pPr><w:jc w:val="both"/>${ind}</w:pPr>${runs(text)}</w:p>`;
}

function sceneBreak() {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/></w:pPr><w:r><w:t>—</w:t></w:r></w:p>`;
}

function renderChapterParas(num, title, body) {
  const cleaned = body
    .split("\n")
    .filter((line) => !SENSITIVITY_FLAG_RE.test(line))
    .join("\n")
    .replace(/<!--\s*SENSITIVITY-FLAG:[\s\S]*?-->/g, "");

  const blocks = cleaned
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const paras = [];
  // chapter number — forces a new page before each chapter
  paras.push(
    styledPara(`Chapter ${num}`, {
      jc: "center",
      before: 1200,
      after: 120,
      sz: 22,
      pageBreakBefore: true,
    }),
  );
  paras.push(styledPara(title, { jc: "center", after: 720, italic: true, sz: 26 }));

  let firstOfRun = true;
  for (const block of blocks) {
    if (block === "---") {
      paras.push(sceneBreak());
      firstOfRun = true;
      continue;
    }
    paras.push(bodyPara(block, firstOfRun));
    firstOfRun = false;
  }
  return paras.join("");
}

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

  // Title page
  const titlePage =
    styledPara(BOOK_TITLE, { jc: "center", before: 3600, after: 360, bold: true, sz: 56 }) +
    styledPara(AUTHOR, { jc: "center", italic: true, sz: 28 });

  const chaptersXml = chapters
    .map((c) => renderChapterParas(c.number, c.title, c.body))
    .join("");

  const sectPr =
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>`;

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${titlePage}${chaptersXml}${sectPr}</w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const docRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  // Lay out the OPC package on disk, then zip it.
  rmSync(BUILD_DIR, { recursive: true, force: true });
  mkdirSync(join(BUILD_DIR, "_rels"), { recursive: true });
  mkdirSync(join(BUILD_DIR, "word", "_rels"), { recursive: true });
  writeFileSync(join(BUILD_DIR, "[Content_Types].xml"), contentTypes, "utf8");
  writeFileSync(join(BUILD_DIR, "_rels", ".rels"), rootRels, "utf8");
  writeFileSync(join(BUILD_DIR, "word", "document.xml"), documentXml, "utf8");
  writeFileSync(join(BUILD_DIR, "word", "_rels", "document.xml.rels"), docRels, "utf8");

  rmSync(OUT_FILE, { force: true });
  // Zip with EXPLICIT forward-slash entry names. .NET Framework's
  // CreateFromDirectory writes backslash entry names on Windows, which produce a
  // non-OPC-compliant package Word rejects — so add each part by hand instead.
  const parts = [
    ["[Content_Types].xml", "[Content_Types].xml"],
    ["_rels\\.rels", "_rels/.rels"],
    ["word\\document.xml", "word/document.xml"],
    ["word\\_rels\\document.xml.rels", "word/_rels/document.xml.rels"],
  ];
  const q = (s) => s.replace(/'/g, "''");
  const adds = parts
    .map(
      ([disk, entry]) =>
        `[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z,'${q(join(BUILD_DIR, disk))}','${q(entry)}')|Out-Null;`,
    )
    .join("");
  const ps =
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
    `$z=[System.IO.Compression.ZipFile]::Open('${q(OUT_FILE)}','Create'); ` +
    `${adds} $z.Dispose()`;
  execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "inherit" });
  rmSync(BUILD_DIR, { recursive: true, force: true });

  console.log(`Wrote ${OUT_FILE} (${chapters.length} chapters).`);
}

main();
