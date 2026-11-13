import { compileSpec } from "./analyze";
import { authoringSlot, caseSections, insertAuthoring, upsertKey, type AuthoringTarget } from "./edits";
import { applyRepair, collectDraftIssues, keywordHelp } from "./repairs";
import { ancestorsAt, indentOf, indentSuggestion, lastMs, levelOf, sectionBlock, stageBlock, suggestContinuation, type SuggestContext } from "./suggest";
import { buildTree } from "./tree";
import { RULE_TEMPLATES } from "./vocab";
import { contextFrom } from "./assist";
import type { CaseAST, CompileResult } from "./types";
import type { IntentDraft } from "./intent";

export type ContinuationSize = "entry" | "block" | "related";

export interface Continuation {
  id: string;
  label: string;
  size: ContinuationSize;
  draft: IntentDraft;
}

export const continuationSizes: Record<ContinuationSize, string> = { entry: "Next entry", block: "Complete block", related: "Related blocks" };

interface Action {
  id: string;
  label: string;
  size: ContinuationSize;
  apply: (source: string, current: CaseAST) => string;
}

function slotEdit(source: string, c: CaseAST, line: number, target: AuthoringTarget, block: string[]) {
  const slot = authoringSlot(source, c, target, line);
  return slot ? insertAuthoring(source, slot, block) : source;
}

function sectionEdit(source: string, c: CaseAST, key: string, ctx: SuggestContext) {
  if (caseSections(source, c).has(key.toLowerCase())) return source;
  const block = sectionBlock(key, ctx);
  const slot = block && authoringSlot(source, c, "section");
  return block && slot ? insertAuthoring(source, slot, [key + ":", ...block]) : source;
}

