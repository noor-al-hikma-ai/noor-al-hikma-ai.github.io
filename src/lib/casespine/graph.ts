// Projection of a CaseAST onto an Orange-style widget graph. The DSL text is
// the single source of truth: the canvas is re-derived on every edit, and
// palette actions are text edits (see edits.ts). Every node remembers the DSL
// lines it came from, which powers two-way highlighting.

import type { CaseAST } from "./types";

export type Category = "data" | "curate" | "govern" | "retrieve" | "reason" | "verify" | "act" | "human";

export type NodeKind =
  | "source" | "extract" | "pii" | "coherence" | "isolate"
  | "preflight" | "topics" | "rate" | "ladder" | "optimizer" | "cache" | "downscale" | "budget"
  | "bm25" | "dense" | "rrf" | "kag" | "sql"
  | "synth" | "personalize" | "counterfactual" | "milp" | "agent" | "tests" | "sast" | "git" | "canary" | "dashboard" | "task"
  | "hitm" | "milestone" | "gate" | "emit" | "compensate" | "escalate";

export interface KindMeta {
  label: string;
  category: Category;
  glyph: string;
  engine: string;
  doc: string;
}

export const KIND_META: Record<NodeKind, KindMeta> = {
  source: { label: "Case File", category: "data", glyph: "▤", engine: "pdfplumber://", doc: "Documents, tables or lakehouse volumes bound to this case's isolated namespace." },
  extract: { label: "Extract", category: "curate", glyph: "⧉", engine: "pdfplumber_layout://", doc: "Layout-aware prose and table reconstruction (booktabs)." },
  pii: { label: "PII Redactor", category: "curate", glyph: "◐", engine: "presidio_uae://", doc: "Redacts UAE IBAN, Emirates ID, passport, e-mail, phone before indexing (UAE PDPL minimisation)." },
  coherence: { label: "Coherence", category: "curate", glyph: "≋", engine: "coherence_filter://", doc: "Quarantines incoherent chunks below the contract threshold." },
  isolate: { label: "Isolator", category: "curate", glyph: "⊘", engine: "namespace_isolation://", doc: "Non-interference: no chunk may cross case namespaces." },
  preflight: { label: "Pre-flight", category: "govern", glyph: "⊳", engine: "preflight_gate://", doc: "Blocks low-entropy and off-topic queries at 0 tokens." },
  topics: { label: "Topic Gate", category: "govern", glyph: "⌗", engine: "topic_policy://", doc: "Allowed / banned topics. Compiles to Bedrock Guardrails, Azure AI Content Safety or a local classifier." },
  rate: { label: "Rate Limiter", category: "govern", glyph: "⏱", engine: "token_bucket://", doc: "Requests per lane per window; AIMD admission control under load." },
  ladder: { label: "Model Ladder", category: "govern", glyph: "⇣", engine: "model_router://", doc: "Downsizes the model tier as the remaining budget shrinks." },
  optimizer: { label: "Optimizer", category: "govern", glyph: "∂", engine: "z3_smt_optimizer://", doc: "Solves (model tier, effort, compression, appetite) to fit budget and quality." },
  cache: { label: "Semantic Cache", category: "govern", glyph: "↺", engine: "semantic_cache://", doc: "Reuses verified answers for near-duplicate questions at 0 tokens." },
  downscale: { label: "Downscaler", category: "govern", glyph: "⤓", engine: "keda://", doc: "Scales workers to zero when idle (KEDA ScaledObject)." },
  budget: { label: "Budget", category: "govern", glyph: "¤", engine: "budget_ledger://", doc: "Hard token and currency ceiling for this case and its subcases." },
  bm25: { label: "BM25", category: "retrieve", glyph: "β", engine: "okapi_bm25://", doc: "Sparse lexical retrieval (Okapi BM25)." },
  dense: { label: "Dense SVD", category: "retrieve", glyph: "σ", engine: "svd_dense://", doc: "Latent semantic dense retrieval (truncated SVD)." },
  rrf: { label: "RRF Fusion", category: "retrieve", glyph: "⋈", engine: "rrf_reranker://", doc: "Reciprocal Rank Fusion of sparse and dense rankings." },
  kag: { label: "Knowledge Graph", category: "retrieve", glyph: "⌬", engine: "openspg_kag://", doc: "Triples for multi-hop questions (OpenSPG KAG)." },
  sql: { label: "SQL", category: "retrieve", glyph: "⊞", engine: "sql_duckdb://", doc: "Parametric SQL over DuckDB, BigQuery, Databricks SQL or Snowflake." },
  synth: { label: "Synthesize", category: "reason", glyph: "✦", engine: "langgraph://", doc: "Grounded generation with inline citations — compiled to a LangGraph node." },
  personalize: { label: "Personalize", category: "reason", glyph: "◎", engine: "segment_policy://", doc: "Population-segment specific tone and limits." },
  counterfactual: { label: "Counterfactual", category: "verify", glyph: "⇄", engine: "econml_causal://", doc: "Shadow perturbations on protected attributes; fairness evidence for model risk." },
  milp: { label: "MILP Solver", category: "reason", glyph: "▦", engine: "ortools_milp://", doc: "Mixed-integer optimisation with OR-Tools." },
  agent: { label: "SWE Agent", category: "reason", glyph: "⌘", engine: "langgraph_swe://", doc: "Code-change agent orchestrated as a LangGraph sub-graph." },
  tests: { label: "Tests", category: "verify", glyph: "✓", engine: "hypothesis://", doc: "Property-based and regression tests generated from the rules." },
  sast: { label: "SAST", category: "verify", glyph: "⛨", engine: "semgrep_sast://", doc: "Static application security testing." },
  git: { label: "Git Fork", category: "data", glyph: "⑂", engine: "git_fork_ast://", doc: "Fork + AST parse of the target repository." },
  canary: { label: "Canary", category: "act", glyph: "◔", engine: "argo_rollouts://", doc: "Progressive delivery with automatic rollback." },
  dashboard: { label: "Dashboard", category: "act", glyph: "▥", engine: "react_d3_dashboard://", doc: "ROI and SLA dashboard published to the named lane." },
  task: { label: "Python Tool", category: "reason", glyph: "ƒ", engine: "python_tool://", doc: "Any existing script, notebook or API — wrapped as a typed tool." },
  hitm: { label: "Human Review", category: "human", glyph: "☉", engine: "hitm_queue://", doc: "Human-in-the-middle approval by an eligible lane." },
  milestone: { label: "Milestone", category: "verify", glyph: "◆", engine: "cmmn_milestone://", doc: "CMMN milestone; rules gated 'before Milestone X' are checked here." },
  gate: { label: "Lean 4 Gate", category: "verify", glyph: "⊢", engine: "lean4_reference_monitor://", doc: "Spine Reference Monitor: the output ships only if the decidable contract holds." },
  emit: { label: "Deliverable", category: "act", glyph: "✉", engine: "deliverable://", doc: "Signed business deliverable with provenance." },
  compensate: { label: "Compensate", category: "act", glyph: "↶", engine: "saga_compensation://", doc: "Halt loudly and run the compensation handler." },
  escalate: { label: "Escalate", category: "human", glyph: "⚑", engine: "escalation://", doc: "Durable escalation to eligible personnel (waitForTaskToken / HITM queue)." },
};

