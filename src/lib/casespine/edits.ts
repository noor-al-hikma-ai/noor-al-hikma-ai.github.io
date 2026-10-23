// Text edits behind the visual canvas: palette actions, config forms and
// removals all rewrite the CaseSpine source, so the visual and textual views
// can never disagree.

import { buildTree, normKey, type SpecNode } from "./tree";
import { normalizeArabic, hasArabic } from "./arabic";
import { componentSpec, inlineDefaults, normName, parseInlineMap, serializeInlineMap } from "./configSchema";
import { classifyStep, type NodeKind } from "./graph";
import type { CaseAST } from "./types";

function findNode(nodes: SpecNode[], line: number): SpecNode | null {
  for (const n of nodes) {
    if (n.line === line) return n;
    if (line > n.line && line <= n.endLine) {
      const hit = findNode(n.children, line);
      if (hit) return hit;
    }
  }
  return null;
}

function insertAfter(src: string, afterLine: number, block: string[]): string {
  const lines = src.split("\n");
  lines.splice(afterLine, 0, ...block);
  return lines.join("\n");
}

function treeOf(src: string) {
  return buildTree(hasArabic(src) ? normalizeArabic(src) : src);
}

function childIndent(n: SpecNode): number {
  return n.children.length ? n.children[0].indent : n.indent + 2;
}

const same = (a: string, b: string) => normName(a) === normName(b) || normKey(a) === normKey(b);

/** Replace the value after the first colon of a line, keeping key and indentation. */
export function replaceValueAtLine(src: string, line: number, value: string): string {
  const lines = src.split("\n");
  const cur = lines[line - 1];
  if (cur === undefined) return src;
  const m = /^(\s*(?:-\s+)?[^:]*?:)(?:\s.*)?$/.exec(cur);
  lines[line - 1] = m ? `${m[1]} ${value}` : cur;
  return lines.join("\n");
}

interface Container {
  nodes: SpecNode[];
  indent: number;
  endLine: number;
}

function caseContainer(tree: SpecNode[], c: CaseAST): Container {
  if (c.kind === "Case") {
    return { nodes: tree, indent: 0, endLine: Math.max(c.line, ...tree.map((n) => n.endLine)) };
  }
  const item = findNode(tree, c.line);
  if (!item) return { nodes: tree, indent: 0, endLine: c.endLine };
  return { nodes: item.children, indent: childIndent(item), endLine: item.endLine };
}

/**
 * Set `key: value` at `path` inside the case (e.g. ["Config", "Retriever"]),
 * creating missing sections in a tidy place and editing inline `{ … }` maps.
 */
export function upsertKey(src: string, c: CaseAST, path: string[], key: string, value: string): string {
  const tree = treeOf(src);
  const cont = caseContainer(tree, c);
  let nodes = cont.nodes;
  let indent = cont.indent;
  let parentEnd = cont.endLine;
  for (let i = 0; i < path.length; i++) {
    const hit = nodes.find((n) => n.key && same(n.key, path[i]));
    if (!hit) {
      const block: string[] = [];
      let ind = indent;
      for (let j = i; j < path.length; j++) {
        block.push(" ".repeat(ind) + path[j] + ":");
        ind += 2;
      }
      block.push(" ".repeat(ind) + key + ": " + value);
      if (i === 0) {
        const anchor = nodes.find((n) => ["process flow", "subcases", "deployment"].includes(normKey(n.key)));
        return anchor ? insertAfter(src, anchor.line - 1, [...block, ""]) : insertAfter(src, cont.endLine, ["", ...block]);
      }
      return insertAfter(src, parentEnd, block);
    }
    if (i === path.length - 1 && (hit.value ?? "").trim().startsWith("{")) {
      const pairs = parseInlineMap(hit.value ?? "");
      const k = pairs.findIndex(([kk]) => same(kk, key));
      if (k >= 0) pairs[k][1] = value;
      else pairs.push([key, value]);
      return replaceValueAtLine(src, hit.line, serializeInlineMap(pairs));
    }
    nodes = hit.children;
    indent = childIndent(hit);
    parentEnd = hit.endLine;
  }
  const leaf = nodes.find((n) => n.key && same(n.key, key));
  if (leaf) return replaceValueAtLine(src, leaf.line, value);
  return insertAfter(src, parentEnd, [" ".repeat(indent) + key + ": " + value]);
}

