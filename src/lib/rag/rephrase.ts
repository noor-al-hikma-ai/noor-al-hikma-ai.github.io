// Help people who do not know how to ask: spelling fixes against the case
// file's own vocabulary, and questions built from the documents' headings.

import { STOP, tokenize } from "./engine";
import type { Index, RunTrace } from "./runtime";

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export function correctSpelling(query: string, idx: Index): string | null {
  const vocab = idx.report.vocab;
  let changed = false;
  const out = query.replace(/[\p{L}][\p{L}-]{3,}/gu, (w) => {
    const lw = w.toLowerCase();
    if (lw.length < 5 || STOP.has(lw)) return w;
    if (vocab.has(lw) || vocab.has(lw.replace(/s$/, "")) || vocab.has(lw + "s")) return w;
    const max = lw.length >= 7 ? 2 : 1;
    let best: string | null = null;
    let bestD = max + 1;
    let bestN = 0;
    for (const [v, n] of vocab) {
      if (v.length < 5 || Math.abs(v.length - lw.length) > max) continue;
      const d = lev(lw, v, max);
      if (d < bestD || (d === bestD && n > bestN)) {
        best = v;
        bestD = d;
        bestN = n;
      }
    }
    if (!best || bestD > max) return w;
    changed = true;
    return best;
  });
  return changed && out.toLowerCase() !== query.toLowerCase() ? out : null;
}

const asQuestion = (h: string) => {
  const t = h.trim().replace(/\s+/g, " ");
  if (/^(how|what|when|who|which|can|may|is|are)\b/i.test(t)) return t.endsWith("?") ? t : t + "?";
  return `What are the rules on ${t.charAt(0).toLowerCase() + t.slice(1)}?`;
};

export function relatedQuestions(query: string, idx: Index, trace?: RunTrace, n = 3): string[] {
  const qt = new Set(tokenize(query));
  const citedDocs = new Set(trace?.answer?.citations.map((c) => c.chunk.doc) ?? []);
  const scored = idx.report.headings.map((h, i) => {
    const ht = tokenize(h.text);
    const overlap = ht.filter((t) => qt.has(t)).length;
    return { h, score: overlap * 2 + (citedDocs.has(h.doc) ? 1 : 0) - i * 0.001 };
  });
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scored) {
    const q = asQuestion(s.h.text);
    const key = q.toLowerCase();
    if (seen.has(key) || key === query.trim().toLowerCase()) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= n) break;
  }
  return out;
}
