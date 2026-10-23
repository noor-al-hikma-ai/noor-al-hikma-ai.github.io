// In-browser hybrid RAG engine: curation (PII + coherence), Okapi BM25,
// latent-semantic dense retrieval (randomised truncated SVD, k = 12),
// Reciprocal Rank Fusion and extractive, citation-grounded synthesis.
// Deterministic and dependency-free so every step can be audited.

import { redactPII, type Replacement } from "./pii";
import type { ExtractedDoc } from "./extract";

// ------------------------------------------------------------- text utils
export const STOP = new Set(
  (
    "a an the and or of to in on for with by from at as is are was were be been being it its this that these those " +
    "which who whom what when where why how not no can may must shall should will would do does did has have had " +
    "into than then there their them they we you your our i he she his her if else per any all each such also other " +
    "more most less least over under about between within without upon via e g ie etc " +
    "في من على إلى عن مع هذا هذه ذلك التي الذي أن إن كان كانت لا ما أو و ثم قد كل بعد قبل عند"
  ).split(/\s+/),
);

export function stem(w: string): string {
  if (/[؀-ۿ]/.test(w)) return w.replace(/^(وال|بال|كال|فال|لل|ال)/, "").replace(/(ات|ون|ين|ة|ه|ها)$/, "");
  if (w.length <= 3) return w;
  return w
    .replace(/(ational|tional)$/, "tion")
    .replace(/(ies)$/, "y")
    .replace(/(ings|ing)$/, "")
    .replace(/(edly|ed)$/, "")
    .replace(/(ers|er)$/, "")
    .replace(/(s)$/, "")
    // Collapse issue / issued / issues to one stem.
    .replace(/(?<=..)e$/, "");
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = m[0];
    if (w.length < 2 || STOP.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

/** Shannon character entropy normalised by log2(26) — "lexical entropy". */
export function lexicalEntropy(q: string): number {
  const s = q.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (!s.length) return 0;
  const f = new Map<string, number>();
  for (const ch of s) f.set(ch, (f.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of f.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return Math.min(1, h / Math.log2(26));
}

export const approxTokens = (s: string) => Math.ceil(s.length / 4);

// ------------------------------------------------------------- chunks
export interface Chunk {
  id: number;
  doc: string;
  docIdx: number;
  page: number;
  text: string;
  tokens: string[];
  coherence: number;
  namespace: string;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?؟。:])\s+(?=[\p{Lu}\p{Lo}\d"(⟦])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

export function coherenceScore(text: string): number {
  const toks = text.split(/\s+/).filter(Boolean);
  if (!toks.length) return 0;
  const alpha = toks.filter((t) => /\p{L}{2,}/u.test(t)).length / toks.length;
  const sents = splitSentences(text);
  const complete = sents.filter((s) => /[.!?؟:;)]$/.test(s)).length / Math.max(1, sents.length);
  const len = Math.min(1, toks.length / 35);
  const avgLen = toks.length / Math.max(1, sents.length);
  const sentShape = avgLen >= 5 && avgLen <= 45 ? 1 : 0.6;
  return Math.max(0, Math.min(1, 0.45 * alpha + 0.25 * complete + 0.15 * len + 0.15 * sentShape));
}

export interface CurationReport {
  chunks: Chunk[];
  quarantined: Chunk[];
  piiFound: Record<string, number>;
  piiRedacted: Record<string, number>;
  piiLeftInPlace: Record<string, number>;
  pages: number;
  headings: { doc: string; text: string }[];
  vocab: Map<string, number>;
}

export function curate(docs: ExtractedDoc[], redactList: string[], minCoherence: number, namespace: string, targetWords = 110, piiMode: Replacement = "token", overlap = 1): CurationReport {
  const headings: { doc: string; text: string }[] = [];
  const vocab = new Map<string, number>();
  const chunks: Chunk[] = [];
  const quarantined: Chunk[] = [];
  const piiFound: Record<string, number> = {};
  const piiRedacted: Record<string, number> = {};
  const counters: Record<string, number> = {};
  let id = 0;
  let pages = 0;
  docs.forEach((doc, docIdx) => {
    for (const page of doc.pages) {
      pages++;
      const rep = redactPII(page.text, redactList, counters, piiMode);
      for (const w of rep.text.toLowerCase().match(/[\p{L}][\p{L}-]{2,}/gu) ?? []) vocab.set(w, (vocab.get(w) ?? 0) + 1);
      for (const [k, v] of Object.entries(rep.found)) piiFound[k] = (piiFound[k] ?? 0) + v;
      for (const [k, v] of Object.entries(rep.redacted)) piiRedacted[k] = (piiRedacted[k] ?? 0) + v;
      // Markdown / numbered headings become their own paragraph.
      const paras = rep.text
        .split(/\n\s*\n|\n(?=#)|(?<=^#[^\n]*)\n/m)
        .map((p) => p.trim())
        .filter(Boolean);
      let buf: string[] = [];
      let words = 0;
      const flush = () => {
        if (!buf.length) return;
        const text = buf.join(" ").replace(/\s+/g, " ").trim();
        const c: Chunk = { id: id++, doc: doc.name, docIdx, page: page.num, text, tokens: tokenize(text), coherence: coherenceScore(text), namespace };
        (c.coherence >= minCoherence && c.tokens.length >= 4 ? chunks : quarantined).push(c);
        // 1-sentence overlap keeps context across chunk boundaries.
        buf = overlap > 0 && buf.length > overlap ? buf.slice(-overlap) : [];
        words = buf.join(" ").split(/\s+/).length;
      };
      for (const p of paras) {
        const heading = p.length < 90 && !/[.!?]$/.test(p) ? p.replace(/^#+\s*/, "") + ":" : null;
        if (heading && !/synthetic sample|^demo bank/i.test(heading)) headings.push({ doc: doc.name, text: heading.replace(/^\d+[.)]\s*/, "").replace(/:$/, "") });
        const sents = heading ? [heading] : splitSentences(p);
        for (const s of sents) {
          buf.push(s);
          words += s.split(/\s+/).length;
          if (words >= targetWords) flush();
        }
      }
      if (buf.length && words > 12) flush();
      buf = [];
      words = 0;
    }
  });
  const piiLeftInPlace: Record<string, number> = {};
  for (const [k, v] of Object.entries(piiFound)) if ((piiRedacted[k] ?? 0) < v) piiLeftInPlace[k] = v - (piiRedacted[k] ?? 0);
  return { chunks, quarantined, piiFound, piiRedacted, piiLeftInPlace, pages, headings, vocab };
}

// ------------------------------------------------------------- BM25
export class BM25 {
  private df = new Map<string, number>();
  private tf: Map<string, number>[] = [];
  private len: number[] = [];
  private avg = 0;
  constructor(private docs: string[][], private k1 = 1.2, private b = 0.75) {
    for (const d of docs) {
      const m = new Map<string, number>();
      for (const t of d) m.set(t, (m.get(t) ?? 0) + 1);
      this.tf.push(m);
      this.len.push(d.length);
      for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, docs.length);
  }
  idf(t: string) {
    const n = this.docs.length;
    const df = this.df.get(t) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }
  has(t: string) {
    return this.df.has(t);
  }
  score(q: string[]): number[] {
    return this.tf.map((m, i) => {
      let s = 0;
      for (const t of new Set(q)) {
        const f = m.get(t);
        if (!f) continue;
        s += this.idf(t) * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.len[i]) / this.avg)));
      }
      return s;
    });
  }
  get vocabSize() {
    return this.df.size;
  }
}

// ------------------------------------------------------------- dense LSA (randomised SVD)
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function orthonormalize(cols: Float64Array[]): Float64Array[] {
  const out: Float64Array[] = [];
  for (const v0 of cols) {
    const v = Float64Array.from(v0);
    for (const u of out) {
      let d = 0;
      for (let i = 0; i < v.length; i++) d += v[i] * u[i];
      for (let i = 0; i < v.length; i++) v[i] -= d * u[i];
    }
    let n = 0;
    for (let i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n);
    if (n > 1e-10) {
      for (let i = 0; i < v.length; i++) v[i] /= n;
      out.push(v);
    }
  }
  return out;
}

/** Jacobi eigen-decomposition of a small symmetric matrix. */
function jacobiEigen(A: number[][]): { values: number[]; vectors: number[][] } {
  const n = A.length;
  const a = A.map((r) => [...r]);
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-14) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-14) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const tt = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(tt * tt + 1);
        const s = tt * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
  }
  const values = a.map((r, i) => r[i]);
  const order = values.map((_, i) => i).sort((x, y) => values[y] - values[x]);
  return { values: order.map((i) => values[i]), vectors: order.map((i) => v.map((r) => r[i])) };
}

