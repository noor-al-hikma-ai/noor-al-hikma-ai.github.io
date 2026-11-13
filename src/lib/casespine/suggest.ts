// Suggestion engine shared by ghost text, completion, ▾ dropdowns and hover
// quick-picks. Pure functions over the document text, so they are fast and
// unit-testable. The goal: an unprepared user can press Tab repeatedly and
// end up with a valid, compiling case.

import { AR_KEYS, hasArabic } from "./arabic";
import { COMPONENTS, componentSpec, fieldSpec, formatValue, inlineDefaults, normName } from "./configSchema";
import { normKey, parseList } from "./tree";
import { ACTUATOR_FIELDS, CONSTRAINT_FACETS, KEYWORDS, PII_ENTITIES, RULE_TEMPLATES, STEP_TEMPLATES, VALUE_SUGGESTIONS } from "./vocab";

export interface SuggestContext {
  lanes: string[];
  milestones: string[];
  roles?: string[];
  clearances?: string[];
  caseFiles?: string[];
  approvers?: string[];
  stages?: { idx: number; milestone: string; line: number }[];
  stage?: { idx: number; milestone: string; line: number };
}

const AR_TO_EN = new Map(Object.entries(AR_KEYS));
export const translateKey = (k: string) => AR_TO_EN.get(k.trim()) ?? k;