export const CATEGORY_COLOR: Record<Category, string> = {
  data: "var(--cat-data)",
  curate: "var(--cat-curate)",
  govern: "var(--cat-govern)",
  retrieve: "var(--cat-retrieve)",
  reason: "var(--cat-reason)",
  verify: "var(--cat-verify)",
  act: "var(--cat-act)",
  human: "var(--cat-human)",
};

const STEP_PATTERNS: [RegExp, NodeKind][] = [
  [/cost\s*&\s*traffic guards|pre-?flight|evaluate .*guards/i, "preflight"],
  [/\bfork\b|\bast\b/i, "git"],
  [/extract|reconstruct|booktabs|tables/i, "extract"],
  [/scrub|redact|\bpii\b/i, "pii"],
  [/confounder|namespace/i, "isolate"],
  [/bm25/i, "bm25"],
  [/svd|dense/i, "dense"],
  [/rrf|rerank/i, "rrf"],
  [/openspg|knowledge[- ]graph|triples|\bkag\b/i, "kag"],
  [/\bsql\b|duckdb|bigquery/i, "sql"],
  [/milp|or-tools|ortools/i, "milp"],
  [/software-engineering agent|swe agent|draft patch/i, "agent"],
  [/semgrep|sast/i, "sast"],
  [/hypothesis|regression|\btests?\b/i, "tests"],
  [/smart suggestions|human review|approval|low-confidence/i, "hitm"],
  [/personali[sz]e/i, "personalize"],
  [/counterfactual|perturbation/i, "counterfactual"],
  [/synthesi[sz]e|grounded answer|generate answer/i, "synth"],
  [/canary|\bargo\b|roll out/i, "canary"],
  [/dashboard/i, "dashboard"],
];

export function classifyStep(text: string): { kind: NodeKind }[] {
  const hits: { kind: NodeKind; at: number }[] = [];
  for (const [re, kind] of STEP_PATTERNS) {
    const m = re.exec(text);
    if (m && !hits.some((h) => h.kind === kind)) hits.push({ kind, at: m.index });
  }
  // Discovery/loading steps are represented by the Case File node itself.
  if (!hits.length && /^(discover|load|ingest)/i.test(text)) return [];
  if (!hits.length) return [{ kind: "task" }];
  return hits.sort((a, b) => a.at - b.at).map(({ kind }) => ({ kind }));
}

