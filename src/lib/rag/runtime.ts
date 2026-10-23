// The CaseSpine runtime, scaled down to a browser tab: the compiled case
// drives curation, ROI guards, retrieval, synthesis and the Lean exit gateway.

import { evalRule } from "../casespine/rules";
import type { CaseAST, CompiledRule } from "../casespine/types";
import { BM25, DenseLSA, approxTokens, curate, lexicalEntropy, rrfFuse, synthesize, tokenize, type Answer, type Chunk, type CurationReport, type Ranked } from "./engine";
import type { ExtractedDoc } from "./extract";

export interface Index {
  report: CurationReport;
  bm25: BM25;
  dense: DenseLSA;
  ms: number;
  namespace: string;
  redact: string[];
  minCoherence: number;
}

export function buildIndex(docs: ExtractedDoc[], c: CaseAST): Index {
  const t0 = performance.now();
  const cf = c.caseFiles[0];
  const redact = [...new Set(c.caseFiles.flatMap((f) => f.redact))];
  const minCoherence = cf?.coherence ?? 0.7;
  const report = curate(docs, redact, minCoherence, c.namespacePath);
  const toks = report.chunks.map((x) => x.tokens);
  const bm25 = new BM25(toks.length ? toks : [["empty"]]);
  const dense = new DenseLSA(toks.length ? toks : [["empty"]], 12);
  return { report, bm25, dense, ms: performance.now() - t0, namespace: c.namespacePath, redact, minCoherence };
}

// Illustrative list prices (USD per 1M tokens) for the model ladder.
export const TIERS = {
  large: { in: 3.0, out: 15.0, quality: 0.93, label: "Large (frontier)" },
  medium: { in: 0.8, out: 4.0, quality: 0.87, label: "Medium" },
  small: { in: 0.15, out: 0.6, quality: 0.8, label: "Small (local LoRA)" },
} as const;
export type Tier = keyof typeof TIERS;

export interface SessionState {
  spentUsd: number;
  valueUsd: number;
  sessionBudgetUsd: number;
  requests: number[]; // timestamps
  cache: { q: Set<string>; answer: Answer; ranked: Ranked[] }[];
}

export function newSession(budget = 1): SessionState {
  return { spentUsd: 0, valueUsd: 0, sessionBudgetUsd: budget, requests: [], cache: [] };
}

export interface GateStep {
  id: string;
  label: string;
  status: "pass" | "block" | "info" | "skip";
  detail: string;
}

export interface RuleOutcome {
  rule: CompiledRule;
  verdict: boolean | undefined;
  probes: { field: string; value: number | boolean | undefined; expected: string; ok: boolean | undefined }[];
}

export interface RunTrace {
  query: string;
  lane: string;
  steps: GateStep[];
  blocked: boolean;
  blockReason?: string;
  ranked: Ranked[];
  answer?: Answer;
  tier?: Tier;
  tokens: { prompt: number; context: number; output: number; total: number };
  costUsd: number;
  compressed: number;
  cached: boolean;
  state: Record<string, number | boolean | undefined>;
  rules: RuleOutcome[];
  outcome: "VERIFIED" | "BREACH" | "FAIL_CLOSED" | "BLOCKED";
  escalateTo?: string;
  latencyMs: number;
}

export interface RunOptions {
  lane: string;
  probes: Record<string, number | boolean>;
  injectConfounder: boolean;
  topK: number;
}

const flipOp: Record<string, string> = { ">=": "≥", "<=": "≤", ">": ">", "<": "<", "=": "=", "!=": "≠" };

function bannedHit(q: string, topics: string[]): string | null {
  const qt = new Set(tokenize(q));
  for (const t of topics) {
    const tt = tokenize(t);
    if (tt.length && tt.filter((x) => qt.has(x)).length >= Math.max(1, Math.ceil(tt.length * 0.5))) return t;
  }
  return null;
}