const KEY_RE = /^(\s*)(-\s+)?([^:"'[{#\s][^:]*?):(?:\s(.*))?$/;

export const keywordId = (key: string) => normKey(translateKey(key));

export function indentOf(line: string) {
  return line.length - line.trimStart().length;
}

/** Normalised keys of the enclosing blocks, innermost first. */
export function ancestorsAt(lines: string[], lineIdx: number, indent: number): string[] {
  const out: string[] = [];
  let cur = indent;
  for (let n = lineIdx - 1; n >= 0 && cur > 0; n--) {
    const text = lines[n];
    if (!text.trim() || /^\s*#/.test(text)) continue;
    const ind = indentOf(text);
    if (ind < cur) {
      const m = KEY_RE.exec(text);
      out.push(m ? keywordId(m[3]) : normKey(text.trim().replace(/^-\s*/, "")));
      cur = ind;
    }
  }
  return out;
}

/** Keys already present among the siblings at `indent` around `lineIdx`. */
export function siblingKeys(lines: string[], lineIdx: number, indent: number): Set<string> {
  const keys = new Set<string>();
  const scan = (from: number, step: number) => {
    for (let n = from; n >= 0 && n < lines.length; n += step) {
      const t = lines[n];
      if (!t.trim() || /^\s*#/.test(t)) continue;
      const ind = indentOf(t);
      if (ind < indent) break;
      if (ind === indent) {
        const m = KEY_RE.exec(t);
        if (m) keys.add(keywordId(m[3]));
      }
    }
  };
  scan(lineIdx - 1, -1);
  scan(lineIdx + 1, 1);
  return keys;
}

export type Level =
  | "top" | "lane" | "lane-name" | "case-file" | "cf-name" | "contract" | "rules" | "guards" | "process" | "stage"
  | "steps" | "breach" | "gateway" | "deployment" | "config" | "config-fields"
  | "constraints" | "actuators" | "subcases" | "proposals" | "other";

export function levelOf(anc: string[]): Level {
  const p = anc[0] ?? "";
  const gp = anc[1] ?? "";
  if (!anc.length) return "top";
  if (p.startsWith("rules")) return "rules";
  if (p === "steps") return "steps";
  if (p === "binding lean contract") return "contract";
  if (p === "cost & traffic guards") return "guards";
  if (p.startsWith("exit gateway")) return "gateway";
  if (p === "on breach") return "breach";
  if (p === "deployment") return "deployment";
  if (p === "business & product constraints") return "constraints";
  if (p === "actuators") return "actuators";
  if (p === "ai smart suggestions") return "proposals";
  if (p === "subcases") return "subcases";
  if (p === "config") return "config";
  if (gp === "config") return "config-fields";
  if (p === "process flow") return "process";
  if (/^stage \d+/.test(p)) return "stage";
  if (gp === "lanes") return "lane";
  if (gp === "case file") return "case-file";
  if (p === "lanes") return "lane-name";
  if (p === "case file") return "cf-name";
  if (/^subcase\b/.test(p)) return "top";
  return "other";
}

const DEFAULTS: Record<string, string> = {
  case: "My Business Case",
  version: '"5.0"',
  "solution archetype": "KNOWLEDGE_SYNTHESIS_AND_RAG",
  "business deliverable": "Verified_Answer",
  standards: "[ISO-IEC-19510-BPMN2, OMG-CMMN-1.1, OMG-SBVR-1.5]",
  "population segment": "general_enterprise",
  "sso provider": "Microsoft Entra ID",
  roles: "[HITM_APPROVER]",
  clearance: "[INTERNAL]",
  user: '"Full Name" <name@bank.example>',
  source: 'pdf("documents.pdf")',
  "namespace isolation": 'strict ("MyCase")',
  converters: "[pdfplumber_layout, booktabs_table_extractor]",
  curation: "redact [UAE_IBAN, EMIRATES_ID] and require coherence >= 0.85",
  "import theorem packs": "[core.rag.grounding, isolation.non_interference]",
  "budget ceiling": "4000 tokens or $0.10",
  "pre-flight gate": "Loudly block stupid queries (lexical entropy < 0.65) and off-topic queries at 0 tokens.",
  "rate limit": "30 requests/minute per Lane",
  "banned topics": "[investment advice, cryptocurrency speculation]",
  "allowed topics": "[policies, limits, fees]",
  "model ladder": "[large, medium, small] when budget remaining < 40%",
  "adaptive optimizer": "Solve over (model tier, thinking effort, context compression, token appetite) to stay within budget and quality >= 0.78.",
  "semantic cache": "reuse verified answers when similarity >= 0.92",
  downscaling: "scale to zero after 15 minutes idle",
  "value per outcome": "$3.50 per resolved inquiry",
  "target roi": "4.0x",
  if: "all Binding Lean Contract rules hold",
  else: 'Halt loudly and Compensate via "Quarantine Output"',
  cloud: "azure://uaenorth",
  residency: "UAE",
  identity: "[Microsoft Entra ID, UAE PASS]",
  "data governance": "[Collibra, Unity Catalog]",
  audit: "Immutable SHA-256 W3C PROV-O Ledger",
  engine: "[langgraph://]",
  "rollout strategy": "Start with a limited pilot and review outcomes before expanding.",
  "degradation fallback": "Pause automatic release and route the case to manual review.",
};

export const lastMs = (ctx: SuggestContext) => ctx.stage?.milestone ?? ctx.milestones.at(-1) ?? "CaseResolved";
const approver = (ctx: SuggestContext) => ctx.approvers?.[0] ?? ctx.lanes[0] ?? "Case Owner";

export const laneBlock = (name: string) => [`${name}:`, "  SSO Provider: Microsoft Entra ID", "  Roles: [HITM_APPROVER]"];

export function sectionBlock(key: string, ctx: SuggestContext): string[] | null {
  switch (keywordId(key)) {
    case "lanes":
      return laneBlock("Case Owner").map((line) => "  " + line);
    case "case file":
      return ["  Documents:", '    Source: pdf("documents.pdf")', "    Curation: redact [UAE_IBAN, EMIRATES_ID] and require coherence >= 0.85"];
    case "binding lean contract":
      return ["  Rules (SBVR & FEEL Constrained English):", `    - It is obligatory that citation coverage >= 90% before Milestone ${lastMs(ctx)}.`];
    case "rules":
      return [`  - It is obligatory that citation coverage >= 90% before Milestone ${lastMs(ctx)}.`];
    case "cost & traffic guards":
      return ["  Budget Ceiling: 4000 tokens or $0.10", "  Rate Limit: 30 requests/minute per Lane", "  Banned Topics: [investment advice]"];
    case "process flow":
      return stageBlock({ ...ctx, stages: [] }).map((line) => "  " + line);
    case "config":
      return ["  Retriever: { Mode: hybrid, Top K: 3 }", "  Synthesizer: { Model: auto, Max Sentences: 3 }", "  Exit Gateway: { Fail Mode: fail-closed }"];
    case "deployment":
      return ["  Cloud: azure://uaenorth", "  Residency: UAE", "  Identity: [Microsoft Entra ID, UAE PASS]"];
    case "steps":
      return ["  - " + STEP_TEMPLATES[0]];
    case "on breach":
      return [`  Escalate To: ${approver(ctx)}`];
    case "exit gateway":
      return ["  If: all Binding Lean Contract rules hold", `  Then: Emit Verified Answer and reach Milestone ${lastMs(ctx)}`, '  Else: Halt loudly and Compensate via "Quarantine Output"'];
    case "business & product constraints":
      return [`  Compliance: ${CONSTRAINT_FACETS[0].example}`];
    case "actuators":
      return [`  Orchestrator: ${ACTUATOR_FIELDS[0].example}`];
    case "subcases":
      return subcaseBlock().map((line) => "  " + line);
    case "ai smart suggestions":
      return ["  " + proposalText(ctx)];
    default:
      return null;
  }
}

export function canSeedBlock(lines: string[], lineIdx: number, indent: number): boolean {
  for (let i = lineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const nextIndent = indentOf(line);
    return nextIndent < indent || (nextIndent === indent && !/^\s*-\s/.test(line));
  }
  return true;
}

export function stageBlock(ctx: SuggestContext, previous: string | null | undefined = ctx.stages?.at(-1)?.milestone): string[] {
  const n = Math.max(0, ...(ctx.stages ?? []).map((stage) => stage.idx)) + 1;
  const existing = new Set(ctx.stages?.map((stage) => stage.milestone));
  const defaultMilestone = n === 1 ? "EvidenceReady" : n === 2 ? "ReviewComplete" : `Stage${n}Done`;
  let milestone = defaultMilestone;
  for (let i = 2; existing.has(milestone); i++) milestone = `${defaultMilestone}${i}`;
  return [
    `- Stage ${n} (${n === 1 ? "Gather evidence" : "Review"}):`,
    `    When: ${previous ? `Milestone ${previous} is achieved` : "Request received"}`,
    "    Steps:",
    n === 1 ? "      - Gather the applicable policy and supporting evidence" : "      - Check the evidence against the binding contract before release",
    `    Reach Milestone: ${milestone}`,
  ];
}

export const subcaseBlock = () => ["- Subcase: Additional Review", "  Budget Ceiling: 1000 tokens or $0.05"];
export const proposalText = (ctx: SuggestContext) =>
  `- Suggest policy_review: "Identify policy changes for the next review" (Moderated by: ${approver(ctx)})`;

/** Items for list-valued fields, including identifiers declared in the case. */
export function listOptions(key: string, ctx: SuggestContext): string[] {
  const k = keywordId(key);
  if (k === "roles") return [...new Set(["HITM_APPROVER", "CODE_OWNER", "CHIEF_RISK_ARCHITECT", "SHARIA_BOARD_AUDITOR", "DISPATCH_PLANNER", ...ctx.roles ?? []])];
  if (k === "clearance") return [...new Set(["INTERNAL", "RETAIL_WIRE_INQUIRY", "GROUP_ROOT", ...ctx.clearances ?? []])];
  if (k === "model ladder") return ["large", "medium", "small"];
  if (k === "standards") return parseList(DEFAULTS[k]).concat("OMG-DMN-FEEL", "W3C-PROV-O");
  if (["identity", "data governance", "import theorem packs", "converters", "engine"].includes(k))
    return [...new Set((VALUE_SUGGESTIONS[k] ?? []).flatMap(parseList))];
  return [];
}

/** Candidate values for `key` in context — used by ghost text, ▾ and hover. */
export function valueOptions(key: string, anc: string[], ctx: SuggestContext): string[] {
  const k = keywordId(key);
  const lvl = levelOf(anc);
  if (lvl === "constraints") return CONSTRAINT_FACETS.filter((f) => normKey(f.key) === k).map((f) => f.example);
  if (lvl === "actuators") return ACTUATOR_FIELDS.filter((f) => normKey(f.key) === k).map((f) => f.example);
  if (lvl === "config-fields") {
    const fs = fieldSpec(anc[0], key);
    if (fs) {
      if (fs.type === "lane") return ctx.lanes;
      if (fs.type === "toggle") return fs.default ? ["true", "false"] : ["false", "true"];
      if (fs.options && fs.type === "select") return [String(fs.default), ...fs.options.filter((o) => o !== fs.default)];
      if (fs.type === "multi") return [formatValue(fs.default), formatValue(fs.options ?? [])];
      return [formatValue(fs.default)];
    }
  }
  if (lvl === "config") {
    const spec = componentSpec(key);
    if (spec) return [inlineDefaults(spec)];
  }
  if (k === "escalate to") return [...new Set([approver(ctx), ...ctx.lanes, "Compliance Review Queue"])];
  if (k === "reach milestone") return [...new Set([...ctx.milestones, "EvidenceReady", "ReviewComplete", "CaseResolved"])];
  if (k === "when") {
    const milestones = ctx.stage ? ctx.stages?.filter((stage) => stage.line < ctx.stage!.line).map((stage) => stage.milestone) ?? [] : ctx.milestones;
    return [...new Set(milestones)].reverse().map((m) => `Milestone ${m} is achieved`).concat("Request received", ...(ctx.caseFiles?.length ? ctx.caseFiles : ["Documents"]).map((name) => `Case File "${name}" is loaded`));
  }
  if (k === "then") return [`Emit Verified Answer and reach Milestone ${lastMs(ctx)}`];
  if (k === "approver" || k === "audience") return ctx.lanes;
  const items = listOptions(key, ctx);
  if (items.length && k !== "model ladder") return items.map((item) => `[${item}]`);
  const fromVocab = VALUE_SUGGESTIONS[k] ?? [];
  const def = DEFAULTS[k];
  return [...new Set([...(def ? [def] : []), ...fromVocab])];
}

export function keysFor(lvl: Level, anc: string[]): string[] {
  if (lvl === "config") return COMPONENTS.map((c) => c.name);
  if (lvl === "config-fields") return componentSpec(anc[0])?.fields.map((f) => f.key) ?? [];
  return KEYWORDS.filter((entry) => entry.level === lvl || (lvl === "stage" && entry.level === "breach")).map((entry) => entry.key);
}

export function keyLine(key: string, lvl: Level, anc: string[], ctx: SuggestContext): string {
  const block = sectionBlock(key, ctx);
  if (block && lvl !== "config") return ":\n" + block.join("\n");
  if (lvl === "config") {
    const spec = componentSpec(key);
    return ": " + (spec ? inlineDefaults(spec) : "{ }");
  }
  if (lvl === "config-fields") {
    const fs = fieldSpec(anc[0], key);
    return ": " + (fs ? (fs.type === "lane" ? ctx.lanes[0] ?? "" : formatValue(fs.default)) : "");
  }
  const opts = valueOptions(key, anc, ctx);
  return ": " + (opts[0] ?? "");
}

function listItem(items: string[], dash: boolean) {
  return items.map((line, i) => i === 0 && dash ? line.replace(/^- /, "") : line).join("\n");
}

/**
 * Most likely continuation at the cursor (end of line). Multi-line results use
 * "\n" followed by indentation relative to the current line's indentation.
 */
export function suggestContinuation(doc: string, pos: number, ctx: SuggestContext): string | null {
  const before = doc.slice(0, pos);
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEndIdx = doc.indexOf("\n", pos);
  const after = doc.slice(pos, lineEndIdx < 0 ? doc.length : lineEndIdx);
  if (after.trim()) return null; // only at end of line
  const prefix = before.slice(lineStart);
  const lines = doc.split("\n");
  const lineIdx = before.split("\n").length - 1;
  const indent = indentOf(prefix);
  const anc = ancestorsAt(lines, lineIdx, indent);
  const lvl = levelOf(anc);
  const ar = hasArabic(prefix);

  // A block header behaves the same before and after trailing spaces.
  const bare = KEY_RE.exec(prefix);
  if (bare && !bare[4]?.trim() && !["steps", "rules", "proposals"].includes(lvl)) {
    const block = sectionBlock(bare[3], ctx);
    // Do not prepend defaults to a block that already has children.
    if (block) {
      if (canSeedBlock(lines, lineIdx, indent)) {
        return "\n" + block.join("\n");
      }
      return null;
    }
    const opts = valueOptions(bare[3], anc, ctx);
    return opts[0] ? (prefix.endsWith(":") ? " " : "") + opts[0] : null;
  }

  // A. value after "Key: "
  const kv = /^(\s*)(-\s+)?([^:"'[{#\s][^:]*?):\s+(.*)$/.exec(prefix);
  if (kv && lvl !== "rules" && lvl !== "steps") {
    const typed = kv[4];
    const opts = valueOptions(kv[3], anc, ctx);
    const hit = opts.find((o) => o.toLowerCase().startsWith(typed.toLowerCase()) && o.length > typed.length);
    return hit ? hit.slice(typed.length) : null;
  }
  const item = /^(\s*)(-\s+)?(.*)$/.exec(prefix)!;
  const dash = !!item[2];
  const typed = item[3];

  // B. partial key / item text
  if (typed.trim()) {
    const low = typed.toLowerCase();
    if (lvl === "rules") {
      const t = RULE_TEMPLATES.map((r) => r.text.replace("${Milestone}", lastMs(ctx))).find((x) => x.toLowerCase().startsWith(low) && x.length > typed.length);
      return t ? t.slice(typed.length) : null;
    }
    if (lvl === "steps") {
      const t = STEP_TEMPLATES.find((x) => x.toLowerCase().startsWith(low) && x.length > typed.length);
      return t ? t.slice(typed.length) : null;
    }
    if (lvl === "process" || lvl === "subcases" || lvl === "proposals") {
      const block = lvl === "process" ? stageBlock(ctx) : lvl === "subcases" ? subcaseBlock() : [proposalText(ctx)];
      const full = listItem(block, true);
      // An inline continuation cannot insert a missing list dash before existing text.
      return dash && full.toLowerCase().startsWith(low) ? full.slice(typed.length) || null : null;
    }
    const present = siblingKeys(lines, lineIdx, indent);
    let candidates = keysFor(lvl, anc).filter((k) => !present.has(normKey(k)) && !present.has(normName(k)));
    if (ar) candidates = KEYWORDS.filter((k) => k.ar && candidates.includes(k.key)).map((k) => k.ar!);
    const hit = candidates.find((k) => k.toLowerCase().startsWith(low) && k.length >= typed.length);
    if (!hit) return null;
    return hit.slice(typed.length) + keyLine(ar ? translateKey(hit) : hit, lvl, anc, ctx);
  }

  // C. empty line → next most likely line or block
  const present = siblingKeys(lines, lineIdx, indent);
  const prefixDash = dash ? "" : "- ";
  switch (lvl) {
    case "top": {
      if (!/^\s*(Case|الحالة)\s*:/m.test(doc)) return "Case: My Business Case";
      if (indent !== 0) return null;
      const order = ["Lanes", "Case File", "Process Flow", "Binding Lean Contract", "Business & Product Constraints", "Cost & Traffic Guards", "Config", "Deployment"];
      const all = new Set(lines.map((l) => KEY_RE.exec(l)).filter((m) => m && m[1] === "").map((m) => keywordId(m![3])));
      const next = order.find((k) => !all.has(normKey(k)));
      return next ? next + ":\n" + sectionBlock(next, ctx)!.join("\n") : null;
    }
    case "rules": {
      const used = lines.join("\n").toLowerCase();
      const t = RULE_TEMPLATES.map((r) => r.text.replace("${Milestone}", lastMs(ctx))).find((x) => !used.includes(x.toLowerCase().slice(22, 60)));
      return t ? prefixDash + t : null;
    }
    case "steps": {
      const used = lines.join("\n").toLowerCase();
      const t = STEP_TEMPLATES.find((x) => !used.includes(x.toLowerCase().slice(0, 30)));
      return t ? prefixDash + t : null;
    }
    case "process":
      return listItem(stageBlock(ctx), dash);
    case "subcases":
      return present.has("subcase") ? null : listItem(subcaseBlock(), dash);
    case "proposals":
      return present.has("suggest policy_review") ? null : listItem([proposalText(ctx)], dash);
    case "lane-name":
      return ["Case Owner", "Head of Compliance", "Compliance Reviewer"].filter((name) => !present.has(keywordId(name)))
        .map((name) => laneBlock(name).join("\n"))[0] ?? null;
    case "cf-name":
      return 'Additional Documents:\n  Source: pdf("more.pdf")';
    case "config": {
      const next = COMPONENTS.find((c) => !present.has(normName(c.name)) && !present.has(normKey(c.name)));
      return next ? `${next.name}: ${inlineDefaults(next)}` : null;
    }
    default: {
      const keys = keysFor(lvl, anc).filter((k) => !present.has(normKey(k)) && !present.has(normName(k)));
      if (!keys.length) return null;
      return keys[0] + keyLine(keys[0], lvl, anc, ctx);
    }
  }
}

/** Indent continuation lines of a suggestion to the current line's indentation. */
export function indentSuggestion(text: string, baseIndent: number): string {
  return text.replace(/\n/g, "\n" + " ".repeat(baseIndent));
}

export { PII_ENTITIES };
