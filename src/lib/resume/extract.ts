// Resume file -> something an AI model can read. Runs entirely in the renderer (the file never
// leaves the device here):
//   PDF   -> text via pdf.js; if it has (almost) no text layer it is a scan: first pages -> JPEG
//   DOCX  -> text via mammoth (+ header/footer/text-box text via JSZip, where templates hide the name)
//   TXT   -> decoded directly (UTF-8 / UTF-16 / Windows-1252)
//   image -> PNG/JPG/WebP -> downscaled JPEG (white background, so transparent PNGs stay readable)
//
// The file type is decided from the file's BYTES, not its name: a text file called ".pdf" still works,
// a ".docx" that is really a PNG is read as an image, and an .exe renamed to .pdf is rejected.
import {
  IMAGE_JPEG_QUALITY, IMAGE_LONG_SIDE, MAX_DOCX_ENTRY_BYTES, MAX_DOCX_TOTAL_BYTES, MAX_IMAGE_PAGES,
  MAX_IMAGE_PIXELS, MAX_RESUME_BYTES, MAX_RESUME_CHARS, MAX_TEXT_PAGES, MIN_TEXT_CHARS,
} from "./limits";
import type { ExtractedResume, SourceKind } from "./types";
import { ResumeError } from "./types";

// A backstop, not the safety mechanism: pdf.js parses on a Web Worker (see loadPdfjs), so a
// pathological file can no longer freeze the UI - it just gets cut off.
const EXTRACT_TIMEOUT_MS = 20000;

// ───────────────────────── errors ─────────────────────────

const cancelled = () => new ResumeError("cancelled", "Cancelled.");
const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);

const MSG = {
  unsupported:
    "That file type isn't supported. Upload your resume as a PDF, Word (.docx), text (.txt) or image (PNG, JPG, WebP).",
  oldWord:
    "This looks like an old Word (.doc) file or a password-protected Office file. Open it in Word, save it as .docx or PDF without a password, then upload that.",
  password: "This PDF is password-protected. Save an unprotected copy (or remove the password) and upload it again.",
  badPdf: "We couldn't open that PDF — it looks damaged or isn't a real PDF. Try exporting it again from your editor.",
  badDocx: "We couldn't open that Word file — it looks damaged or isn't a real .docx document. Try saving it again as .docx or PDF.",
  badImage: "We couldn't open that image — it looks damaged. Try a fresh PNG, JPG or WebP.",
  noText: "We couldn't find any readable text in that file. If it's a scan, upload it as a PDF or image instead.",
};

// ───────────────────────── small helpers ─────────────────────────

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    if (signal.reason instanceof DOMException && signal.reason.name === "TimeoutError") {
      throw new ResumeError("timeout", "Reading that file took too long. Try a smaller or simpler file.", true);
    }
    throw cancelled();
  }
}

async function readBytes(file: Blob): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer();
  } catch {
    throw new ResumeError("corrupt", "We couldn't read that file. Make sure it isn't open in another program, then try again.");
  }
}

/** Collapse extraction noise: ligatures, zero-widths, control chars, runs of blank lines. */
export function cleanExtractedText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[​-‍⁠﻿­]/g, "")
    .replace(/\t+/g, "  ")
    .replace(/[  ]{3,}/g, "  ")
    .split("\n")
    .map((l) => l.replace(/[ ]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function capText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_RESUME_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_RESUME_CHARS), truncated: true };
}

// Per-character tests in isReadableText: no /g, so there is no lastIndex state to reset.
const WS_RE = /\s/u;
const LETTER_OR_NUM_RE = /[\p{L}\p{N}]/u;

/** Enough real letters/digits to be a resume rather than empty or garbage glyphs from a broken font map. */
export function isReadableText(text: string): boolean {
  // One pass over the characters: `text.match(/[\p{L}\p{N}]/gu)` allocates an array with one entry
  // per character, which on a text-layer bomb is the largest allocation in the whole extraction.
  let nonSpace = 0;
  let letters = 0;
  for (const ch of text) {
    if (WS_RE.test(ch)) continue;
    nonSpace++;
    if (LETTER_OR_NUM_RE.test(ch)) letters++;
  }
  if (nonSpace < MIN_TEXT_CHARS) return false;
  if (letters < MIN_TEXT_CHARS || letters / nonSpace < 0.55) return false;
  const junk = (text.match(/[�-]/g) || []).length;
  return junk / nonSpace <= 0.1;
}