export class DenseLSA {
  readonly dims: number;
  private vocab = new Map<string, number>();
  private idf: Float64Array;
  private V: Float64Array[] = []; // k vectors over vocab
  private sigma: number[] = [];
  private emb: Float64Array[] = [];
  readonly explained: number;

  constructor(docs: string[][], k = 12, seed = 1337) {
    for (const d of docs) for (const t of d) if (!this.vocab.has(t)) this.vocab.set(t, this.vocab.size);
    const V = this.vocab.size;
    const n = docs.length;
    const df = new Float64Array(V);
    for (const d of docs) for (const t of new Set(d)) df[this.vocab.get(t)!]++;
    this.idf = df.map((x) => Math.log((1 + n) / (1 + x)) + 1);
    // Sparse, L2-normalised TF-IDF rows.
    const rows: { idx: Int32Array; val: Float64Array }[] = docs.map((d) => this.vectorize(d));
    const l = Math.min(k + 8, Math.max(1, Math.min(n, V)));
    const rnd = mulberry32(seed);
    const mulX = (cols: Float64Array[]) =>
      cols.map((c) => {
        const y = new Float64Array(n);
        rows.forEach((r, i) => {
          let s = 0;
          for (let j = 0; j < r.idx.length; j++) s += r.val[j] * c[r.idx[j]];
          y[i] = s;
        });
        return y;
      });
    const mulXt = (cols: Float64Array[]) =>
      cols.map((c) => {
        const z = new Float64Array(V);
        rows.forEach((r, i) => {
          const ci = c[i];
          if (!ci) return;
          for (let j = 0; j < r.idx.length; j++) z[r.idx[j]] += r.val[j] * ci;
        });
        return z;
      });
    let omega: Float64Array[] = Array.from({ length: l }, () => Float64Array.from({ length: V }, () => rnd() * 2 - 1));
    let Q: Float64Array[] = orthonormalize(mulX(omega));
    for (let it = 0; it < 3; it++) {
      omega = orthonormalize(mulXt(Q));
      Q = orthonormalize(mulX(omega));
    }
    const B = mulXt(Q); // rows of B = Q^T X, stored as vocab-length vectors
    const m = B.length;
    const BBt = Array.from({ length: m }, (_, i) =>
      Array.from({ length: m }, (_, j) => {
        let s = 0;
        const bi = B[i], bj = B[j];
        for (let t = 0; t < V; t++) s += bi[t] * bj[t];
        return s;
      }),
    );
    const { values, vectors } = jacobiEigen(BBt);
    const kk = Math.min(k, values.filter((x) => x > 1e-9).length);
    this.dims = kk;
    const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    this.explained = values.slice(0, kk).reduce((a, b) => a + b, 0) / total;
    for (let c = 0; c < kk; c++) {
      const s = Math.sqrt(values[c]);
      this.sigma.push(s);
      const w = vectors[c];
      const vec = new Float64Array(V);
      for (let i = 0; i < m; i++) {
        const bi = B[i];
        const wi = w[i] / s;
        for (let t = 0; t < V; t++) vec[t] += bi[t] * wi;
      }
      this.V.push(vec);
    }
    this.emb = rows.map((r) => this.project(r));
  }

