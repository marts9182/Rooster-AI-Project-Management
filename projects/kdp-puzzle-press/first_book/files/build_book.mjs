#!/usr/bin/env node
// build_book.mjs — reassemble per-chapter markdown into the KDP ebook HTML.
//
// Reads chapters/*.md (ordered by the `number` frontmatter field), converts a
// deliberately minimal markdown dialect (paragraphs, *em*, `---` scene breaks),
// strips SENSITIVITY-FLAG comments, and emits the full ebook document using the
// existing <style> block verbatim and a title page crediting "Seven Martin".
//
// Plain Node, no dependencies.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAPTERS_DIR = join(HERE, "chapters");
const OUT_FILE = join(HERE, "anna_sen_menna_kdp_ebook.html");

const AUTHOR = "Seven Martin";
const BOOK_TITLE = "Anna Sen Mennä";

// The <style> block, byte-for-byte from the committed HTML. Kept inline so the
// script is the single source of truth for the document going forward.
const STYLE_BLOCK = `  <style>
    body {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 1em;
      line-height: 1.6;
      margin: 0;
      padding: 0;
    }
    .title-page {
      text-align: center;
      margin-top: 30%;
      page-break-after: always;
    }
    .title-page h1 {
      font-size: 2em;
      font-weight: normal;
      margin-bottom: 0.5em;
      letter-spacing: 0.05em;
    }
    .title-page .author {
      font-size: 1.1em;
      font-style: italic;
    }
    .chapter {
      page-break-before: always;
    }
    .chapter-number {
      text-align: center;
      font-size: 0.85em;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      margin-top: 15%;
      margin-bottom: 0.3em;
      font-weight: normal;
    }
    .chapter-title {
      text-align: center;
      font-size: 1em;
      font-style: italic;
      font-weight: normal;
      margin-top: 0;
      margin-bottom: 3em;
    }
    .first-para {
      text-indent: 0;
      margin-top: 0;
      margin-bottom: 0;
    }
    p {
      text-indent: 1.5em;
      margin-top: 0;
      margin-bottom: 0;
      text-align: justify;
    }
    .scene-break {
      text-align: center;
      margin: 1.5em 0;
      text-indent: 0;
    }
  </style>`;

const SENSITIVITY_FLAG_RE = /^\s*<!--\s*SENSITIVITY-FLAG:[\s\S]*?-->\s*$/;

/** Split a chapter file into { frontmatter, body }. */
function splitFrontmatter(raw) {
  const lines = raw.split("\n");
  if (lines[0].trim() !== "---") {
    throw new Error("chapter is missing opening frontmatter fence");
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error("chapter is missing closing frontmatter fence");
  return {
    frontmatter: lines.slice(1, end).join("\n"),
    body: lines.slice(end + 1).join("\n"),
  };
}

/** Tiny key: value frontmatter parser (no YAML library). */
function parseFrontmatter(text) {
  const out = {};
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    out[key] = line.slice(idx + 1).trim();
  }
  return out;
}

/** Convert inline *em* spans. No other inline markdown exists in this prose. */
function inline(text) {
  return text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/**
 * Convert one chapter's markdown body to the inner HTML of a .chapter div.
 * - SENSITIVITY-FLAG comment lines are removed entirely before paragraphing.
 * - Blank lines delimit paragraph blocks.
 * - A block that is exactly `---` becomes the scene-break paragraph.
 * - The first prose paragraph of the chapter and the first prose paragraph
 *   after each scene break get class="first-para"; others get a plain <p>.
 */
function renderBody(body) {
  // Strip SENSITIVITY-FLAG comments first. Each sits on its own line; removing
  // it leaves the prose it annotated intact as its own blank-delimited block.
  const cleaned = body
    .split("\n")
    .filter((line) => !SENSITIVITY_FLAG_RE.test(line))
    .join("\n")
    // Safety net: strip any inline SENSITIVITY-FLAG comment that is not on its
    // own line (the line filter above only catches own-line comments).
    .replace(/<!--\s*SENSITIVITY-FLAG:[\s\S]*?-->/g, "");

  const blocks = cleaned
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const out = [];
  let firstOfRun = true; // start-of-chapter and post-scene-break both qualify
  for (const block of blocks) {
    if (block === "---") {
      out.push(`  <p class="scene-break">&#8212;</p>`);
      firstOfRun = true;
      continue;
    }
    const cls = firstOfRun ? ' class="first-para"' : "";
    out.push(`  <p${cls}>${inline(block)}</p>`);
    firstOfRun = false;
  }
  return out.join("\n\n");
}

function buildChapter(frontmatter, body) {
  const fm = parseFrontmatter(frontmatter);
  const num = Number(fm.number);
  const title = fm.title;
  const inner = renderBody(body);
  return {
    number: num,
    html:
      `<div class="chapter">\n` +
      `  <p class="chapter-number">Chapter ${num}</p>\n` +
      `  <p class="chapter-title">${title}</p>\n\n` +
      `${inner}\n` +
      `</div>`,
  };
}

function main() {
  const files = readdirSync(CHAPTERS_DIR).filter((f) => f.endsWith(".md"));

  const chapters = files
    .map((f) => {
      const raw = readFileSync(join(CHAPTERS_DIR, f), "utf8");
      const { frontmatter, body } = splitFrontmatter(raw);
      return buildChapter(frontmatter, body);
    })
    .sort((a, b) => a.number - b.number); // numeric order, not filename order

  const chaptersHtml = chapters.map((c) => c.html).join("\n\n\n");

  const doc =
    `<!DOCTYPE html>\n` +
    `<html lang="en">\n` +
    `<head>\n` +
    `  <meta charset="UTF-8">\n` +
    `  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n` +
    `  <title>${BOOK_TITLE}</title>\n` +
    `${STYLE_BLOCK}\n` +
    `</head>\n` +
    `<body>\n\n` +
    `<div class="title-page">\n` +
    `  <h1>${BOOK_TITLE}</h1>\n` +
    `  <p class="author">${AUTHOR}</p>\n` +
    `</div>\n\n\n` +
    `${chaptersHtml}\n\n` +
    `</body>\n` +
    `</html>`;

  writeFileSync(OUT_FILE, doc, "utf8");
  console.log(`Wrote ${OUT_FILE} (${chapters.length} chapters).`);
}

main();
