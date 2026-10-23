// Inspector bindings: for each widget kind, the editable fields, how to read
// them from the compiled case and how to write them back as CaseSpine text.

import { cfg, componentSpec, formatValue, type FieldSpec } from "./configSchema";
import { curationString, replaceValueAtLine, setConfig, upsertKey } from "./edits";
import type { NodeKind } from "./graph";
import type { CaseAST, Stage } from "./types";
import { PII_ENTITIES } from "./vocab";

export type BindingValue = string | number | boolean | string[];

export interface Binding {
  id: string;
  label: string;
  section: string;
  field: FieldSpec;
  get: (c: CaseAST) => BindingValue;
  set: (src: string, c: CaseAST, v: BindingValue) => string;
}

const lanesOf = (c: CaseAST) => c.lanes.map((l) => l.name);

function componentBindings(component: string, only?: string[]): Binding[] {
  const spec = componentSpec(component);
  if (!spec) return [];
  return spec.fields
    .filter((f) => !only || only.includes(f.key))
    .map((f) => ({
      id: `${component}.${f.key}`,
      label: f.key,
      section: `Config › ${spec.name}`,
      field: f,
      get: (c: CaseAST) => cfg(c.config, component, f.key) as BindingValue,
      set: (src: string, c: CaseAST, v: BindingValue) => setConfig(src, c, spec.name, f.key, formatValue(v)),
    }));
}

const guard = (id: string, field: FieldSpec, get: (c: CaseAST) => BindingValue, write: (c: CaseAST, v: BindingValue) => [string, string]): Binding => ({
  id,
  label: field.key,
  section: "Cost & Traffic Guards",
  field,
  get,
  set: (src, c, v) => {
    const [k, val] = write(c, v);
    return upsertKey(src, c, ["Cost & Traffic Guards"], k, val);
  },
});

const cfName = (c: CaseAST) => c.caseFiles[0]?.name ?? "Documents";
const caseFile = (id: string, field: FieldSpec, get: (c: CaseAST) => BindingValue, write: (c: CaseAST, v: BindingValue) => [string, string]): Binding => ({
  id,
  label: field.key,
  section: "Case File",
  field,
  get,
  set: (src, c, v) => {
    const [k, val] = write(c, v);
    return upsertKey(src, c, ["Case File", cfName(c)], k, val);
  },
});

const num = (key: string, def: number, min: number, max: number, step: number, doc: string): FieldSpec => ({ key, type: "number", default: def, min, max, step, doc });

function lastStageWithEscalation(c: CaseAST): Stage | undefined {
  return [...c.stages].reverse().find((s) => s.escalateTo);
}