  private vectorize(tokens: string[]) {
    const tf = new Map<number, number>();
    for (const t of tokens) {
      const i = this.vocab.get(t);
      if (i !== undefined) tf.set(i, (tf.get(i) ?? 0) + 1);
    }
    const idx = Int32Array.from(tf.keys());
    const val = Float64Array.from([...tf.entries()].map(([i, f]) => (1 + Math.log(f)) * this.idf[i]));
    const norm = Math.sqrt(val.reduce((a, b) => a + b * b, 0)) || 1;
    for (let j = 0; j < val.length; j++) val[j] /= norm;
    return { idx, val };
  }

  private project(r: { idx: Int32Array; val: Float64Array }) {
    const e = new Float64Array(this.dims);
    for (let c = 0; c < this.dims; c++) {
      let s = 0;
      for (let j = 0; j < r.idx.length; j++) s += r.val[j] * this.V[c][r.idx[j]];
      e[c] = s;
    }
    const n = Math.sqrt(e.reduce((a, b) => a + b * b, 0)) || 1;
    return e.map((x) => x / n);
  }

  score(q: string[]): number[] {
    const qe = this.project(this.vectorize(q));
    return this.emb.map((e) => e.reduce((a, x, i) => a + x * qe[i], 0));
  }

  embedding(i: number) {
    return this.emb[i];
  }
}