// ───────────────────────── file type from bytes ─────────────────────────

export type Sniffed =
  | { type: "pdf" | "zip" | "png" | "jpeg" | "webp" | "text" }
  | { type: "ole" | "rtf" | "other" };

export function sniffFileType(head: Uint8Array, fileName: string, mime: string): Sniffed {
  const startsWith = (...sig: number[]) => sig.every((b, i) => head[i] === b);
  // %PDF- may follow up to 1 KB of junk
  const asLatin1 = (n: number) => String.fromCharCode(...head.subarray(0, Math.min(n, head.length)));
  if (asLatin1(1024).includes("%PDF-")) return { type: "pdf" };
  if (startsWith(0x50, 0x4b, 0x03, 0x04) || startsWith(0x50, 0x4b, 0x05, 0x06)) return { type: "zip" };
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { type: "png" };
  if (startsWith(0xff, 0xd8, 0xff)) return { type: "jpeg" };
  if (asLatin1(12).startsWith("RIFF") && asLatin1(12).slice(8, 12) === "WEBP") return { type: "webp" };
  if (startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return { type: "ole" };
  if (asLatin1(6).startsWith("{\\rtf")) return { type: "rtf" };
  // UTF-16 text has NUL bytes - recognise it by its BOM first
  if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) return { type: "text" };
  const hasNul = head.subarray(0, 1024).includes(0);
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const textLikeName = !fileName.includes(".") || ["txt", "text", "md", "markdown"].includes(ext);
  const textLikeMime = mime === "text/plain" || mime === "text/markdown";
  if (!hasNul && (textLikeName || textLikeMime || ext === "pdf" || ext === "docx")) return { type: "text" };
  return { type: "other" };
}

// ───────────────────────── PDF ─────────────────────────

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * pdf.js is loaded lazily (it is ~1.5 MB; only users who upload a resume pay for it).
 *
 * Parsing runs on a REAL Web Worker: a hostile resume (a font bomb, a page with 50k text items)
 * then cannot freeze the renderer thread, which during an interview is the overlay itself.
 *
 * The worker source is inlined as a string (`?raw`) and handed to pdf.js as a Blob URL rather than a
 * file URL: the packaged renderer is loaded from file:// inside app.asar, where `new Worker("file://...")`
 * is refused, while a blob is not. If a worker cannot be constructed at all (an origin that blocks
 * them), pdf.js keeps its in-thread parser: importing the worker module sets globalThis.pdfjsWorker,
 * which is exactly what pdf.js looks for to fall back to. That import must therefore happen only
 * when no worker was attached - globalThis.pdfjsWorker short-circuits the real-worker path.
 */
async function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJs;
      if (!(await attachPdfWorker(pdfjs))) {
        await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
      }
      return pdfjs;
    })();
    pdfjsPromise.catch(() => { pdfjsPromise = null; }); // a failed lazy-load can be retried
  }
  return pdfjsPromise;
}

/** True when the worker is running pdf.js's parser; false when it fell back to parsing in this thread. */
async function attachPdfWorker(pdfjs: PdfJs): Promise<boolean> {
  try {
    // Blob worker support is not guaranteed in every renderer; probe it before committing to it.
    const probe = URL.createObjectURL(new Blob([""], { type: "text/javascript" }));
    try {
      new Worker(probe).terminate();
    } finally {
      URL.revokeObjectURL(probe);
    }
    const { default: source } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw");
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    return true;
  } catch {
    return false; // Blob/Worker unavailable (or the worker chunk failed to load) -> in-thread parser
  }
}