export interface GNode {
  id: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  lines: number[];
  /** Line range removed by "Remove" (inclusive). */
  removeRange?: [number, number];
  stage?: number;
}

export interface GEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

export interface CaseGraph {
  nodes: GNode[];
  edges: GEdge[];
}

export function deriveGraph(c: CaseAST): CaseGraph {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const counts: Record<string, number> = {};
  let frontier: string[] = [];

  const make = (kind: NodeKind, lines: number[], opts: Partial<GNode> = {}): GNode => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    const n: GNode = { id: `${kind}-${counts[kind]}`, kind, label: KIND_META[kind].label, lines: lines.filter((l) => l > 0), ...opts };
    nodes.push(n);
    return n;
  };
  const chain = (n: GNode, label?: string) => {
    for (const f of frontier) edges.push({ from: f, to: n.id, label });
    frontier = [n.id];
  };
  const existing = (kind: NodeKind) => nodes.find((n) => n.kind === kind);

  // 1. Data and curation
  for (const cf of c.caseFiles) {
    const src = make("source", [cf.line, cf.lines.source ?? 0], { label: cf.name, sub: cf.sources.join(", ") || "upload", removeRange: [cf.line, cf.endLine] });
    frontier = [...frontier.filter((f) => f.startsWith("source")), src.id];
  }
  const cf0 = c.caseFiles[0];
  if (cf0) {
    if (cf0.converters.length) chain(make("extract", [cf0.lines.converters], { sub: cf0.converters[0] }), "pages");
    if (cf0.redact.length) chain(make("pii", [cf0.lines.curation], { sub: cf0.redact.join(" · ") }), "text");
    if (cf0.coherence !== undefined) chain(make("coherence", [cf0.lines.curation], { sub: `≥ ${cf0.coherence}` }), "chunks");
    if (cf0.namespace) chain(make("isolate", [cf0.lines["namespace isolation"]], { sub: cf0.namespace }), "chunks");
  }

  const g = c.guards;
  let guardsPlaced = false;
  const placeGuards = (line: number) => {
    if (guardsPlaced) return;
    guardsPlaced = true;
    const one = (k: NodeKind, l: number | undefined, sub?: string) =>
      chain(make(k, [l ?? line], { sub, removeRange: l ? [l, l] : undefined }), undefined);
    one("preflight", g.preflight?.line ?? line, g.preflight ? `entropy ≥ ${g.preflight.entropy}` : undefined);
    if (g.bannedTopics.length || g.allowedTopics.length)
      one("topics", g.lines.banned ?? g.lines.allowed, g.bannedTopics.length ? `deny ${g.bannedTopics.length}` : `allow ${g.allowedTopics.length}`);
    if (g.rateLimit) one("rate", g.rateLimit.line, `${g.rateLimit.n}/${g.rateLimit.per}`);
    if (g.semanticCache) one("cache", g.semanticCache.line, `sim ≥ ${g.semanticCache.similarity}`);
    if (g.modelLadder) one("ladder", g.modelLadder.line, g.modelLadder.tiers.join(" → "));
    if (g.optimizer) one("optimizer", g.optimizer.line);
    const b = make("budget", [g.lines.budget ?? line], { sub: `${g.budgetTokens.toLocaleString()} tok · $${g.budgetUsd.toFixed(2)}` });
    chain(b);
  };
  const hasGuards = !!(g.preflight || g.rateLimit || g.modelLadder || g.optimizer || g.bannedTopics.length || g.lines.budget);

  // 2. Stages
  c.stages.forEach((st, si) => {
    const isLast = si === c.stages.length - 1;
    const mentionsGuards = st.steps.some((s) => classifyStep(s.norm).some((k) => k.kind === "preflight"));
    if (!mentionsGuards && isLast && hasGuards && !c.stages.some((x) => x.steps.some((s) => classifyStep(s.norm).some((k) => k.kind === "preflight"))))
      placeGuards(st.line);
    for (const s of st.steps) {
      const kinds = classifyStep(s.norm).map((k) => k.kind);
      const range: [number, number] = [s.line, s.line];
      if (kinds.includes("preflight")) {
        placeGuards(s.line);
        nodes.filter((n) => n.kind === "preflight").forEach((n) => n.lines.push(s.line));
      }
      const retr = kinds.filter((k) => k === "bm25" || k === "dense");
      if (retr.length) {
        const before = frontier;
        const made = retr.map((k) => {
          const n = make(k, [s.line], { removeRange: range, stage: st.idx });
          for (const f of before) edges.push({ from: f, to: n.id, label: "query" });
          return n.id;
        });
        frontier = made;
      }
      for (const k of kinds) {
        if (k === "preflight" || k === "bm25" || k === "dense") continue;
        if (["extract", "pii", "isolate", "coherence"].includes(k)) {
          const ex = existing(k);
          if (ex) {
            ex.lines.push(s.line);
            continue;
          }
        }
        const label = k === "task" ? (s.text.length > 22 ? s.text.slice(0, 20) + "…" : s.text) : undefined;
        const n = make(k, [s.line], { removeRange: range, stage: st.idx, ...(label ? { label } : {}) });
        chain(n, k === "rrf" ? "ranks" : undefined);
      }
    }
    if (st.gate) {
      const gate = make("gate", [st.gate.line], { sub: `${c.rules.length} rule${c.rules.length === 1 ? "" : "s"}`, removeRange: [st.gate.line, st.gate.endLine], stage: st.idx });
      chain(gate);
      const emit = make("emit", [st.gate.line + 2], { label: c.deliverable ? c.deliverable.replace(/_/g, " ").slice(0, 26) : "Deliverable", stage: st.idx });
      edges.push({ from: gate.id, to: emit.id, label: "⊢ holds" });
      const comp = make("compensate", [st.gate.endLine], { stage: st.idx });
      edges.push({ from: gate.id, to: comp.id, label: "breach", dashed: true });
      if (st.escalateTo) {
        const esc = make("escalate", [st.escalateLine ?? st.line], { sub: st.escalateTo, stage: st.idx });
        edges.push({ from: comp.id, to: esc.id, dashed: true });
      }
      const ms = make("milestone", [st.milestoneLine ?? st.gate.line], { label: st.milestone, stage: st.idx });
      edges.push({ from: emit.id, to: ms.id });
      frontier = [ms.id];
    } else {
      const tail = frontier;
      if (st.escalateTo) {
        const esc = make("escalate", [st.escalateLine ?? st.line], { sub: st.escalateTo, stage: st.idx });
        for (const t of tail) edges.push({ from: t, to: esc.id, label: "breach", dashed: true });
      }
      const ms = make("milestone", [st.milestoneLine ?? st.line], { label: st.milestone, stage: st.idx });
      for (const t of tail) edges.push({ from: t, to: ms.id });
      frontier = [ms.id];
    }
  });
  if (!c.stages.length && hasGuards) placeGuards(g.sectionLine ?? c.line);
  if (g.downscaling) {
    const d = make("downscale", [g.downscaling.line], { sub: "scale to zero", removeRange: [g.downscaling.line, g.downscaling.line] });
    const b = existing("budget");
    if (b) edges.push({ from: b.id, to: d.id, dashed: true });
  }
  return { nodes, edges };
}