export function setConfig(src: string, c: CaseAST, component: string, field: string, value: string): string {
  return upsertKey(src, c, ["Config", component], field, value);
}

/** Add a component's default config block if the case has none for it yet. */
export function ensureComponentConfig(src: string, c: CaseAST, component: string): string {
  const spec = componentSpec(component);
  if (!spec || c.config[normName(component)]) return src;
  return upsertKey(src, c, ["Config"], spec.name, inlineDefaults(spec));
}

export function curationString(entities: string[], coherence?: number): string {
  const parts: string[] = [];
  if (entities.length) parts.push(`redact [${entities.join(", ")}]`);
  if (coherence !== undefined) parts.push(`require coherence >= ${coherence}`);
  return parts.join(" and ") || "redact [UAE_IBAN, EMIRATES_ID]";
}

function caseFileName(c: CaseAST) {
  return c.caseFiles[0]?.name ?? "Documents";
}

export function addStep(src: string, c: CaseAST, text: string, stageIdx?: number): string {
  const st = stageIdx !== undefined ? c.stages.find((s) => s.idx === stageIdx) : c.stages[c.stages.length - 1];
  const tree = treeOf(src);
  if (!st) {
    const cont = caseContainer(tree, c);
    const ind = " ".repeat(cont.indent);
    return insertAfter(src, cont.endLine, [
      "",
      ind + "Process Flow:",
      ind + "  - Stage 1 (Main):",
      ind + "      When: Request received",
      ind + "      Steps:",
      ind + "        - " + text,
      ind + "      Reach Milestone: CaseResolved",
    ]);
  }
  if (st.stepsLine) {
    const steps = findNode(tree, st.stepsLine);
    if (steps) return insertAfter(src, steps.endLine, [" ".repeat(childIndent(steps)) + "- " + text]);
  }
  const stage = findNode(tree, st.line);
  if (!stage) return src;
  const ind = childIndent(stage);
  return insertAfter(src, st.line, [" ".repeat(ind) + "Steps:", " ".repeat(ind + 2) + "- " + text]);
}

export function addRule(src: string, c: CaseAST, ruleText: string): string {
  const tree = treeOf(src);
  if (c.rulesLine) {
    const rules = findNode(tree, c.rulesLine);
    if (rules) return insertAfter(src, rules.endLine, [" ".repeat(childIndent(rules)) + "- " + ruleText]);
  }
  const cont = caseContainer(tree, c);
  const anchor = cont.nodes.find((n) => ["cost & traffic guards", "process flow", "subcases"].includes(normKey(n.key)));
  const ind = cont.indent;
  const block = [" ".repeat(ind) + "Binding Lean Contract:", " ".repeat(ind + 2) + "Rules (SBVR & FEEL Constrained English):", " ".repeat(ind + 4) + "- " + ruleText, ""];
  return anchor ? insertAfter(src, anchor.line - 1, block) : insertAfter(src, cont.endLine, ["", ...block]);
}

export function addGuard(src: string, c: CaseAST, key: string, value: string): string {
  return upsertKey(src, c, ["Cost & Traffic Guards"], key, value);
}

export function addEscalation(src: string, c: CaseAST, lane: string): string {
  const st = [...c.stages].reverse().find((s) => !s.escalateTo) ?? c.stages[c.stages.length - 1];
  if (!st || st.escalateTo) return src;
  const tree = treeOf(src);
  const stage = findNode(tree, st.line);
  if (!stage) return src;
  const ind = childIndent(stage);
  const steps = st.stepsLine ? findNode(tree, st.stepsLine) : null;
  const after = steps ? steps.endLine : st.line;
  return insertAfter(src, after, [" ".repeat(ind) + "On Breach:", " ".repeat(ind + 2) + "Escalate To: " + lane]);
}

