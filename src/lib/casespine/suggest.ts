// Suggestion engine shared by ghost text, completion, ▾ dropdowns and hover
// quick-picks. Pure functions over the document text, so they are fast and
// unit-testable. The goal: an unprepared user can press Tab repeatedly and
// end up with a valid, compiling case.

import { AR_KEYS, hasArabic } from "./arabic";
import { COMPONENTS, componentSpec, fieldSpec, formatValue, inlineDefaults, normName } from "./configSchema";
import { normKey, parseList } from "./tree";
import type { CaseAST } from "./types";
import { ACTUATOR_FIELDS, CONSTRAINT_FACETS, KEYWORDS, PII_ENTITIES, RULE_TEMPLATES, STEP_TEMPLATES, VALUE_SUGGESTIONS } from "./vocab";

export interface SuggestContext {
  lanes: string[];
  milestones: string[];
  roles?: string[];
  clearances?: string[];
  caseFiles?: string[];
  approvers?: string[];
  stages?: StageContext[];
  stage?: StageContext;
  subcases?: string[];
  rules?: string[];
  constraints?: string[];
  subcaseBudget?: { tokens: number; usd: number };
}

interface StageContext {
  idx: number;
  milestone: string;
  line: number;
  steps?: { text: string }[];
}

export function contextForCase(c: CaseAST | null, stage?: StageContext): SuggestContext {
  const stages = c?.stages ?? [];
  return {
    roles: c?.lanes.flatMap((lane) => lane.roles),
    clearances: c?.lanes.flatMap((lane) => lane.clearance),
    caseFiles: c?.caseFiles.map((file) => file.name),
    lanes: c?.lanes.map((lane) => lane.name) ?? [],
    approvers: c?.lanes.filter((lane) => lane.roles.some((role) => /HITM|APPROVER/i.test(role))).map((lane) => lane.name),
    milestones: [...new Set(stages.map((item) => item.milestone))],
    stages, stage,
    subcases: c?.subcases.map((item) => item.name),
    rules: c?.rules.map((rule) => rule.raw),
    constraints: c?.constraints.map((item) => item.facet),
    subcaseBudget: c ? {
      tokens: Math.max(0, c.guards.budgetTokens - c.subcases.reduce((used, subcase) => used + subcase.guards.budgetTokens, 0)),
      usd: Math.max(0, c.guards.budgetUsd - c.subcases.reduce((used, subcase) => used + subcase.guards.budgetUsd, 0)),
    } : undefined,
  };
}

const AR_TO_EN = new Map(Object.entries(AR_KEYS));
export const translateKey = (k: string) => AR_TO_EN.get(k.trim()) ?? k;