function mapPdfError(e: unknown): ResumeError {
  if (e instanceof ResumeError) return e;
  const name = (e as { name?: string } | null)?.name;
  if (name === "PasswordException") return new ResumeError("password", MSG.password);
  if (name === "AbortException") return cancelled();
  return new ResumeError("corrupt", MSG.badPdf);
}

interface PdfTextItem { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

/** Rebuild readable lines from pdf.js text items (content-stream order), stopping at `maxChars`. */
function pageItemsToText(items: unknown[], maxChars: number): string {
  let out = "";
  let prev: PdfTextItem | null = null;
  for (const raw of items) {
    const it = raw as Partial<PdfTextItem>;
    if (typeof it.str !== "string" || !it.transform) continue; // marked-content markers
    const cur = it as PdfTextItem;
    if (cur.str === "") {
      if (cur.hasEOL) { out += "\n"; prev = null; }
      continue;
    }
    if (prev) {
      const lineH = Math.max(prev.height || 0, cur.height || 0, 6);
      const dy = prev.transform[5] - cur.transform[5];
      if (Math.abs(dy) > lineH * 0.45) {
        out += dy > lineH * 2.4 ? "\n\n" : "\n"; // a bigger vertical jump = paragraph / section break
      } else {
        // Gaps are judged relative to the font size: a word space is ~0.25em, letter-spacing ("S U M M A R Y"
        // headings) is usually under 0.15em, a column gutter is well over an em.
        const em = Math.max(prev.height || 0, cur.height || 0, 4);
        const gap = cur.transform[4] - (prev.transform[4] + prev.width);
        if (gap > em * 1.2) out += "  "; // column gap
        else if (gap > em * 0.18 && !/\s$/.test(out) && !/^\s/.test(cur.str)) out += " ";
      }
    }
    out += cur.str;
    // One page of a text-layer bomb can be tens of MB; stop building the string past the budget.
    if (out.length > maxChars) return out;
    if (cur.hasEOL) { out += "\n"; prev = null; } else prev = cur;
  }
  return out;
}

async function renderPdfPageToJpeg(page: import("pdfjs-dist/legacy/build/pdf.mjs").PDFPageProxy): Promise<string> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, IMAGE_LONG_SIDE / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ResumeError("corrupt", MSG.badPdf);
  ctx.fillStyle = "#ffffff"; // JPEG has no alpha: pages without a background would turn black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, background: "#ffffff" }).promise;
  const url = canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
  canvas.width = canvas.height = 0; // release the bitmap
  return url;
}

async function extractPdf(buf: ArrayBuffer, signal: AbortSignal): Promise<ExtractedResume> {
  const pdfjs = await loadPdfjs();
  throwIfAborted(signal);
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false, // never eval font programs from an untrusted PDF
    enableXfa: false,
    verbosity: 0,
  });
  const onAbort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch (e) {
      throwIfAborted(signal);
      throw mapPdfError(e);
    }
    const total = doc.numPages;
    let text = "";
    for (let i = 1; i <= Math.min(total, MAX_TEXT_PAGES); i++) {
      throwIfAborted(signal);
      // Stop as soon as the budget is blown: the text is capped anyway, so a bigger text layer cannot
      // change the answer - it can only cost another multi-MB string.
      if (text.length > MAX_RESUME_CHARS) break;
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += pageItemsToText(content.items as unknown[], MAX_RESUME_CHARS) + "\n\n";
      page.cleanup();
    }
    text = cleanExtractedText(text);
    if (isReadableText(text)) {
      const capped = capText(text);
      return { kind: "text", text: capped.text, source: "pdf", truncated: capped.truncated || total > MAX_TEXT_PAGES };
    }
    // (almost) no text layer -> a scan. Render the first pages for a vision model.
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(total, MAX_IMAGE_PAGES); i++) {
      throwIfAborted(signal);
      const page = await doc.getPage(i);
      pages.push(await renderPdfPageToJpeg(page));
      page.cleanup();
    }
    return { kind: "images", pages, source: "pdf", totalPages: total };
  } catch (e) {
    throwIfAborted(signal);
    throw mapPdfError(e);
  } finally {
    signal.removeEventListener("abort", onAbort);
    void task.destroy().catch(() => {});
  }
}