export function addExitGateway(src: string, c: CaseAST): string {
  const st = c.stages[c.stages.length - 1];
  if (!st || st.gate) return src;
  const tree = treeOf(src);
  const stage = findNode(tree, st.line);
  if (!stage) return src;
  const ind = " ".repeat(childIndent(stage));
  return insertAfter(src, stage.endLine, [
    ind + "Exit Gateway (Lean 4 Spine Reference Monitor):",
    ind + "  If: all Binding Lean Contract rules hold",
    ind + `  Then: Emit Verified Answer and reach Milestone ${st.milestone === "StageCompleted" ? "CaseResolved" : st.milestone}`,
    ind + '  Else: Halt loudly and Compensate via "Quarantine Output"',
  ]);
}

export function removeRange(src: string, range: [number, number]): string {
  const lines = src.split("\n");
  lines.splice(range[0] - 1, range[1] - range[0] + 1);
  return lines.join("\n");
}

/** Which lines differ between two versions (for flashing inserted text). */
export function changedLines(before: string, after: string): number[] {
  const a = before.split("\n"), b = after.split("\n");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let ja = a.length - 1, jb = b.length - 1;
  while (ja >= i && jb >= i && a[ja] === b[jb]) {
    ja--;
    jb--;
  }
  const out: number[] = [];
  for (let k = i; k <= jb; k++) out.push(k + 1);
  return out;
}

export interface PaletteItem {
  kind: NodeKind;
  label: string;
  group: string;
  hint: string;
  component?: string;
  apply: (src: string, c: CaseAST) => string;
  /** Hidden when the case already has this capability. */
  present?: (c: CaseAST) => boolean;
}

const lastMilestone = (c: CaseAST) => c.stages[c.stages.length - 1]?.milestone ?? "StageExit";
const approver = (c: CaseAST) => c.lanes.find((l) => l.roles.some((r) => /HITM|APPROVER/i.test(r)))?.name ?? c.lanes[0]?.name ?? "Case Owner";
const hasStep = (c: CaseAST, k: NodeKind) => c.stages.some((s) => s.steps.some((x) => classifyStep(x.norm).some((y) => y.kind === k)));

const withConfig = (component: string, fn: (s: string, c: CaseAST) => string) => (s: string, c: CaseAST) => ensureComponentConfig(fn(s, c), c, component);