const KEY_RE = /^(\s*)(-\s+)?([^:"'[{#\s][^:]*?):(?:\s(.*))?$/;

export const keywordId = (key: string) => normKey(translateKey(key));

const COLLECTION_BLOCKS = new Set([
  "lanes", "case file", "binding lean contract", "rules", "process flow", "steps",
  "subcases", "ai smart suggestions", "business & product constraints",
]);

export const isRepeatableBlock = (key: string) => COLLECTION_BLOCKS.has(keywordId(key));

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

/** Sibling field locations on either side of the cursor, nearest first. */
export function siblingKeyLines(lines: string[], lineIdx: number, indent: number): Map<string, number> {
  const keys = new Map<string, number>();
  const scan = (from: number, step: number) => {
    for (let n = from; n >= 0 && n < lines.length; n += step) {
      const t = lines[n];
      if (!t.trim() || /^\s*#/.test(t)) continue;
      const ind = indentOf(t);
      if (ind < indent) break;
      if (ind === indent) {
        const m = KEY_RE.exec(t);
        if (m && !keys.has(keywordId(m[3]))) keys.set(keywordId(m[3]), n);
      }
    }
  };
  scan(lineIdx - 1, -1);
  scan(lineIdx + 1, 1);
  return keys;
}

export function siblingKeys(lines: string[], lineIdx: number, indent: number): Set<string> {
  return new Set(siblingKeyLines(lines, lineIdx, indent).keys());
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

function availableNames(choices: string[], used: string[]) {
  const existing = new Set(used.map((name) => name.toLowerCase()));
  const available = choices.filter((name) => !existing.has(name.toLowerCase()));
  if (available.length) return available;
  const base = choices.at(-1)!;
  let suffix = 2;
  while (existing.has(`${base} ${suffix}`.toLowerCase())) suffix++;
  return [`${base} ${suffix}`];
}

export const laneNames = (ctx: SuggestContext) => availableNames(["Case Owner", "Head of Compliance", "Compliance Reviewer"], ctx.lanes);
export const documentNames = (ctx: SuggestContext) => availableNames(["Documents", "Policy Documents", "Evidence File"], ctx.caseFiles ?? []);

function starterRule(ctx: SuggestContext) {
  const milestone = lastMs(ctx);
  const rules = [
    `It is obligatory that citation coverage >= 90% before Milestone ${milestone}.`,
    ...RULE_TEMPLATES.map((rule) => rule.text.replace("${Milestone}", milestone)),
  ];
  return rules.find((rule) => !ctx.rules?.includes(rule)) ?? rules[0];
}

export function sectionBlock(key: string, ctx: SuggestContext, line?: number): string[] | null {
  switch (keywordId(key)) {
    case "lanes":
      return laneBlock(laneNames(ctx)[0]).map((line) => "  " + line);
    case "case file":
      return [`  ${documentNames(ctx)[0]}:`, '    Source: pdf("documents.pdf")', "    Curation: redact [UAE_IBAN, EMIRATES_ID] and require coherence >= 0.85"];
    case "binding lean contract":
      return ["  Rules (SBVR & FEEL Constrained English):", `    - ${starterRule(ctx)}`];
    case "rules":
      return [`  - ${starterRule(ctx)}`];
    case "cost & traffic guards":
      return ["  Budget Ceiling: 4000 tokens or $0.10", "  Rate Limit: 30 requests/minute per Lane", "  Banned Topics: [investment advice]"];
    case "process flow":
      return stageBlock(ctx, line === undefined ? undefined : milestoneBefore(ctx, line)).map((line) => "  " + line);
    case "config":
      return ["  Retriever: { Mode: hybrid, Top K: 3 }", "  Synthesizer: { Model: auto, Max Sentences: 3 }", "  Exit Gateway: { Fail Mode: fail-closed }"];
    case "deployment":
      return ["  Cloud: azure://uaenorth", "  Residency: UAE", "  Identity: [Microsoft Entra ID, UAE PASS]"];
    case "steps":
      return ["  - " + (STEP_TEMPLATES.find((step) => !ctx.stage?.steps?.some((used) => used.text === step)) ?? "Review the case evidence")];
    case "on breach":
      return [`  Escalate To: ${approver(ctx)}`];
    case "exit gateway":
      return ["  If: all Binding Lean Contract rules hold", `  Then: Emit Verified Answer and reach Milestone ${lastMs(ctx)}`, '  Else: Halt loudly and Compensate via "Quarantine Output"'];
    case "business & product constraints": {
      const facet = CONSTRAINT_FACETS.find(({ key }) => !ctx.constraints?.some((used) => keywordId(used) === keywordId(key))) ?? CONSTRAINT_FACETS[0];
      return [`  ${facet.key}: ${facet.example}`];
    }
    case "actuators":
      return [`  Orchestrator: ${ACTUATOR_FIELDS[0].example}`];
    case "subcases":
      return ctx.subcaseBudget?.tokens === 0 ? null : subcaseBlock(ctx).map((line) => "  " + line);
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

export function hasFollowingChildren(lines: string[], lineIdx: number, indent: number) {
  const following = lines.slice(lineIdx + 1).find((line) => line.trim() && !/^\s*#/.test(line));
  return !!following && indentOf(following) > indent;
}

export const milestoneBefore = (ctx: SuggestContext, line: number) => ctx.stages?.filter((stage) => stage.line < line).at(-1)?.milestone ?? null;

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

export function subcaseBlock(ctx: SuggestContext): string[] {
  const { tokens, usd } = ctx.subcaseBudget ?? { tokens: 1000, usd: 0.05 };
  const [name] = availableNames(["Additional Review"], ctx.subcases ?? []);
  return [`- Subcase: ${name}`, `  Budget Ceiling: ${Math.min(1000, tokens)} tokens or $${Math.min(0.05, usd).toFixed(2)}`];
}
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

const KEY_ALIASES: Record<string, string[]> = {
  lanes: ["lane"],
  "case file": ["case files", "documents"],
  "process flow": ["workflow", "work flow", "process", "stages"],
  "binding lean contract": ["lean contract", "contract"],
  "business & product constraints": ["constraints", "business constraints", "product constraints", "business and product constraints"],
  "cost & traffic guards": ["guards", "cost and traffic guards"],
  config: ["configuration", "settings"],
  rules: ["rule"],
  steps: ["step"],
  roles: ["role"],
  "sso provider": ["sso"],
  "reach milestone": ["milestone"],
  "escalate to": ["escalation"],
};

const keyWords = (key: string) => key.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

function oneEditAway(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length !== b.length) return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
  return a.slice(i + 1) === b.slice(i + 1)
    || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
}

export interface KeywordMatch {
  key: string;
  label: string;
  kind: "exact" | "prefix" | "correction";
  question?: boolean;
}

/** Match keywords at a word boundary. A typo must be close to the whole keyword. */
export function matchKeywords(level: Level, ancestors: string[], text: string): KeywordMatch[] {
  const original = keyWords(text);
  const query = original.replace(/^(?:what (?:is|are)|do (?:i|we) need|where (?:do (?:i|we)|to) (?:add|define|put))\s+(?:the\s+)?/, "")
    .replace(/\s+(?:or what|goes here)\s*\??$/, "").replace(/\?+$/, "").trim();
  if (!query || query.length > 100) return [];
  const question = query !== original;
  const arabic = hasArabic(query);
  const matches = keysFor(level, ancestors).flatMap((key) => {
    const translation = KEYWORDS.find((word) => word.key === key && (word.level === level || level === "stage" && word.level === "breach"))?.ar;
    const label = arabic && translation ? translation : key;
    const phrase = keyWords(label);
    const short = keyWords(label.replace(/\s+\([^)]*\)$/, ""));
    const aliases = KEY_ALIASES[normKey(key)] ?? [];
    const exact = query === phrase || query === short;
    const prefix = phrase.startsWith(query);
    const alias = aliases.includes(query);
    const typo = query.length >= 4 && oneEditAway(query, short);
    if (exact || prefix || alias || typo) {
      const kind: KeywordMatch["kind"] = exact ? "exact" : alias || !prefix ? "correction" : "prefix";
      return [{ key, label, kind, question, rank: exact ? 0 : alias ? 1 : prefix ? 2 : 3 }];
    }
    return [];
  });
  return matches.sort((a, b) => a.rank - b.rank);
}

export function keywordBeforeColon(text: string) {
  const content = text.trimStart().replace(/^-\s+/, "");
  const colon = content.indexOf(":");
  return { query: (colon < 0 ? content : content.slice(0, colon)).trim(), value: colon < 0 ? undefined : content.slice(colon + 1).trim() };
}

export function keyLine(key: string, lvl: Level, anc: string[], ctx: SuggestContext, line?: number): string {
  const block = sectionBlock(key, ctx, line);
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
  const line = lineIdx + 1;
  const indent = indentOf(prefix);
  const anc = ancestorsAt(lines, lineIdx, indent);
  const lvl = levelOf(anc);

  // A block header behaves the same before and after trailing spaces.
  const bare = KEY_RE.exec(prefix);
  if (bare && !bare[4]?.trim() && !["steps", "rules", "proposals"].includes(lvl)) {
    const id = keywordId(bare[3]);
    if (!isRepeatableBlock(id) && siblingKeys(lines, lineIdx, indent).has(id)) return null;
    const block = sectionBlock(bare[3], ctx, line);
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
      if (lvl === "subcases" && ctx.subcaseBudget?.tokens === 0) return null;
      const block = lvl === "process" ? stageBlock(ctx, milestoneBefore(ctx, line)) : lvl === "subcases" ? subcaseBlock(ctx) : [proposalText(ctx)];
      const full = listItem(block, true);
      // An inline continuation cannot insert a missing list dash before existing text.
      return dash && full.toLowerCase().startsWith(low) ? full.slice(typed.length) || null : null;
    }
    const present = siblingKeys(lines, lineIdx, indent);
    const hit = matchKeywords(lvl, anc, typed).find(({ key, label }) => (isRepeatableBlock(key) || !present.has(keywordId(key))) && label.toLowerCase().startsWith(low));
    if (!hit) return null;
    return hit.label.slice(typed.length) + keyLine(hit.key, lvl, anc, ctx, line);
  }

  // C. empty line → next most likely line or block
  if (hasFollowingChildren(lines, lineIdx, indent)) return null;
  const present = siblingKeys(lines, lineIdx, indent);
  const prefixDash = dash ? "" : "- ";
  switch (lvl) {
    case "top": {
      if (!/^\s*(Case|الحالة)\s*:/m.test(doc)) return "Case: My Business Case";
      const order = ["Lanes", "Case File", "Process Flow", "Binding Lean Contract", "Business & Product Constraints", "Cost & Traffic Guards", "Config", "Deployment"];
      const next = order.find((k) => !present.has(normKey(k)));
      return next ? next + ":\n" + sectionBlock(next, ctx, line)!.join("\n") : null;
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
      return listItem(stageBlock(ctx, milestoneBefore(ctx, line)), dash);
    case "subcases":
      return ctx.subcaseBudget?.tokens === 0 ? null : listItem(subcaseBlock(ctx), dash);
    case "proposals":
      return present.has("suggest policy_review") ? null : listItem([proposalText(ctx)], dash);
    case "lane-name":
      return laneBlock(laneNames(ctx)[0]).join("\n");
    case "cf-name":
      return `${documentNames(ctx)[0]}:\n  Source: pdf("documents.pdf")`;
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
