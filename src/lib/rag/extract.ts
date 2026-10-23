// Client-side document extraction. Nothing leaves the browser: PDFs are parsed
// by pdf.js (lazy-loaded), DOCX by unzipping word/document.xml, text formats
// directly.

import { unzipSync, strFromU8 } from "fflate";

export interface ExtractedDoc {
  name: string;
  kind: string;
  bytes: number;
  sha256: string;
  pages: { num: number; text: string }[];
}

async function pdfPages(buf: ArrayBuffer): Promise<{ num: number; text: string }[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages: { num: number; text: string }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Rebuild lines from glyph runs; a vertical gap well above the line
    // height marks a paragraph break, so wrapped sentences stay together.
    let text = "";
    let lastY: number | null = null;
    let lineH = 12;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (item.height) lineH = Math.max(6, Math.min(lineH, item.height) || item.height);
      if (lastY !== null) {
        const gap = Math.abs(lastY - y);
        if (gap > lineH * 1.9) text += "\n\n";
        else if (gap > 2) text += "\n";
      }
      text += item.str;
      lastY = y;
    }
    pages.push({ num: i, text });
  }
  return pages;
}

function docxPages(buf: ArrayBuffer): { num: number; text: string }[] {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === "word/document.xml" });
  const xml = strFromU8(files["word/document.xml"] ?? new Uint8Array());
  const paras = xml
    .split(/<\/w:p>/)
    .map((p) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""))
    .map((p) => p.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
    .filter((p) => p.trim());
  // ~40 paragraphs per synthetic "page" so citations stay navigable.
  const pages: { num: number; text: string }[] = [];
  for (let i = 0; i < paras.length; i += 40) pages.push({ num: pages.length + 1, text: paras.slice(i, i + 40).join("\n\n") });
  return pages.length ? pages : [{ num: 1, text: "" }];
}

function htmlToText(s: string) {
  const d = new DOMParser().parseFromString(s, "text/html");
  d.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
  return d.body.innerText || d.body.textContent || "";
}

async function digest(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function extractFile(file: File): Promise<ExtractedDoc> {
  const buf = await file.arrayBuffer();
  // Hash before parsing: pdf.js transfers (detaches) the buffer to its worker.
  const sha256 = await digest(buf);
  const bytes = buf.byteLength;
  const name = file.name;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  let pages: { num: number; text: string }[];
  let kind = ext;
  if (ext === "pdf" || file.type === "application/pdf") {
    pages = await pdfPages(buf.slice(0));
    kind = "pdf";
  } else if (ext === "docx") {
    pages = docxPages(buf);
  } else {
    let text = new TextDecoder().decode(buf);
    if (ext === "html" || ext === "htm") text = htmlToText(text);
    if (ext === "json") {
      try {
        text = JSON.stringify(JSON.parse(text), null, 1);
      } catch {
        /* keep raw */
      }
    }
    // Split text files on form feeds or "## Page" markers, else one page per ~3000 chars.
    const parts = text.split(/\f|\n(?=#{1,2} )/);
    pages = [];
    let acc = "";
    for (const p of parts) {
      if ((acc + p).length > 3200 && acc) {
        pages.push({ num: pages.length + 1, text: acc });
        acc = "";
      }
      acc += (acc ? "\n" : "") + p;
    }
    if (acc) pages.push({ num: pages.length + 1, text: acc });
  }
  return { name, kind, bytes, sha256, pages };
}

export function textToDoc(name: string, text: string, sha256: string): ExtractedDoc {
  const parts = text.split(/\n(?=## )/);
  return { name, kind: name.split(".").pop() ?? "txt", bytes: text.length, sha256, pages: parts.map((t, i) => ({ num: i + 1, text: t })) };
}