export const PALETTE: PaletteItem[] = [
  // Data & curation
  { kind: "source", label: "Document Source", group: "Data", hint: "Another case file (PDF, SharePoint, S3, Unity Catalog)", apply: (s, c) => upsertKey(s, c, ["Case File", c.caseFiles.length ? "Additional Documents" : "Documents"], "Source", 'pdf("documents.pdf")') },
  { kind: "extract", label: "Extractor", group: "Data", hint: "Text and tables from PDFs", component: "Extractor", apply: withConfig("Extractor", (s, c) => upsertKey(s, c, ["Case File", caseFileName(c)], "Converters", "[pdfplumber_layout, booktabs_table_extractor]")), present: (c) => !!c.caseFiles[0]?.converters.length },
  { kind: "pii", label: "PII Redactor", group: "Data", hint: "Redact IBAN, Emirates ID, e-mail…", component: "PII Redactor", apply: withConfig("PII Redactor", (s, c) => upsertKey(s, c, ["Case File", caseFileName(c)], "Curation", curationString(["UAE_IBAN", "EMIRATES_ID", "EMAIL"], c.caseFiles[0]?.coherence))), present: (c) => !!c.caseFiles[0]?.redact.length },
  { kind: "coherence", label: "Coherence Filter", group: "Data", hint: "Quarantine garbled chunks", apply: (s, c) => upsertKey(s, c, ["Case File", caseFileName(c)], "Curation", curationString(c.caseFiles[0]?.redact ?? [], 0.85)), present: (c) => c.caseFiles[0]?.coherence !== undefined },
  { kind: "isolate", label: "Isolator", group: "Data", hint: "No cross-case leakage", apply: (s, c) => upsertKey(s, c, ["Case File", caseFileName(c)], "Namespace Isolation", `strict ("${c.namespacePath}")`), present: (c) => !!c.caseFiles[0]?.namespace },
  // Govern ROI
  { kind: "preflight", label: "Pre-flight Gate", group: "Govern ROI", hint: "Block junk at 0 tokens", apply: (s, c) => addGuard(s, c, "Pre-Flight Gate", "Loudly block stupid queries (lexical entropy < 0.65) and off-topic queries at 0 tokens."), present: (c) => !!c.guards.preflight },
  { kind: "budget", label: "Budget", group: "Govern ROI", hint: "Ceiling per answer", apply: (s, c) => addGuard(s, c, "Budget Ceiling", "4000 tokens or $0.10"), present: (c) => !!c.guards.lines.budget },
  { kind: "rate", label: "Rate Limiter", group: "Govern ROI", hint: "Requests per lane", apply: (s, c) => addGuard(s, c, "Rate Limit", "30 requests/minute per Lane"), present: (c) => !!c.guards.rateLimit },
  { kind: "topics", label: "Topic Gate", group: "Govern ROI", hint: "Banned topics", apply: (s, c) => addGuard(s, c, "Banned Topics", "[investment advice, cryptocurrency speculation]"), present: (c) => c.guards.bannedTopics.length > 0 },
  { kind: "ladder", label: "Model Ladder", group: "Govern ROI", hint: "Downsize as budget shrinks", apply: (s, c) => addGuard(s, c, "Model Ladder", "[large, medium, small] when budget remaining < 40%"), present: (c) => !!c.guards.modelLadder },
  { kind: "optimizer", label: "Optimizer", group: "Govern ROI", hint: "Cost vs quality solver", apply: (s, c) => addGuard(s, c, "Adaptive Optimizer", "Solve over (model tier, thinking effort, context compression, token appetite) to stay within budget and quality >= 0.78."), present: (c) => !!c.guards.optimizer },
  { kind: "cache", label: "Semantic Cache", group: "Govern ROI", hint: "Reuse verified answers", apply: (s, c) => addGuard(s, c, "Semantic Cache", "reuse verified answers when similarity >= 0.92"), present: (c) => !!c.guards.semanticCache },
  { kind: "downscale", label: "Downscaler", group: "Govern ROI", hint: "Scale to zero when idle", apply: (s, c) => addGuard(s, c, "Downscaling", "scale to zero after 15 minutes idle"), present: (c) => !!c.guards.downscaling },
  // Retrieve
  { kind: "bm25", label: "Hybrid Retriever", group: "Retrieve", hint: "BM25 + dense + RRF", component: "Retriever", apply: withConfig("Retriever", (s, c) => addStep(s, c, "Retrieve top 3 chunks using Okapi BM25 and 12D SVD Dense Indexer with RRF Reranker")), present: (c) => hasStep(c, "bm25") },
  { kind: "kag", label: "Knowledge Graph", group: "Retrieve", hint: "Multi-hop triples", component: "Knowledge Graph", apply: withConfig("Knowledge Graph", (s, c) => addStep(s, c, "Extract OpenSPG knowledge-graph triples for multi-hop questions")), present: (c) => hasStep(c, "kag") },
  { kind: "sql", label: "SQL Query", group: "Retrieve", hint: "Lakehouse / warehouse", component: "SQL", apply: withConfig("SQL", (s, c) => addStep(s, c, "Query customer limits with parametric SQL from Databricks SQL")), present: (c) => hasStep(c, "sql") },
  // Reason
  { kind: "synth", label: "Synthesizer", group: "Reason", hint: "Grounded answer with citations", component: "Synthesizer", apply: withConfig("Synthesizer", (s, c) => addStep(s, c, "Synthesize grounded answer with inline page and chunk citations")), present: (c) => hasStep(c, "synth") },
  { kind: "task", label: "Python Tool", group: "Reason", hint: "Wrap an existing script", component: "Python Tool", apply: withConfig("Python Tool", (s, c) => addStep(s, c, "Run existing script fx_normalise.py to convert amounts to AED")) },
  { kind: "personalize", label: "Personalizer", group: "Reason", hint: "Tone and language", component: "Personalizer", apply: withConfig("Personalizer", (s, c) => addStep(s, c, "Personalize output for the customer segment")), present: (c) => hasStep(c, "personalize") },
  { kind: "milp", label: "MILP Solver", group: "Reason", hint: "Optimisation", component: "MILP", apply: withConfig("MILP", (s, c) => addStep(s, c, "Solve MILP allocation with OR-Tools under capacity constraints")), present: (c) => hasStep(c, "milp") },
  { kind: "agent", label: "SWE Agent", group: "Reason", hint: "Code changes", component: "SWE Agent", apply: withConfig("SWE Agent", (s, c) => addStep(s, c, "Draft patch with LangGraph software-engineering agent")), present: (c) => hasStep(c, "agent") },
  // Verify
  { kind: "gate", label: "Exit Gateway", group: "Verify", hint: "Lean 4 reference monitor", component: "Exit Gateway", apply: withConfig("Exit Gateway", (s, c) => addExitGateway(s, c)), present: (c) => !c.stages.length || !!c.stages[c.stages.length - 1].gate },
  { kind: "gate", label: "Citation Rule", group: "Verify", hint: "citation coverage >= 90%", apply: (s, c) => addRule(s, c, `It is obligatory that citation coverage >= 90% before Milestone ${lastMilestone(c)}.`) },
  { kind: "gate", label: "Latency SLA", group: "Verify", hint: "p95 latency <= 2500 ms", apply: (s, c) => addRule(s, c, `It is obligatory that p95 latency <= 2500 ms before Milestone ${lastMilestone(c)}.`) },
  { kind: "gate", label: "Cost Rule", group: "Verify", hint: "cost per query <= $0.05", apply: (s, c) => addRule(s, c, `It is obligatory that cost per query <= $0.05 before Milestone ${lastMilestone(c)}.`) },
  { kind: "counterfactual", label: "Counterfactual", group: "Verify", hint: "Fairness perturbations", component: "Counterfactual", apply: withConfig("Counterfactual", (s, c) => addStep(s, c, "Run 4x Shadow Counterfactual Perturbations across [nationality, branch_emirate, gender]")), present: (c) => hasStep(c, "counterfactual") },
  { kind: "tests", label: "Tests", group: "Verify", hint: "Regression tests from rules", component: "Tests", apply: withConfig("Tests", (s, c) => addStep(s, c, "Generate property-based regression tests for every contract rule")), present: (c) => hasStep(c, "tests") },
  { kind: "sast", label: "SAST", group: "Verify", hint: "Security scan", component: "SAST", apply: withConfig("SAST", (s, c) => addStep(s, c, "Run Semgrep SAST on the change set")), present: (c) => hasStep(c, "sast") },
  // Act
  { kind: "hitm", label: "Human Review", group: "Act", hint: "Route low-confidence to a lane", component: "Human Review", apply: withConfig("Human Review", (s, c) => addStep(s, c, `Route low-confidence answers to ${approver(c)} for approval`)), present: (c) => hasStep(c, "hitm") },
  { kind: "escalate", label: "Escalation", group: "Act", hint: "On Breach → eligible personnel", component: "Escalation", apply: withConfig("Escalation", (s, c) => addEscalation(s, c, approver(c))), present: (c) => !c.stages.length || c.stages.every((st) => !!st.escalateTo) },
  { kind: "dashboard", label: "ROI Dashboard", group: "Act", hint: "Publish to a lane", component: "Dashboard", apply: withConfig("Dashboard", (s, c) => addStep(s, c, `Publish ROI dashboard to ${c.lanes[0]?.name ?? "Case Owner"}`)), present: (c) => hasStep(c, "dashboard") },
  { kind: "canary", label: "Canary Release", group: "Act", hint: "Progressive rollout", component: "Canary", apply: withConfig("Canary", (s, c) => addStep(s, c, "Roll out 10% canary with Argo Rollouts")), present: (c) => hasStep(c, "canary") },
];