// ───────────────────────── images ─────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Pixel dimensions read from the file header (PNG / JPEG / WebP) - no decoding, no allocation.
 * {0,0} when the header cannot be parsed; the caller then falls back to the decoded bitmap's own size.
 */
export function readImageSize(bytes: Uint8Array): { width: number; height: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => dv.getUint16(o, false);
  const ascii = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n));
  // PNG: IHDR is always the first chunk, so width/height sit right behind the signature + chunk header.
  if (bytes.length > 24 && PNG_SIGNATURE.every((v, i) => bytes[i] === v)) {
    return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) };
  }
  // JPEG: walk the marker segments up to the frame header (SOF0..SOF15, minus DHT/JPGA/DAC).
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let o = 2;
    while (o + 9 < bytes.length) {
      if (bytes[o] !== 0xff) { o++; continue; } // resync over padding between segments
      const marker = bytes[o + 1];
      if (marker === 0xff) { o++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
      const len = u16(o + 2);
      if (len < 2) break;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16(o + 7), height: u16(o + 5) };
      }
      o += 2 + len;
    }
  }
  // WebP: RIFF container; the dimensions live in the VP8 (lossy) / VP8L (lossless) / VP8X chunk.
  if (bytes.length > 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: u16(26) & 0x3fff, height: u16(28) & 0x3fff };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      return { width: (bytes[21] | ((bytes[22] & 0x3f) << 8)) + 1, height: ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)) + 1 };
    }
    if (chunk === "VP8X") {
      return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
    }
  }
  return { width: 0, height: 0 };
}

async function imageBlobToJpegPages(buf: ArrayBuffer, mime: string): Promise<string[]> {
  // createImageBitmap decodes the WHOLE image before any of it can be measured, and its resize options
  // only scale afterwards - a 3 MB PNG can be 100 MP and take the renderer down before the size checks
  // below ever run. So the pixel count is taken from the file header first.
  const header = readImageSize(new Uint8Array(buf));
  if (header.width * header.height > MAX_IMAGE_PIXELS) {
    throw new ResumeError(
      "too_large",
      `That image is too large to read (${header.width}x${header.height}px). Upload a smaller screenshot, or save your resume as a PDF.`,
    );
  }
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(new Blob([buf], { type: mime }));
  } catch {
    throw new ResumeError("corrupt", MSG.badImage);
  }
  try {
    const { width, height } = bmp;
    if (Math.min(width, height) < 120 || width * height < 40000) {
      throw new ResumeError("no_text", `That image is too small to read (${width}x${height}px). Upload a larger scan or screenshot of your resume.`);
    }
    // A very tall image (scrolling screenshot of a long resume) would be shrunk to illegibility, so cut it
    // into up to MAX_IMAGE_PAGES slices (each sent on its own); normal images stay a single page.
    const ratio = height / width;
    const slices = ratio > 2 ? Math.min(MAX_IMAGE_PAGES, Math.ceil(ratio / 1.45)) : 1;
    const sliceH = Math.ceil(height / slices);
    const overlap = slices > 1 ? Math.round(sliceH * 0.03) : 0;
    const pages: string[] = [];
    for (let s = 0; s < slices; s++) {
      const sy = Math.max(0, s * sliceH - overlap);
      const sh = Math.min(height - sy, sliceH + overlap);
      const scale = Math.min(1, IMAGE_LONG_SIDE / Math.max(width, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ResumeError("corrupt", MSG.badImage);
      ctx.fillStyle = "#ffffff"; // transparent PNGs would otherwise become black in JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, sy, width, sh, 0, 0, canvas.width, canvas.height);
      pages.push(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY));
      canvas.width = canvas.height = 0;
    }
    return pages;
  } finally {
    bmp.close();
  }
}

