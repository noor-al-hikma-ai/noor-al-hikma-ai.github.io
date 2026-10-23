// Component configuration vocabulary. Every visual widget maps to a component;
// every component has typed fields with defaults and allowed values. The same
// schema drives the `Config:` section of the language, editor completion and
// hover, the canvas inspector forms and the runtime.

export type FieldType = "number" | "select" | "multi" | "toggle" | "text" | "lane";

export interface FieldSpec {
  key: string;
  type: FieldType;
  doc: string;
  default: string | number | boolean | string[];
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export interface ComponentSpec {
  name: string;
  doc: string;
  fields: FieldSpec[];
}

const n = (key: string, def: number, min: number, max: number, step: number, doc: string): FieldSpec => ({ key, type: "number", default: def, min, max, step, doc });
const s = (key: string, def: string, options: string[], doc: string): FieldSpec => ({ key, type: "select", default: def, options, doc });
const m = (key: string, def: string[], options: string[], doc: string): FieldSpec => ({ key, type: "multi", default: def, options, doc });
const t = (key: string, def: boolean, doc: string): FieldSpec => ({ key, type: "toggle", default: def, doc });

export const COMPONENTS: ComponentSpec[] = [
  {
    name: "Retriever",
    doc: "Hybrid retrieval: sparse BM25 and dense SVD rankings fused with Reciprocal Rank Fusion.",
    fields: [
      s("Mode", "hybrid", ["hybrid", "bm25", "dense"], "Which rankings to use."),
      n("Top K", 3, 1, 10, 1, "Chunks passed to synthesis."),
      n("BM25 k1", 1.2, 0.5, 2.5, 0.1, "Term-frequency saturation."),
      n("BM25 b", 0.75, 0, 1, 0.05, "Length normalisation."),
      n("Dense Dims", 12, 4, 48, 1, "Latent dimensions of the SVD index."),
      n("RRF k", 60, 10, 120, 1, "Fusion constant; larger values flatten rank differences."),
    ],
  },
  {
    name: "Synthesizer",
    doc: "Writes the grounded answer with inline citations (a LangGraph node in production).",
    fields: [
      s("Model", "auto", ["auto", "large", "medium", "small"], "auto follows the Model Ladder."),
      n("Temperature", 0.1, 0, 1, 0.05, "Lower is more deterministic."),
      n("Max Sentences", 3, 1, 8, 1, "Upper bound on answer length."),
      s("Citation Style", "inline", ["inline", "footnote"], "Where citations appear."),
      t("Abstain When Unsupported", true, "Refuse instead of guessing when evidence is weak."),
      s("Language", "auto", ["auto", "en", "ar"], "Answer language."),
    ],
  },
  {
    name: "Chunker",
    doc: "Splits curated documents into retrievable chunks.",
    fields: [n("Target Words", 110, 40, 400, 10, "Approximate words per chunk."), n("Overlap Sentences", 1, 0, 3, 1, "Sentences repeated across chunk boundaries.")],
  },
  {
    name: "Extractor",
    doc: "Layout-aware text and table extraction.",
    fields: [
      s("Engine", "pdfplumber_layout", ["pdfplumber_layout", "pdfjs", "docling", "ocr_arabic"], "Extraction engine."),
      t("Tables", true, "Reconstruct tables."),
      t("OCR", false, "Run OCR on scanned pages."),
      m("Languages", ["en", "ar"], ["en", "ar", "fr", "hi", "ur"], "Document languages."),
    ],
  },
  {
    name: "PII Redactor",
    doc: "How detected personal data is replaced before indexing.",
    fields: [s("Replacement", "token", ["token", "mask", "hash"], "⟦TYPE#n⟧ token, •••• mask or short hash."), t("Detect Names", false, "Also redact person names (slower).")],
  },
  {
    name: "Knowledge Graph",
    doc: "Triple store for multi-hop questions.",
    fields: [s("Engine", "openspg_kag", ["openspg_kag", "neo4j", "networkx"], "Graph engine."), n("Max Hops", 2, 1, 4, 1, "Traversal depth.")],
  },
  {
    name: "SQL",
    doc: "Parametric SQL over the lakehouse or warehouse.",
    fields: [
      s("Engine", "duckdb", ["duckdb", "databricks_sql", "bigquery", "snowflake", "postgres"], "SQL engine."),
      n("Timeout Seconds", 30, 1, 300, 1, "Query timeout."),
      t("Read Only", true, "Reject statements that modify data."),
    ],
  },
  {
    name: "Personalizer",
    doc: "Segment-specific tone and language.",
    fields: [s("Tone", "formal", ["formal", "friendly", "concise"], "Voice of the answer."), s("Language", "auto", ["auto", "en", "ar"], "Answer language.")],
  },
  {
    name: "Counterfactual",
    doc: "Fairness probe: re-runs the case with protected attributes perturbed.",
    fields: [
      n("Perturbations", 4, 1, 16, 1, "Shadow runs per decision."),
      m("Attributes", ["nationality", "gender"], ["nationality", "gender", "branch_emirate", "age_band"], "Attributes to perturb."),
      n("Max JSD", 0.02, 0.005, 0.1, 0.005, "Largest tolerated distribution shift."),
    ],
  },
  {
    name: "MILP",
    doc: "Mixed-integer optimisation solver.",
    fields: [s("Solver", "ortools_cp_sat", ["ortools_cp_sat", "highs", "gurobi"], "Solver backend."), n("Time Limit Seconds", 60, 5, 3600, 5, "Wall-clock limit."), n("Gap Percent", 1, 0, 10, 0.5, "Accepted optimality gap.")],
  },
  {
    name: "SWE Agent",
    doc: "Code-change agent (LangGraph sub-graph).",
    fields: [s("Model", "large", ["large", "medium"], "Model tier."), n("Max Iterations", 6, 1, 20, 1, "Edit / test loops before escalation.")],
  },
  {
    name: "Tests",
    doc: "Generated regression and property tests.",
    fields: [s("Framework", "hypothesis", ["hypothesis", "pytest"], "Test framework."), n("Min Coverage Percent", 95, 50, 100, 1, "Required coverage.")],
  },
  {
    name: "SAST",
    doc: "Static application security testing.",
    fields: [s("Ruleset", "owasp-top-10", ["owasp-top-10", "p/ci", "custom"], "Rule pack."), s("Fail On", "critical", ["critical", "high", "medium"], "Lowest severity that blocks.")],
  },
  {
    name: "Canary",
    doc: "Progressive delivery.",
    fields: [n("Initial Traffic Percent", 10, 1, 50, 1, "First step."), n("Step Percent", 20, 5, 50, 5, "Increment per step."), n("Interval Minutes", 15, 5, 120, 5, "Wait between steps.")],
  },
  {
    name: "Dashboard",
    doc: "ROI and SLA dashboard for a lane.",
    fields: [
      n("Refresh Minutes", 15, 1, 1440, 1, "Refresh interval."),
      m("Metrics", ["ROI", "cost per answer", "escalation rate"], ["ROI", "cost per answer", "escalation rate", "latency", "volume"], "Tiles to show."),
      { key: "Audience", type: "lane", default: "", doc: "Lane that receives the dashboard." },
    ],
  },
  {
    name: "Python Tool",
    doc: "Existing script or API wrapped as a typed tool.",
    fields: [{ key: "Script", type: "text", default: "tool.py", doc: "Entry point." }, n("Timeout Seconds", 30, 1, 600, 1, "Per call."), n("Retries", 2, 0, 5, 1, "Retries on failure.")],
  },
  {
    name: "Human Review",
    doc: "Human-in-the-middle approval.",
    fields: [{ key: "Approver", type: "lane", default: "", doc: "Lane that approves." }, n("SLA Hours", 4, 1, 72, 1, "Time to decide."), n("Confidence Threshold", 0.8, 0.5, 0.99, 0.01, "Below this, route to a human.")],
  },
  {
    name: "Exit Gateway",
    doc: "Lean 4 reference monitor behaviour.",
    fields: [s("Fail Mode", "fail-closed", ["fail-closed", "fail-open"], "What happens when a probe is unbound."), t("Log Proofs", true, "Store proof terms in the audit ledger.")],
  },
  {
    name: "Escalation",
    doc: "How escalations reach people.",
    fields: [s("Channel", "queue", ["queue", "teams", "email", "slack"], "Delivery channel."), n("SLA Hours", 4, 1, 72, 1, "Time to respond.")],
  },
  {
    name: "Deliverable",
    doc: "Format of the emitted business deliverable.",
    fields: [s("Format", "json", ["json", "pdf", "email", "api"], "Output format."), t("Sign", true, "Attach a signature and provenance.")],
  },
  {
    name: "Compensation",
    doc: "What runs when the contract is breached.",
    fields: [s("Action", "quarantine", ["quarantine", "rollback", "notify"], "Compensation handler.")],
  },
];

export const normName = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function componentSpec(name: string): ComponentSpec | undefined {
  const k = normName(name);
  return COMPONENTS.find((c) => normName(c.name) === k);
}

export function fieldSpec(component: string, field: string): FieldSpec | undefined {
  const k = normName(field);
  return componentSpec(component)?.fields.find((f) => normName(f.key) === k);
}

export function formatValue(v: unknown): string {
  if (Array.isArray(v)) return `[${v.join(", ")}]`;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

export function inlineDefaults(spec: ComponentSpec, max = 4): string {
  return "{ " + spec.fields.filter((f) => f.type !== "lane").slice(0, max).map((f) => `${f.key}: ${formatValue(f.default)}`).join(", ") + " }";
}

/** Split "{ A: 1, B: [x, y] }" into pairs, respecting brackets and quotes. */
export function parseInlineMap(v: string): [string, string][] {
  const body = v.trim().replace(/^\{/, "").replace(/\}\s*$/, "");
  const parts: string[] = [];
  let depth = 0, quote = "", cur = "";
  for (const ch of body) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "{" || ch === "(") depth++;
    else if (ch === "]" || ch === "}" || ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts
    .map((p) => {
      const i = p.indexOf(":");
      return i < 0 ? null : ([p.slice(0, i).trim(), p.slice(i + 1).trim()] as [string, string]);
    })
    .filter((x): x is [string, string] => !!x && !!x[0]);
}

export function serializeInlineMap(pairs: [string, string][]): string {
  return "{ " + pairs.map(([k, v]) => `${k}: ${v}`).join(", ") + " }";
}

/** Typed read of a config value with the schema default as fallback. */
export function cfg<T extends string | number | boolean | string[]>(config: Record<string, Record<string, string>>, component: string, field: string): T {
  const spec = fieldSpec(component, field);
  const raw = config[normName(component)]?.[normName(field)];
  const def = (spec?.default ?? "") as T;
  if (raw === undefined || raw === "") return def;
  if (!spec) return raw as T;
  switch (spec.type) {
    case "number": {
      const x = parseFloat(raw);
      return (Number.isFinite(x) ? x : def) as T;
    }
    case "toggle":
      return (/^(true|yes|on|1)$/i.test(raw) ? true : /^(false|no|off|0)$/i.test(raw) ? false : def) as T;
    case "multi":
      return raw.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean) as T;
    default:
      return raw.replace(/^"(.*)"$/, "$1") as T;
  }
}

/** Validation message for a value, or null when it is acceptable. */
export function validateField(spec: FieldSpec, raw: string): string | null {
  const v = raw.trim();
  if (spec.type === "number") {
    const x = parseFloat(v);
    if (!Number.isFinite(x)) return `${spec.key} expects a number.`;
    if (spec.min !== undefined && x < spec.min) return `${spec.key} must be ≥ ${spec.min}.`;
    if (spec.max !== undefined && x > spec.max) return `${spec.key} must be ≤ ${spec.max}.`;
  } else if (spec.type === "select" && spec.options && !spec.options.includes(v.replace(/^"(.*)"$/, "$1"))) {
    return `${spec.key} should be one of: ${spec.options.join(", ")}.`;
  } else if (spec.type === "toggle" && !/^(true|false|yes|no|on|off)$/i.test(v)) {
    return `${spec.key} expects true or false.`;
  } else if (spec.type === "multi" && spec.options) {
    const bad = v.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter((x) => x && !spec.options!.includes(x));
    if (bad.length) return `${spec.key}: unknown value ${bad.join(", ")} (allowed: ${spec.options.join(", ")}).`;
  }
  return null;
}
