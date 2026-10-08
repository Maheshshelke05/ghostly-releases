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
  IMAGE_JPEG_QUALITY, IMAGE_LONG_SIDE, MAX_IMAGE_PAGES, MAX_RESUME_BYTES, MAX_RESUME_CHARS, MAX_TEXT_PAGES, MIN_TEXT_CHARS,
} from "./limits";
import type { ExtractedResume, SourceKind } from "./types";
import { ResumeError } from "./types";

const EXTRACT_TIMEOUT_MS = 40000;

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

/** Enough real letters/digits to be a resume rather than empty or garbage glyphs from a broken font map. */
export function isReadableText(text: string): boolean {
  const nonSpace = text.replace(/\s/g, "").length;
  if (nonSpace < MIN_TEXT_CHARS) return false;
  const letters = (text.match(/[\p{L}\p{N}]/gu) || []).length;
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
 * The worker module is imported FIRST and as a side effect: evaluating it sets globalThis.pdfjsWorker,
 * which makes pdf.js run its parser in this thread ("fake worker") instead of constructing a Web Worker
 * from a URL. That is deliberate: the packaged app loads the renderer from file:// inside app.asar, and
 * worker-from-URL loading there is the fragile part. In-thread has no Worker/blob/CSP/asar failure mode
 * and costs tens of milliseconds for a resume (extraction is capped at MAX_TEXT_PAGES pages).
 */
function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
      return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJs;
    })();
    pdfjsPromise.catch(() => { pdfjsPromise = null; }); // a failed lazy-load can be retried
  }
  return pdfjsPromise;
}

function mapPdfError(e: unknown): ResumeError {
  if (e instanceof ResumeError) return e;
  const name = (e as { name?: string } | null)?.name;
  if (name === "PasswordException") return new ResumeError("password", MSG.password);
  if (name === "AbortException") return cancelled();
  return new ResumeError("corrupt", MSG.badPdf);
}

interface PdfTextItem { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

/** Rebuild readable lines from pdf.js text items (content-stream order). */
function pageItemsToText(items: unknown[]): string {
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
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += pageItemsToText(content.items as unknown[]) + "\n\n";
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

async function imageBlobToJpegPages(blob: Blob): Promise<string[]> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
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
    const bodyNorm = norm(bodyText);
    const seen = new Set<string>();
    const consider = (line: string, into: string[]) => {
      const t = line.replace(/\s+/g, " ").trim();
      const key = norm(t);
      if (!t || seen.has(key) || PAGE_NUMBER_LINE.test(t) || bodyNorm.includes(key)) return;
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
  const pages = await imageBlobToJpegPages(new Blob([buf], { type: mime }));
  throwIfAborted(signal);
  return { kind: "images", pages, source: "image", totalPages: pages.length };
}
