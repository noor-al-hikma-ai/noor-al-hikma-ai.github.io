// Palette actions for the visual canvas. Each action is a pure text edit on the
// CaseSpine source, so the visual and textual views can never disagree.

import { buildTree, type SpecNode } from "./tree";
import { normalizeArabic, hasArabic } from "./arabic";
import type { CaseAST } from "./types";
import type { NodeKind } from "./graph";

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

export function addGuard(src: string, c: CaseAST, line: string): string {
  const tree = treeOf(src);
  if (c.guards.sectionLine) {
    const sec = findNode(tree, c.guards.sectionLine);
    if (sec) return insertAfter(src, sec.endLine, [" ".repeat(childIndent(sec)) + line]);
  }
  const anchor = c.processFlowLine ?? c.endLine;
  const at = findNode(tree, anchor);
  const ind = at ? at.indent : 0;
  return insertAfter(src, anchor - 1, [
    " ".repeat(ind) + "Cost & Traffic Guards:",
    " ".repeat(ind + 2) + line,
    "",
  ]);
}

export function addStep(src: string, c: CaseAST, text: string, stageIdx?: number): string {
  const st = stageIdx !== undefined ? c.stages.find((s) => s.idx === stageIdx) : c.stages[c.stages.length - 1];
  if (!st) return src;
  const tree = treeOf(src);
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
  const anchor = c.guards.sectionLine ?? c.processFlowLine ?? c.endLine;
  const at = findNode(tree, anchor);
  const ind = at ? at.indent : 0;
  return insertAfter(src, anchor - 1, [
    " ".repeat(ind) + "Binding Lean Contract:",
    " ".repeat(ind + 2) + "Rules (SBVR & FEEL Constrained English):",
    " ".repeat(ind + 4) + "- " + ruleText,
    "",
  ]);
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

export function removeRange(src: string, range: [number, number]): string {
  const lines = src.split("\n");
  lines.splice(range[0] - 1, range[1] - range[0] + 1);
  return lines.join("\n");
}

export interface PaletteItem {
  kind: NodeKind;
  label: string;
  group: string;
  hint: string;
  apply: (src: string, c: CaseAST) => string;
  /** Hidden when the case already has this capability. */
  present?: (c: CaseAST) => boolean;
}

const lastMilestone = (c: CaseAST) => c.stages[c.stages.length - 1]?.milestone ?? "StageExit";
const approver = (c: CaseAST) =>
  c.lanes.find((l) => l.roles.some((r) => /HITM|APPROVER/i.test(r)))?.name ?? c.lanes[0]?.name ?? "Case Owner";

export const PALETTE: PaletteItem[] = [
  { kind: "rate", label: "Rate Limiter", group: "Govern ROI", hint: "Rate Limit: 30 requests/minute per Lane", apply: (s, c) => addGuard(s, c, "Rate Limit: 30 requests/minute per Lane"), present: (c) => !!c.guards.rateLimit },
  { kind: "topics", label: "Topic Gate", group: "Govern ROI", hint: "Banned Topics: [...]", apply: (s, c) => addGuard(s, c, "Banned Topics: [investment advice, cryptocurrency speculation]"), present: (c) => c.guards.bannedTopics.length > 0 },
  { kind: "ladder", label: "Model Ladder", group: "Govern ROI", hint: "Downsize model as budget shrinks", apply: (s, c) => addGuard(s, c, "Model Ladder: [large, medium, small] when budget remaining < 40%"), present: (c) => !!c.guards.modelLadder },
  { kind: "cache", label: "Semantic Cache", group: "Govern ROI", hint: "Reuse verified answers at 0 tokens", apply: (s, c) => addGuard(s, c, "Semantic Cache: reuse verified answers when similarity >= 0.92"), present: (c) => !!c.guards.semanticCache },
  { kind: "downscale", label: "Downscaler", group: "Govern ROI", hint: "Scale to zero when idle", apply: (s, c) => addGuard(s, c, "Downscaling: scale to zero after 15 minutes idle"), present: (c) => !!c.guards.downscaling },
  { kind: "kag", label: "Knowledge Graph", group: "Retrieve", hint: "Multi-hop triples (OpenSPG)", apply: (s, c) => addStep(s, c, "Extract OpenSPG knowledge-graph triples for multi-hop questions") },
  { kind: "sql", label: "SQL Query", group: "Retrieve", hint: "Parametric SQL on the lakehouse", apply: (s, c) => addStep(s, c, "Query customer limits with parametric SQL from Databricks SQL") },
  { kind: "task", label: "Python Tool", group: "Reason", hint: "Wrap an existing script", apply: (s, c) => addStep(s, c, "Run existing script fx_normalise.py to convert amounts to AED") },
  { kind: "counterfactual", label: "Counterfactual", group: "Verify", hint: "Fairness perturbations", apply: (s, c) => addStep(s, c, "Run 4x Shadow Counterfactual Perturbations across [nationality, branch_emirate, gender]") },
  { kind: "tests", label: "Tests", group: "Verify", hint: "Regression tests from rules", apply: (s, c) => addStep(s, c, "Generate property-based regression tests for every contract rule") },
  { kind: "gate", label: "Citation Rule", group: "Verify", hint: "citation coverage >= 90%", apply: (s, c) => addRule(s, c, `It is obligatory that citation coverage >= 90% before Milestone ${lastMilestone(c)}.`) },
  { kind: "gate", label: "Latency SLA", group: "Verify", hint: "p95 latency <= 2500 ms", apply: (s, c) => addRule(s, c, `It is obligatory that p95 latency <= 2500 ms before Milestone ${lastMilestone(c)}.`) },
  { kind: "gate", label: "Cost Rule", group: "Verify", hint: "cost per query <= $0.05", apply: (s, c) => addRule(s, c, `It is obligatory that cost per query <= $0.05 before Milestone ${lastMilestone(c)}.`) },
  { kind: "hitm", label: "Human Review", group: "Act", hint: "Route low-confidence to a lane", apply: (s, c) => addStep(s, c, `Route low-confidence answers to ${approver(c)} for approval`) },
  { kind: "escalate", label: "Escalation", group: "Act", hint: "On Breach → eligible personnel", apply: (s, c) => addEscalation(s, c, approver(c)), present: (c) => c.stages.every((st) => !!st.escalateTo) },
  { kind: "dashboard", label: "ROI Dashboard", group: "Act", hint: "Publish to a lane", apply: (s, c) => addStep(s, c, `Publish ROI dashboard to ${c.lanes[0]?.name ?? "Case Owner"}`) },
];