export function continuationOptions(source: string, line: number, compiled: CompileResult, expandRepair = true): { level: string; options: Continuation[] } {
  const lines = source.split("\n");
  const contextFor = (at: number) => contextFrom(compiled, at, lines);
  const text = lines[line - 1] ?? "";
  const ctx = contextFor(line);
  const c = [...compiled.cases].reverse().find((item) => item.line <= line && (line <= item.endLine
    || (indentOf(text) > indentOf(lines[item.line - 1]) && lines.slice(item.endLine, line - 1).every((entry) => !entry.trim() || /^\s*#/.test(entry))))) ?? compiled.root;
  const level = levelOf(ancestorsAt(lines, line - 1, indentOf(text)));
  const options: Continuation[] = [];
  const errors = compiled.diagnostics.filter((d) => d.severity === "error");
  const tree = buildTree(compiled.normalized);
  const add = (id: string, label: string, size: ContinuationSize, candidate: string, replacesLine = false) => {
    if (candidate === source || options.some((item) => item.draft.source === candidate)) return;
    const checked = compileSpec(candidate);
    const remaining = new Set(errors.map((item) => item.message));
    const issues = checked.diagnostics.filter((d) => d.severity === "error");
    if (!checked.root || issues.length > errors.length || issues.some((item) => !remaining.has(item.message))) return;
    const updated = candidate.split("\n");
    const original = new Map<string, number>();
    for (const entry of lines) original.set(entry, (original.get(entry) ?? 0) + 1);
    const preview = updated.filter((entry) => {
      const count = original.get(entry) ?? 0;
      if (count) original.set(entry, count - 1);
      return !count && entry.trim();
    }).join("\n");
    if (!preview) return;
    options.push({ id, label, size, draft: {
      line, text: replacesLine ? preview.trimStart() : "\n" + preview, source: candidate, compiled: checked, append: !replacesLine, heading: label,
    } });
  };

  const drafts = collectDraftIssues(source, compiled, contextFor);
  const repair = drafts.find((issue) => issue.line === line)?.repairs[0];
  if (repair) {
    const size = repair.insert.includes("\n") || repair.more?.length ? "block" : "entry";
    add("repair", repair.label, size, applyRepair(source, repair), true);
    const repaired = options[0];
    if (expandRepair && repaired && !repaired.draft.compiled.diagnostics.some((d) => d.severity === "error")) {
      const next = repaired.draft;
      const wider = continuationOptions(next.source, line, next.compiled, false).options.find((item) => item.size === "related");
      if (wider) add("continue-related", "Complete this edit and set up related blocks", "related", wider.draft.source, true);
    }
  }
  if (!repair) {
    const help = keywordHelp(lines, line, ctx, () => tree)[0];
    if (help?.repair) add("keyword", help.label, "block", applyRepair(source, help.repair), true);
    const pos = lines.slice(0, line).reduce((length, item) => length + item.length + 1, -1);
    const suffix = suggestContinuation(source, pos, ctx);
    if (suffix) add("continue", "Continue this line", suffix.includes("\n") ? "block" : "entry", source.slice(0, pos) + indentSuggestion(suffix, indentOf(text)) + source.slice(pos));
  }
  if (!c) return { level, options };
  if (errors.length) {
    for (const issue of drafts.filter((item) => item.line !== line && errors.some((error) => error.line === item.line))) {
      const fix = issue.repairs[0];
      if (fix) add(`fix-${issue.line}`, `${fix.label} (line ${issue.line})`, "entry", applyRepair(source, fix));
      if (options.length >= 4) break;
    }
    return { level, options };
  }

  const present = caseSections(source, c);
  const stage = c.stages.find((item) => item.line === ctx.stage?.line) ?? c.stages.at(-1);
  const lane = ctx.approvers?.[0] ?? ctx.lanes[0];
  const rule = RULE_TEMPLATES.find((template) => template.label === "four-eyes")!;
  const scoped = { ...ctx, stage };
  const actions: Action[] = [];
  const section = (key: string, id: string, label: string) => actions.push({
    id, label, size: "block", apply: (src, target) => sectionEdit(src, target, key, ctx),
  });
  if (!present.has("lanes") && !c.lanes.length) section("Lanes", "lanes", "Define who handles the case");
  if (!present.has("case file") && !c.caseFiles.length) section("Case File", "documents", "Define the policy documents");
  if (!c.stages.length) actions.push({
    id: "first-stage", label: "Add the first workflow stage", size: "block",
    apply: (src, target) => slotEdit(src, target, line, "stage", stageBlock(ctx)),
  });
  if (!c.rules.length && c.stages.length) actions.push({
    id: "rule", label: "Add a two-reviewer release rule", size: "entry",
    apply: (src, target) => slotEdit(src, target, line, "rule", ["- " + rule.text.replace("${Milestone}", lastMs(scoped))]),
  });
  if (stage && !stage.gate && c.rules.length) actions.push({
    id: "gateway", label: "Add the release gateway", size: "block",
    apply: (src, target) => slotEdit(src, target, stage.line, "gateway", ["Exit Gateway:", ...sectionBlock("Exit Gateway", scoped)!]),
  });
  if (stage && !stage.escalateTo && lane) actions.push({
    id: "escalation", label: "Route a breach to an existing lane", size: "block",
    apply: (src, target) => slotEdit(src, target, stage.line, "escalation", [`Escalate To: ${lane}`]),
  });
  if (!c.constraints.length) actions.push({
    id: "constraint", label: "Record a compliance requirement", size: "entry",
    apply: (src, target) => upsertKey(src, target, ["Business & Product Constraints"], "Compliance", "Record the policy source and reviewer decision for every release."),
  });
  const contextOrder: Record<string, string[]> = {
    "lane-name": ["lanes", "escalation"], lane: ["lanes", "escalation"], "case-file": ["documents", "first-stage"],
    "cf-name": ["documents", "first-stage"], process: ["first-stage", "rule", "gateway", "escalation"],
    stage: ["gateway", "escalation", "rule"], steps: ["rule", "gateway", "escalation"],
    rules: ["rule", "gateway"], contract: ["rule", "gateway"], breach: ["escalation"], constraints: ["constraint"],
  };
  const order = contextOrder[level] ?? [];
  const rank = (action: Action) => order.includes(action.id) ? order.indexOf(action.id) : order.length;
  actions.sort((a, b) => rank(a) - rank(b));
  for (const action of actions) add(action.id, action.label, action.size, action.apply(source, c));

  const related = actions.filter((action) => ["lanes", "documents", "first-stage"].includes(action.id)).slice(0, 3);
  if (related.length >= 2) {
    let next = source;
    let target = c;
    for (const action of related) {
      next = action.apply(next, target);
      target = compileSpec(next).cases.find((item) => item.namespacePath === c.namespacePath) ?? target;
    }
    add("related", "Set up the missing workflow blocks", "related", next);
  }
  if (stage && !stage.gate && !stage.escalateTo && lane && c.rules.length) {
    const escalated = actions.find((action) => action.id === "escalation")?.apply(source, c) ?? source;
    const next = compileSpec(escalated).cases.find((item) => item.namespacePath === c.namespacePath);
    if (next) add("release", "Add a release gateway and breach route", "related", actions.find((action) => action.id === "gateway")!.apply(escalated, next));
  }
  return { level, options };
}
