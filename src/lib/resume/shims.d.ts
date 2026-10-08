// Ambient declarations for the resume parsers' entry points that ship without types.
// (pdfjs-dist's own types and jszip's types resolve normally.)

// Side-effect import: evaluating this module registers globalThis.pdfjsWorker, so pdf.js runs its
// parser in-thread instead of spawning a Web Worker (see extract.ts: loadPdfjs).
declare module "pdfjs-dist/legacy/build/pdf.worker.min.mjs";

// mammoth's pre-bundled browser build (UMD) - the npm entry point targets Node.
declare module "mammoth/mammoth.browser.min.js" {
  interface RawTextResult {
    value: string;
    messages: { type: string; message: string }[];
  }
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<RawTextResult>;
    convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: Record<string, unknown>): Promise<RawTextResult>;
    images: { imgElement(convert: (image: unknown) => Promise<{ src: string }>): unknown };
  };
  export default mammoth;
}