// ───────────────────────── DOCX ─────────────────────────

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const PAGE_NUMBER_LINE = /^(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i;

function wordParagraphText(p: Element): string {
  let s = "";
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType !== 1) continue;
      const el = c as Element;
      if (el.namespaceURI === W_NS) {
        if (el.localName === "t") { s += el.textContent ?? ""; continue; }
        if (el.localName === "tab") { s += "\t"; continue; }
        if (el.localName === "br" || el.localName === "cr") { s += "\n"; continue; }
        if (el.localName === "instrText" || el.localName === "delText") continue;
      }
      walk(el);
    }
  };
  walk(p);
  return s;
}

/** Text that mammoth does not return: page headers/footers and text boxes. */
async function docxSideText(buf: ArrayBuffer, bodyText: string): Promise<{ head: string[]; tail: string[] }> {
  const head: string[] = [];
  const tail: string[] = [];
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    // Compare against body LINES, not the whole body string. A short header such
    // as the candidate's name or "CV" is a substring of plenty of body text, so
    // substring matching silently dropped it — the exact case this function
    // exists to recover.
    const bodyLines = new Set(
      bodyText.split("\n").map((l) => norm(l.replace(/\s+/g, " ").trim())).filter(Boolean),
    );
    const seen = new Set<string>();
    const consider = (line: string, into: string[]) => {
      const t = line.replace(/\s+/g, " ").trim();
      const key = norm(t);
      if (!t || seen.has(key) || PAGE_NUMBER_LINE.test(t) || bodyLines.has(key)) return;
      seen.add(key);
      into.push(t);
    };
    const parse = async (name: string) => new DOMParser().parseFromString(await zip.file(name)!.async("string"), "application/xml");
    const names = Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n)).sort();
    for (const name of names) {
      const xml = await parse(name);
      const into = name.includes("header") ? head : tail;
      for (const p of Array.from(xml.getElementsByTagNameNS(W_NS, "p"))) {
        if (p.getElementsByTagNameNS(W_NS, "p").length === 0) consider(wordParagraphText(p), into);
      }
    }
    if (zip.file("word/document.xml")) {
      const xml = await parse("word/document.xml");
      for (const box of Array.from(xml.getElementsByTagNameNS(W_NS, "txbxContent"))) {
        for (const p of Array.from(box.getElementsByTagNameNS(W_NS, "p"))) consider(wordParagraphText(p), tail);
      }
    }
  } catch {
    /* the body text from mammoth is still usable without these extras */
  }
  return { head, tail };
}

const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "DIV", "BLOCKQUOTE", "PRE"]);

/** mammoth HTML -> text that keeps table rows on one line ("Languages | JavaScript, Python") and bullets as "- ". */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  const inline = (n: Node): string => {
    if (n.nodeType === 3) return n.textContent ?? "";
    if (n.nodeType !== 1) return "";
    const el = n as Element;
    if (el.tagName === "BR") return "\n";
    if (el.tagName === "IMG") return "";
    return Array.from(el.childNodes).map(inline).join("");
  };
  const flat = (s: string) => s.replace(/\s+/g, " ").trim();
  const hasBlocks = (el: Element) => !!el.querySelector("p,li,h1,h2,h3,h4,h5,h6,table,div");
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      const tag = c.tagName;
      if (tag === "TABLE") {
        for (const tr of Array.from(c.querySelectorAll(":scope > tbody > tr, :scope > tr, :scope > thead > tr"))) {
          const cells = Array.from(tr.children).filter((x) => x.tagName === "TD" || x.tagName === "TH");
          // a data row (every cell is a single short block) stays on one line; a layout table (columns holding whole
          // sections) is flattened cell by cell so paragraphs are not glued together.
          if (cells.every((x) => !x.querySelector("table") && x.querySelectorAll("p,li").length <= 1)) {
            const row = cells.map((x) => flat(inline(x))).filter(Boolean).join(" | ");
            if (row) lines.push(row);
          } else {
            for (const cell of cells) walk(cell);
          }
        }
      } else if (tag === "UL" || tag === "OL") {
        walk(c);
      } else if (tag === "LI") {
        const t = flat(inline(c));
        if (t) lines.push("- " + t);
      } else if (BLOCK_TAGS.has(tag) && !hasBlocks(c)) {
        const t = flat(inline(c));
        if (t) lines.push(t);
      } else {
        walk(c);
      }
    }
  };
  walk(doc.body);
  return lines.join("\n");
}