export function bindingsFor(kind: NodeKind, c: CaseAST, stageIdx?: number): Binding[] {
  switch (kind) {
    case "source":
      return [
        caseFile("cf.source", { key: "Source", type: "text", default: "", doc: 'Comma-separated files, e.g. policy.pdf, manual.pdf' }, (x) => x.caseFiles[0]?.sources.join(", ") ?? "", (_, v) => ["Source", `pdf(${String(v).split(",").map((s) => `"${s.trim()}"`).filter((s) => s !== '""').join(", ")})`]),
        ...componentBindings("Chunker"),
      ];
    case "extract":
      return [
        caseFile("cf.converters", { key: "Converters", type: "multi", default: [], options: ["pdfplumber_layout", "booktabs_table_extractor", "openspg_kag_triple_extractor", "ocr_arabic", "docx"], doc: "Document converters." }, (x) => x.caseFiles[0]?.converters ?? [], (_, v) => ["Converters", formatValue(v)]),
        ...componentBindings("Extractor"),
      ];
    case "pii":
      return [
        caseFile("cf.redact", { key: "Entities", type: "multi", default: [], options: PII_ENTITIES, doc: "Personal data redacted before indexing." }, (x) => x.caseFiles[0]?.redact ?? [], (x, v) => ["Curation", curationString(v as string[], x.caseFiles[0]?.coherence)]),
        ...componentBindings("PII Redactor"),
      ];
    case "coherence":
      return [caseFile("cf.coherence", num("Min Coherence", 0.85, 0.5, 0.98, 0.01, "Chunks below this score are quarantined."), (x) => x.caseFiles[0]?.coherence ?? 0.85, (x, v) => ["Curation", curationString(x.caseFiles[0]?.redact ?? [], Number(v))])];
    case "isolate":
      return [caseFile("cf.iso", { key: "Isolation", type: "select", default: "strict", options: ["strict", "shared"], doc: "strict: chunks never cross case namespaces." }, (x) => (x.caseFiles[0]?.namespace === "shared" ? "shared" : "strict"), (x, v) => ["Namespace Isolation", v === "shared" ? "shared" : `strict ("${x.caseFiles[0]?.namespace && x.caseFiles[0].namespace !== "shared" ? x.caseFiles[0].namespace : x.namespacePath}")`])];
    case "preflight":
      return [
        guard("pf.entropy", num("Min Lexical Entropy", 0.65, 0.3, 0.9, 0.01, "Lower entropy queries are blocked at 0 tokens."), (x) => x.guards.preflight?.entropy ?? 0.65, (x, v) => ["Pre-Flight Gate", `Loudly block stupid queries (lexical entropy < ${v})${x.guards.preflight?.offTopic !== false ? " and off-topic queries" : ""} at 0 tokens.`]),
        guard("pf.off", { key: "Block Off-topic", type: "toggle", default: true, doc: "Block queries with no overlap with the case file." }, (x) => x.guards.preflight?.offTopic ?? true, (x, v) => ["Pre-Flight Gate", `Loudly block stupid queries (lexical entropy < ${x.guards.preflight?.entropy ?? 0.65})${v ? " and off-topic queries" : ""} at 0 tokens.`]),
      ];
    case "topics": {
      const list = (v: BindingValue) => `[${String(v).split(",").map((t) => t.trim()).filter(Boolean).join(", ")}]`;
      return [
        guard("tp.banned", { key: "Banned Topics", type: "text", default: "", doc: "Comma-separated." }, (x) => x.guards.bannedTopics.join(", "), (_, v) => ["Banned Topics", list(v)]),
        guard("tp.allowed", { key: "Allowed Topics", type: "text", default: "", doc: "Comma-separated; empty means any topic in the case file." }, (x) => x.guards.allowedTopics.join(", "), (_, v) => ["Allowed Topics", list(v)]),
      ];
    }
    case "rate": {
      const rl = (x: CaseAST) => x.guards.rateLimit ?? { n: 30, per: "minute" as const, scope: "Lane", line: 0 };
      const write = (n: number, per: string, scope: string): [string, string] => ["Rate Limit", `${n} requests/${per} per ${scope}`];
      return [
        guard("rl.n", num("Requests", 30, 1, 1000, 1, "Allowed requests per window."), (x) => rl(x).n, (x, v) => write(Number(v), rl(x).per, rl(x).scope)),
        guard("rl.per", { key: "Per", type: "select", default: "minute", options: ["second", "minute", "hour"], doc: "Window." }, (x) => rl(x).per, (x, v) => write(rl(x).n, String(v), rl(x).scope)),
        guard("rl.scope", { key: "Scope", type: "select", default: "Lane", options: ["Lane", "User", "Case"], doc: "Who shares the bucket." }, (x) => rl(x).scope, (x, v) => write(rl(x).n, rl(x).per, String(v))),
      ];
    }
    case "ladder": {
      const ml = (x: CaseAST) => x.guards.modelLadder ?? { tiers: ["large", "medium", "small"], threshold: 40, line: 0 };
      const write = (tiers: string[], th: number): [string, string] => ["Model Ladder", `[${tiers.join(", ")}] when budget remaining < ${th}%`];
      return [
        guard("ml.tiers", { key: "Tiers", type: "multi", default: ["large", "medium", "small"], options: ["large", "medium", "small"], doc: "Order of downsizing." }, (x) => ml(x).tiers, (x, v) => write(v as string[], ml(x).threshold ?? 40)),
        guard("ml.th", num("Engage Below %", 40, 5, 90, 5, "Remaining-budget share that triggers downsizing."), (x) => ml(x).threshold ?? 40, (x, v) => write(ml(x).tiers, Number(v))),
      ];
    }
    case "optimizer":
      return [guard("opt.q", num("Quality Floor", 0.78, 0.5, 0.99, 0.01, "Never pick a tier below this quality."), (x) => parseFloat(/quality\s*>=\s*([0-9.]+)/i.exec(x.guards.optimizer?.text ?? "")?.[1] ?? "0.78"), (_, v) => ["Adaptive Optimizer", `Solve over (model tier, thinking effort, context compression, token appetite) to stay within budget and quality >= ${v}.`])];
    case "cache":
      return [guard("cache.sim", num("Similarity", 0.92, 0.6, 0.99, 0.01, "Jaccard similarity needed to reuse an answer."), (x) => x.guards.semanticCache?.similarity ?? 0.92, (_, v) => ["Semantic Cache", `reuse verified answers when similarity >= ${v}`])];
    case "downscale":
      return [guard("ds.min", num("Idle Minutes", 15, 1, 240, 1, "Scale to zero after this idle time."), (x) => parseInt(/(\d+)\s*min/i.exec(x.guards.downscaling?.text ?? "")?.[1] ?? "15", 10), (_, v) => ["Downscaling", `scale to zero after ${v} minutes idle`])];
    case "budget":
      return [
        guard("b.tok", num("Tokens", 4000, 500, 200000, 500, "Token ceiling per inquiry."), (x) => x.guards.budgetTokens, (x, v) => ["Budget Ceiling", `${v} tokens or $${x.guards.budgetUsd.toFixed(2)}`]),
        guard("b.usd", num("USD", 0.1, 0.01, 50, 0.01, "Currency ceiling per inquiry."), (x) => x.guards.budgetUsd, (x, v) => ["Budget Ceiling", `${x.guards.budgetTokens} tokens or $${Number(v).toFixed(2)}`]),
        guard("b.value", num("Value Per Outcome $", 3.5, 0, 1000, 0.5, "What one resolved case is worth."), (x) => x.guards.valuePerOutcomeUsd ?? 0, (_, v) => ["Value Per Outcome", `$${Number(v).toFixed(2)} per resolved inquiry`]),
        guard("b.roi", num("Target ROI ×", 4, 1, 100, 0.5, "Minimum value / cost."), (x) => x.guards.targetRoi ?? 0, (_, v) => ["Target ROI", `${v}x`]),
      ];
    case "bm25":
      return componentBindings("Retriever", ["Mode", "Top K", "BM25 k1", "BM25 b"]);
    case "dense":
      return componentBindings("Retriever", ["Top K", "Dense Dims"]);
    case "rrf":
      return componentBindings("Retriever", ["Top K", "RRF k"]);
    case "kag":
      return componentBindings("Knowledge Graph");
    case "sql":
      return componentBindings("SQL");
    case "synth":
      return componentBindings("Synthesizer");
    case "personalize":
      return componentBindings("Personalizer");
    case "counterfactual":
      return componentBindings("Counterfactual");
    case "milp":
      return componentBindings("MILP");
    case "agent":
      return componentBindings("SWE Agent");
    case "tests":
      return componentBindings("Tests");
    case "sast":
      return componentBindings("SAST");
    case "canary":
      return componentBindings("Canary");
    case "dashboard":
      return componentBindings("Dashboard").map((b) => (b.field.type === "lane" ? { ...b, field: { ...b.field, options: lanesOf(c) } } : b));
    case "task":
      return componentBindings("Python Tool");
    case "hitm":
      return componentBindings("Human Review").map((b) => (b.field.type === "lane" ? { ...b, field: { ...b.field, options: lanesOf(c) } } : b));
    case "gate":
      return componentBindings("Exit Gateway");
    case "emit":
      return componentBindings("Deliverable");
    case "compensate":
      return componentBindings("Compensation");
    case "escalate": {
      const st = (stageIdx !== undefined ? c.stages.find((s) => s.idx === stageIdx) : undefined) ?? lastStageWithEscalation(c);
      const options = [...new Set([...lanesOf(c), ...(st?.escalateTo ? [st.escalateTo] : [])])];
      const lane: Binding = {
        id: "esc.lane",
        label: "Escalate To",
        section: st ? `Stage ${st.idx} › On Breach` : "On Breach",
        field: { key: "Escalate To", type: "select", default: options[0] ?? "", options, doc: "Lane or queue of eligible personnel." },
        get: (x) => x.stages.find((s) => s.idx === st?.idx)?.escalateTo ?? "",
        set: (src, x, v) => {
          const cur = x.stages.find((s) => s.idx === st?.idx);
          return cur?.escalateLine ? replaceValueAtLine(src, cur.escalateLine, String(v)) : src;
        },
      };
      return [lane, ...componentBindings("Escalation")];
    }
    default:
      return [];
  }
}