export function runQuery(query: string, c: CaseAST, idx: Index, session: SessionState, opt: RunOptions): RunTrace {
  const t0 = performance.now();
  const g = c.guards;
  const steps: GateStep[] = [];
  const trace: RunTrace = {
    query,
    lane: opt.lane,
    steps,
    blocked: false,
    ranked: [],
    tokens: { prompt: 0, context: 0, output: 0, total: 0 },
    costUsd: 0,
    compressed: 0,
    cached: false,
    state: {},
    rules: [],
    outcome: "BLOCKED",
    latencyMs: 0,
  };
  const block = (id: string, label: string, detail: string) => {
    steps.push({ id, label, status: "block", detail });
    trace.blocked = true;
    trace.blockReason = detail;
    trace.outcome = "BLOCKED";
    trace.latencyMs = performance.now() - t0;
    return trace;
  };

  // 1. Rate limit (token bucket per lane)
  const now = Date.now();
  if (g.rateLimit) {
    const win = g.rateLimit.per === "second" ? 1000 : g.rateLimit.per === "hour" ? 3_600_000 : 60_000;
    session.requests = session.requests.filter((ts) => now - ts < win);
    if (session.requests.length >= g.rateLimit.n)
      return block("rate", "Rate limiter", `${g.rateLimit.n} requests/${g.rateLimit.per} per ${g.rateLimit.scope} exceeded — HTTP 429, 0 tokens spent.`);
    session.requests.push(now);
    steps.push({ id: "rate", label: "Rate limiter", status: "pass", detail: `${session.requests.length}/${g.rateLimit.n} in the current ${g.rateLimit.per}` });
  }

  // 2. Pre-flight gate
  const entropy = lexicalEntropy(query);
  const minEntropy = g.preflight?.entropy ?? 0.65;
  if (query.trim().length < 6 || entropy < minEntropy)
    return block("preflight", "Pre-flight gate", `Lexical entropy ${entropy.toFixed(2)} < ${minEntropy} — blocked loudly at 0 tokens.`);
  const banned = bannedHit(query, g.bannedTopics);
  if (banned) return block("topics", "Topic gate", `Banned topic “${banned}” — blocked at 0 tokens and logged.`);
  if (g.allowedTopics.length && !bannedHit(query, g.allowedTopics))
    return block("topics", "Topic gate", `Outside allowed topics [${g.allowedTopics.join(", ")}].`);
  const qt = tokenize(query);
  const known = qt.filter((t) => idx.bm25.has(t));
  if (!idx.report.chunks.length) return block("preflight", "Pre-flight gate", "Case File is empty — upload documents first.");
  if (g.preflight?.offTopic !== false && known.length === 0)
    return block("preflight", "Pre-flight gate", "Off-topic: no query term occurs in this case's isolated corpus — blocked at 0 tokens.");
  steps.push({ id: "preflight", label: "Pre-flight gate", status: "pass", detail: `entropy ${entropy.toFixed(2)} ≥ ${minEntropy}; ${known.length}/${qt.length} terms in corpus` });

  // 3. Semantic cache
  if (g.semanticCache) {
    const qs = new Set(qt);
    for (const e of session.cache) {
      const inter = [...qs].filter((x) => e.q.has(x)).length;
      const jac = inter / (qs.size + e.q.size - inter || 1);
      if (jac >= g.semanticCache.similarity) {
        trace.cached = true;
        trace.answer = e.answer;
        trace.ranked = e.ranked;
        steps.push({ id: "cache", label: "Semantic cache", status: "pass", detail: `hit (similarity ${jac.toFixed(2)}) — served at 0 tokens` });
        break;
      }
    }
    if (!trace.cached) steps.push({ id: "cache", label: "Semantic cache", status: "info", detail: "miss" });
  }

  // 4. Retrieval: BM25 + dense SVD + RRF
  if (!trace.cached) {
    const bm = idx.bm25.score(qt);
    const de = idx.dense.score(qt);
    trace.ranked = rrfFuse(idx.report.chunks, bm, de, 60, opt.topK);
    if (opt.injectConfounder && idx.report.chunks.length) {
      const foreign: Chunk = { ...idx.report.chunks[idx.report.chunks.length - 1], namespace: "OtherCase/ConventionalRetailCards", id: -1, doc: "foreign_case_memo.pdf" };
      trace.ranked = [...trace.ranked.slice(0, opt.topK - 1), { chunk: foreign, bm25: 0, bm25Rank: 99, dense: 0, denseRank: 99, rrf: 0 }];
    }
    steps.push({ id: "retrieve", label: "Hybrid retrieval", status: "pass", detail: `BM25 + ${idx.dense.dims}D SVD → RRF top ${trace.ranked.length}` });
  }

  // 5. Adaptive optimizer + model ladder
  const ladder = (g.modelLadder?.tiers.filter((t): t is Tier => t in TIERS) ?? ["large", "medium", "small"]) as Tier[];
  const remainingFrac = 1 - session.spentUsd / session.sessionBudgetUsd;
  const threshold = (g.modelLadder?.threshold ?? 40) / 100;
  let tierIdx = 0;
  if (remainingFrac < threshold) tierIdx = Math.min(ladder.length - 1, 1 + Math.floor((threshold - remainingFrac) / (threshold / 2)));
  const qualityFloor = parseFloat(/quality\s*>=\s*([0-9.]+)/i.exec(g.optimizer?.text ?? "")?.[1] ?? "0.78");
  let ranked = trace.ranked;
  const promptTokens = approxTokens(query) + 180; // system prompt + contract preamble
  const outTokens = 220;
  let contextTokens = ranked.reduce((a, r) => a + approxTokens(r.chunk.text), 0);
  let compressed = 0;
  while (promptTokens + contextTokens + outTokens > g.budgetTokens && ranked.length > 1) {
    ranked = ranked.slice(0, -1);
    compressed++;
    contextTokens = ranked.reduce((a, r) => a + approxTokens(r.chunk.text), 0);
  }
  const cost = (t: Tier) => ((promptTokens + contextTokens) * TIERS[t].in + outTokens * TIERS[t].out) / 1e6;
  while (tierIdx < ladder.length - 1 && cost(ladder[tierIdx]) > g.budgetUsd) tierIdx++;
  while (tierIdx > 0 && TIERS[ladder[tierIdx]].quality < qualityFloor) tierIdx--;
  const tier = ladder[tierIdx] ?? "medium";
  trace.tier = tier;
  trace.compressed = compressed;
  if (!trace.cached) {
    trace.ranked = ranked;
    trace.tokens = { prompt: promptTokens, context: contextTokens, output: outTokens, total: promptTokens + contextTokens + outTokens };
    trace.costUsd = cost(tier);
  }
  steps.push({
    id: "optimizer",
    label: "ROI optimizer",
    status: "pass",
    detail: trace.cached
      ? "cached answer — no model call"
      : `${TIERS[tier].label} · ${trace.tokens.total} tokens · $${trace.costUsd.toFixed(4)}${compressed ? ` · context compressed (−${compressed} chunk)` : ""}${remainingFrac < threshold ? ` · ladder engaged at ${(remainingFrac * 100).toFixed(0)}% session budget` : ""}`,
  });

  // 6. Synthesis
  if (!trace.cached) trace.answer = synthesize(query, trace.ranked);
  const ans = trace.answer!;
  steps.push({
    id: "synth",
    label: "Grounded synthesis",
    status: ans.abstained ? "block" : "pass",
    detail: ans.abstained ? "No grounded evidence — abstained instead of guessing." : `${ans.sentences.length} sentences, ${ans.citations.length} citations`,
  });

  // 7. Runtime state → Lean exit gateway
  const latency = performance.now() - t0;
  const required = new Set([...idx.redact, ...c.rules.flatMap((r) => r.entities)]);
  const leftover = idx.report.piiLeftInPlace;
  const used = trace.ranked.map((r) => r.chunk);
  const state: Record<string, number | boolean | undefined> = {
    piiRedacted: [...required].every((t) => !leftover[t]),
    coherenceMillipoints: used.length ? Math.round((used.reduce((a, x) => a + x.coherence, 0) / used.length) * 1000) : 0,
    crossCaseConfoundersCount: used.filter((x) => x.namespace !== idx.namespace).length,
    lineageNamespaceVerified: true,
    citationCoverageMillipoints: Math.round(ans.coverage * 1000),
    tokensConsumed: trace.cached ? 0 : trace.tokens.total,
    costPerQueryCents: Math.round(trace.costUsd * 100),
    p95LatencyMs: Math.round(latency),
    ...opt.probes,
  };
  trace.state = state;
  trace.rules = c.rules.map((rule) => ({
    rule,
    verdict: evalRule(rule, state),
    probes: rule.clauses.map((cl) => ({
      field: cl.field,
      value: state[cl.field],
      expected: cl.rhsField ? `${flipOp[cl.op]} ${cl.rhsField}` : `${flipOp[cl.op]} ${cl.value}`,
      ok: state[cl.field] === undefined ? undefined : evalRule({ ...rule, clauses: [cl], negated: false }, state),
    })),
  }));
  const anyFalse = trace.rules.some((r) => r.verdict === false);
  const anyUnbound = trace.rules.some((r) => r.verdict === undefined);
  trace.outcome = anyFalse ? "BREACH" : anyUnbound ? "FAIL_CLOSED" : "VERIFIED";
  const lastStage = c.stages[c.stages.length - 1];
  if (trace.outcome !== "VERIFIED") trace.escalateTo = lastStage?.escalateTo ?? c.lanes.find((l) => l.roles.some((r) => /APPROVER/.test(r)))?.name ?? "Case Owner";
  steps.push({
    id: "gate",
    label: "Lean 4 exit gateway",
    status: trace.outcome === "VERIFIED" ? "pass" : "block",
    detail:
      trace.outcome === "VERIFIED"
        ? `all ${c.rules.length} rules hold — deliverable emitted`
        : trace.outcome === "BREACH"
          ? `contract breached — halt, compensate, escalate to ${trace.escalateTo}`
          : `unbound probes — fail-closed, escalate to ${trace.escalateTo}`,
  });

  if (!trace.cached) session.spentUsd += trace.costUsd;
  if (trace.outcome === "VERIFIED") {
    session.valueUsd += g.valuePerOutcomeUsd ?? 0;
    if (g.semanticCache && !trace.cached) session.cache.push({ q: new Set(qt), answer: ans, ranked: trace.ranked });
  }
  trace.latencyMs = latency;
  return trace;
}
