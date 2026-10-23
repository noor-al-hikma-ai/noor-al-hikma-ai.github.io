// UAE-focused PII detection and redaction. Only the entities named in the
// case's `Curation: redact [...]` are redacted; the rest are reported so the
// contract owner can decide.

export type PiiType = "UAE_IBAN" | "EMIRATES_ID" | "PASSPORT" | "EMAIL" | "PHONE_UAE" | "CARD_PAN" | "TRN";

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const DETECTORS: { type: PiiType; re: RegExp; group?: number; valid?: (m: string) => boolean }[] = [
  { type: "UAE_IBAN", re: /\bAE\d{2}(?:[ -]?\d){19}\b/g },
  { type: "EMIRATES_ID", re: /\b784[- ]?\d{4}[- ]?\d{7}[- ]?\d\b/g },
  { type: "EMAIL", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: "PHONE_UAE", re: /(?:\+971|00971|\b0)[ -]?(?:5\d|[2-479])(?:[ -]?\d){7}\b/g },
  { type: "TRN", re: /\b100\d{12}\b/g },
  { type: "CARD_PAN", re: /\b(?:\d[ -]?){13,19}\b/g, valid: (m) => luhn(m.replace(/\D/g, "")) && !/^784/.test(m.replace(/\D/g, "")) },
  { type: "PASSPORT", re: /(passport(?:\s+(?:no\.?|number|#))?[:\s#]*)([A-Z]{1,2}\d{6,8})\b/gi, group: 2 },
];

export interface PiiReport {
  text: string;
  found: Record<string, number>;
  redacted: Record<string, number>;
}

export type Replacement = "token" | "mask" | "hash";

function shortHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

export function redactPII(input: string, allowed: string[], counters: Record<string, number> = {}, mode: Replacement = "token"): PiiReport {
  const found: Record<string, number> = {};
  const redacted: Record<string, number> = {};
  const want = new Set(allowed.map((x) => x.toUpperCase()));
  let text = input;
  for (const d of DETECTORS) {
    text = text.replace(d.re, (...args) => {
      const full = args[0] as string;
      const target = d.group ? (args[d.group] as string) : full;
      if (d.valid && !d.valid(target)) return full;
      found[d.type] = (found[d.type] ?? 0) + 1;
      if (!want.has(d.type)) return full;
      redacted[d.type] = (redacted[d.type] ?? 0) + 1;
      counters[d.type] = (counters[d.type] ?? 0) + 1;
      const token =
        mode === "mask" ? "•".repeat(Math.max(4, target.length - 4)) + target.replace(/\s/g, "").slice(-4) : mode === "hash" ? `⟦${d.type}:${shortHash(target)}⟧` : `⟦${d.type}#${counters[d.type]}⟧`;
      return d.group ? full.replace(target, token) : token;
    });
  }
  return { text, found, redacted };
}