async function extractDocx(buf: ArrayBuffer, signal: AbortSignal): Promise<ExtractedResume> {
  const mammoth = (await import("mammoth/mammoth.browser.min.js")).default;
  throwIfAborted(signal);
  let body = "";
  try {
    // Preferred: the HTML view (keeps tables/lists structured). Images are dropped (only their base64 would be bloat).
    const html = await mammoth.convertToHtml(
      { arrayBuffer: buf },
      { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })) },
    );
    body = htmlToText(html.value || "");
  } catch {
    body = "";
  }
  if (body.replace(/\s/g, "").length < 20) {
    try {
      body = (await mammoth.extractRawText({ arrayBuffer: buf })).value || "";
    } catch {
      throw new ResumeError("corrupt", MSG.badDocx);
    }
  }
  throwIfAborted(signal);
  const side = await docxSideText(buf, body);
  const text = cleanExtractedText([...side.head, body, ...side.tail].filter(Boolean).join("\n\n"));
  if (text.replace(/\s/g, "").length < 20) throw new ResumeError("no_text", MSG.noText);
  const capped = capText(text);
  return { kind: "text", text: capped.text, source: "docx", truncated: capped.truncated };
}

// ───────────────────────── TXT ─────────────────────────

function decodeText(buf: ArrayBuffer): string {
  let bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes); // legacy Windows text files
  }
}

// ───────────────────────── entry point ─────────────────────────

/**
 * Reads a resume file. Throws ResumeError (friendly message, stable `code`) for: empty file, too big,
 * unsupported type, password-protected, damaged, no readable text, timeout, cancelled.
 */
export async function extractResume(file: File, opts: { signal?: AbortSignal } = {}): Promise<ExtractedResume> {
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, AbortSignal.timeout(EXTRACT_TIMEOUT_MS)])
    : AbortSignal.timeout(EXTRACT_TIMEOUT_MS);
  throwIfAborted(signal);

  if (file.size === 0) {
    throw new ResumeError("empty", "That file is empty (0 bytes). Pick your resume file again.");
  }
  if (file.size > MAX_RESUME_BYTES) {
    throw new ResumeError("too_large", `That file is ${mb(file.size)} MB — the limit is 10 MB. Export a smaller copy (for example "Save as PDF") and try again.`);
  }

  const head = new Uint8Array(await readBytes(file.slice(0, 1024)));
  const sniffed = sniffFileType(head, file.name || "", file.type || "");
  let source: SourceKind;
  switch (sniffed.type) {
    case "ole": throw new ResumeError("unsupported_type", MSG.oldWord);
    case "rtf": throw new ResumeError("unsupported_type", "RTF files aren't supported. Save your resume as PDF, .docx or .txt and upload that.");
    case "other": throw new ResumeError("unsupported_type", MSG.unsupported);
    case "pdf": source = "pdf"; break;
    case "zip": source = "docx"; break;
    case "text": source = "txt"; break;
    default: source = "image";
  }

  const buf = await readBytes(file);
  throwIfAborted(signal);

  if (source === "pdf") return extractPdf(buf, signal);
  if (source === "docx") return extractDocx(buf, signal);
  if (source === "txt") {
    const text = cleanExtractedText(decodeText(buf));
    if (!text) throw new ResumeError("empty", "That file has no text in it. Pick your resume file again.");
    if (text.replace(/\s/g, "").length < 20) throw new ResumeError("no_text", MSG.noText);
    const capped = capText(text);
    return { kind: "text", text: capped.text, source: "txt", truncated: capped.truncated };
  }
  const mime = sniffed.type === "png" ? "image/png" : sniffed.type === "jpeg" ? "image/jpeg" : "image/webp";
  const pages = await imageBlobToJpegPages(buf, mime);
  throwIfAborted(signal);
  return { kind: "images", pages, source: "image", totalPages: pages.length };
}