export interface Positioned {
  x: number;
  y: number;
}

/**
 * Layered layout: rank = longest path from sources. Ranks wrap into rows of
 * `cols` columns (reading order), so long pipelines stay legible in a panel.
 */
export function layoutGraph(g: CaseGraph, colW = 132, rowH = 96, cols = 7): Map<string, Positioned> {
  const rank = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const n of g.nodes) incoming.set(n.id, []);
  for (const e of g.edges) incoming.get(e.to)?.push(e.from);
  const visit = (id: string, stack: Set<string>): number => {
    if (rank.has(id)) return rank.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const r = Math.max(-1, ...(incoming.get(id) ?? []).map((p) => visit(p, stack))) + 1;
    stack.delete(id);
    rank.set(id, r);
    return r;
  };
  g.nodes.forEach((n) => visit(n.id, new Set()));
  const byRank = new Map<number, string[]>();
  for (const n of g.nodes) {
    const r = rank.get(n.id)!;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n.id);
  }
  const maxRank = Math.max(0, ...byRank.keys());
  const c = Math.max(3, cols);
  const rows = Math.floor(maxRank / c) + 1;
  // Row height grows with the tallest stack of parallel nodes in that row.
  const rowStack = Array.from({ length: rows }, (_, row) =>
    Math.max(1, ...[...byRank.entries()].filter(([r]) => Math.floor(r / c) === row).map(([, ids]) => ids.length)),
  );
  const rowTop: number[] = [];
  let acc = 0;
  for (let i = 0; i < rows; i++) {
    rowTop.push(acc);
    acc += rowStack[i] * rowH + 56;
  }
  const pos = new Map<string, Positioned>();
  for (const [r, ids] of byRank) {
    const row = Math.floor(r / c);
    const col = r % c;
    const mid = rowTop[row] + (rowStack[row] * rowH) / 2;
    ids.forEach((id, i) => {
      pos.set(id, { x: 70 + col * colW, y: 60 + mid + (i - (ids.length - 1) / 2) * rowH });
    });
  }
  return pos;
}