// ------------------------------------------------------------- fusion + synthesis
export interface Ranked {
  chunk: Chunk;
  bm25: number;
  bm25Rank: number;
  dense: number;
  denseRank: number;
  rrf: number;
}

export function rrfFuse(chunks: Chunk[], bm: number[], de: number[], k = 60, top = 4): Ranked[] {
  const rank = (s: number[]) => {
    const order = s.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
    const r = new Array(s.length);
    order.forEach(([, i], pos) => (r[i] = pos + 1));
    return r as number[];
  };
  const rb = rank(bm);
  const rd = rank(de);
  return chunks
    .map((c, i) => ({
      chunk: c,
      bm25: bm[i],
      bm25Rank: rb[i],
      dense: de[i],
      denseRank: rd[i],
      rrf: (bm[i] > 0 ? 1 / (k + rb[i]) : 0) + (de[i] > 0.05 ? 1 / (k + rd[i]) : 0),
    }))
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, top);
}

export interface Answer {
  sentences: { text: string; cite: number; support: number }[];
  citations: { n: number; chunk: Chunk }[];
  abstained: boolean;
  coverage: number;
}

export function synthesize(question: string, ranked: Ranked[], maxSentences = 3, abstain = true): Answer {
  const qt = new Set(tokenize(question));
  const cands: { text: string; cite: number; score: number; order: number }[] = [];
  ranked.forEach((r, ri) => {
    splitSentences(r.chunk.text).forEach((s, si) => {
      const st = tokenize(s);
      if (st.length < 4 || /:$/.test(s)) return;
      const overlap = st.filter((t) => qt.has(t)).length;
      const score = overlap / Math.sqrt(st.length) + 0.35 / (ri + 1) + (overlap ? 0.2 : 0);
      if (overlap > 0) cands.push({ text: s, cite: ri, score, order: ri * 100 + si });
    });
  });
  if (!cands.length && !abstain && ranked.length) {
    splitSentences(ranked[0].chunk.text)
      .filter((x) => !/:$/.test(x))
      .slice(0, maxSentences)
      .forEach((x, si) => cands.push({ text: x, cite: 0, score: 0.1, order: si }));
  }
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0]?.score ?? 0;
  const chosen: typeof cands = [];
  for (const c of cands) {
    if (c.score < best * 0.62) break;
    if (chosen.length >= maxSentences) break;
    const ct = new Set(tokenize(c.text));
    const dup = chosen.some((x) => {
      const xt = tokenize(x.text);
      return xt.filter((t) => ct.has(t)).length / Math.max(1, Math.min(xt.length, ct.size)) > 0.7;
    });
    if (!dup) chosen.push(c);
  }
  chosen.sort((a, b) => a.order - b.order);
  const used = [...new Set(chosen.map((c) => c.cite))];
  const citeNo = new Map(used.map((ri, i) => [ri, i + 1]));
  const sentences = chosen.map((c) => {
    const st = tokenize(c.text);
    const src = new Set(ranked[c.cite].chunk.tokens);
    const support = st.filter((t) => src.has(t)).length / Math.max(1, st.length);
    return { text: c.text, cite: citeNo.get(c.cite)!, support };
  });
  const supported = sentences.filter((s) => s.support >= 0.6).length;
  return {
    sentences,
    citations: used.map((ri) => ({ n: citeNo.get(ri)!, chunk: ranked[ri].chunk })),
    abstained: sentences.length === 0,
    coverage: sentences.length ? supported / sentences.length : 0,
  };
}
