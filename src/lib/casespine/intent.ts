import { compileSpec } from "./analyze";
import { componentSpec, fieldSpec } from "./configSchema";
import { addStep, authoringSlot, insertAuthoring, upsertKey } from "./edits";
import { ancestorsAt, contextForCase, indentOf, isRepeatableBlock, keyLine, keywordId, levelOf, matchKeywords, milestoneBefore, sectionBlock, stageBlock } from "./suggest";
import { KEYWORDS, RULE_TEMPLATES } from "./vocab";
import type { CaseAST, CompileResult } from "./types";

export interface IntentDraft {
  line: number;
  text: string;
  source: string;
  compiled: CompileResult;
  append?: boolean;
  heading?: string;
  localFallback?: boolean;
}

const shortValue = (value: string) => value.trim().replace(/^[“"']|[”"']$/g, "").trim();
const listItems = (value: string) => value.replace(/^\[|\]$/g, "").split(/\s*,\s*|\s+and\s+/i).map(shortValue).filter(Boolean);

function nameOf(value: string, fallback: string) {
  return shortValue(value).replace(/[:()[\]{}#]/g, "").slice(0, 76).trim() || fallback;
}

function laneLines(value: string, c: CaseAST): string[] | null {
  const [namePart, ...requirements] = value.replace(/^(?:named|called)\s+/i, "").split(/\bwith\b/i);
  const name = nameOf(namePart, "New Lane");
  if (c.lanes.some((lane) => lane.name.toLowerCase() === name.toLowerCase())) return null;
  const notes: string[] = [];
  const fields = new Map<string, string>();
  for (const item of requirements.join(" with ").split(/;\s*|\s+with\s+|,\s*(?=(?:roles?|clearance|sso|user)\b)/i)) {
    const text = item.trim().replace(/^(?:the\s+)?requirements?\s*:?\s*/i, "");
    if (!text) continue;
    const field = /^(roles?|clearance|sso(?: provider)?|user)\s*[:=]?\s+(.+)/i.exec(text);
    const values = listItems(field?.[2] ?? text);
    if (field?.[1].toLowerCase().startsWith("sso")) fields.set("SSO Provider", field[2]);
    else if (field?.[1].toLowerCase() === "user") fields.set("User", field[2]);
    else if (field || values.every((entry) => /^[A-Z][A-Z0-9_]*$/.test(entry))) {
      const key = field?.[1].toLowerCase() === "clearance" ? "Clearance" : "Roles";
      fields.set(key, "[" + values.map((entry) => entry.replace(/[\[\]#]/g, "")).join(", ") + "]");
    } else notes.push("  # Requirement: " + text);
  }
  return [name + ":", ...[...fields].map(([key, value]) => `  ${key}: ${value}`), ...notes];
}

function caseAt(result: CompileResult, line: number, lines: string[]) {
  return [...result.cases].reverse().find((c) => c.line <= line && (line <= c.endLine
    || (indentOf(lines[line - 1]) > indentOf(lines[c.line - 1]) && lines.slice(c.endLine, line - 1).every((text) => !text.trim() || /^\s*#/.test(text))))) ?? result.root;
}

function stageAt(c: CaseAST, line: number) {
  return c.stages.find((stage) => stage.line <= line && line <= stage.endLine) ?? c.stages.at(-1);
}

function namedStage(c: CaseAST, line: number, title: string, step?: string) {
  const ctx = contextForCase(c);
  const block = stageBlock(ctx, milestoneBefore(ctx, line));
  if (title) block[0] = block[0].replace(/\(.*\)/, `(${nameOf(title, "Review")})`);
  if (step) block[3] = "      - " + shortValue(step);
  return block;
}

export function addNamedStage(src: string, c: CaseAST, title: string, step?: string): string {
  const slot = authoringSlot(src, c, "stage");
  return slot ? insertAuthoring(src, slot, namedStage(c, slot.line + 1, title, step)) : src;
}

function fieldEdit(src: string, c: CaseAST, line: number, key: string, value: string): string | null {
  const lines = src.split("\n");
  const ancestors = ancestorsAt(lines, line - 1, indentOf(lines[line - 1]));
  const level = levelOf(ancestors);
  const doc = KEYWORDS.find((entry) => keywordId(entry.key) === keywordId(key) && entry.level === level)
    ?? KEYWORDS.find((entry) => keywordId(entry.key) === keywordId(key));
  if (doc) {
    if (sectionBlock(doc.key, contextForCase(c)) || keywordId(doc.key) === "case") return null;
    const block = { guards: "Cost & Traffic Guards", deployment: "Deployment", contract: "Binding Lean Contract", constraints: "Business & Product Constraints", actuators: "Actuators" };
    if (doc.level === "top") return upsertKey(src, c, [], doc.key, value);
    if (doc.level in block) return upsertKey(src, c, [block[doc.level as keyof typeof block]], doc.key, value);
    if (doc.level === "lane" || doc.level === "case-file") {
      const items = doc.level === "lane" ? c.lanes : c.caseFiles;
      const item = items.find((entry) => keywordId(entry.name) === ancestors[0]) ?? (items.length === 1 ? items[0] : undefined);
      return item ? upsertKey(src, c, [doc.level === "lane" ? "Lanes" : "Case File", item.name], doc.key, value) : null;
    }
    const stage = stageAt(c, line);
    if (!stage) return null;
    const path = ["Process Flow", `Stage ${stage.idx}`];
    if (doc.level === "gateway") path.push("Exit Gateway");
    return upsertKey(src, c, path, doc.key, value);
  }
  const words = key.trim().split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const component = componentSpec(words.slice(0, i).join(" "));
    const field = component && fieldSpec(component.name, words.slice(i).join(" "));
    if (component && field) return upsertKey(src, c, ["Config", component.name], field.key, value);
  }
  const component = level === "config-fields" ? componentSpec(ancestors[0]) : undefined;
  const field = component && fieldSpec(component.name, key);
  return component && field ? upsertKey(src, c, ["Config", component.name], field.key, value) : null;
}

function parseCommand(command: string) {
  const text = command.replace(/^(?:(?:hey|please|can you|could you)[,!]?\s+)*/i, "").trim()
    .replace(/\s+please[.!?]?$/i, "").replace(/[.!?]$/, "");
  const add = /^(?:add|create|insert|start)\s+(?:(?:a|an|another|the|new|first|second|third)\s+)*(.*)$/i.exec(text);
  if (add) {
    const block = /^(.+?)\s+block$/i.exec(add[1]);
    const key = block && matchKeywords("top", [], block[1]).find((match) => match.kind !== "prefix")?.key;
    if (key) return { kind: "section", value: key };
    const entry = /^(case file|case|lane|stage|step|rule|gateway|subcase|constraint|component|proposal|section)\b\s*(.*)$/i.exec(add[1]);
    return entry && { kind: entry[1].toLowerCase(), value: entry[2].trim() };
  }
  const edit = /^(escalate to|route to|set)\s+(.+)$/i.exec(text);
  return edit && { kind: edit[1].toLowerCase() === "set" ? "set" : "escalation", value: edit[2].trim() };
}

function operation(src: string, c: CaseAST | null, line: number, command: string, inputIndent: number): { source: string; text: string } | null {
  const intent = parseCommand(command);
  if (!intent) return null;
  const { kind, value } = intent;
  if (kind === "case" && !c) {
    const text = "Case: " + nameOf(value.replace(/^(?:named|called)\s+/i, ""), "My Business Case");
    return { source: src.replace(/^\n*/, "") ? text + "\n" + src : text, text };
  }
  if (!c) return null;
  const ctx = contextForCase(c);
  if (kind === "lane" || kind === "stage" || kind === "rule" || kind === "gateway" || kind === "escalation") {
    const slot = authoringSlot(src, c, kind, line);
    if (!slot) return null;
    let block: string[] | null;
    if (kind === "lane") block = laneLines(value, c);
    else if (kind === "stage") {
      const [title, step] = value.replace(/^(?:named|called)\s+/i, "").split(/\s+with\s+(?:a\s+)?step\s+/i, 2);
      block = namedStage(c, slot.line + 1, title, step);
    } else if (kind === "rule") {
      const typed = value.replace(/^that\s+/i, "");
      if (!typed) return null;
      const template = RULE_TEMPLATES.find((rule) => typed.toLowerCase() === rule.label.toLowerCase());
      const milestone = ctx.milestones.at(-1) ?? "StageExit";
      const body = template ? template.text.replace("${Milestone}", milestone) : /^(it is|يجب|يحظر|يجوز)\b/i.test(typed)
        ? typed : `It is obligatory that ${typed}${/before Milestone/i.test(typed) ? "" : ` before Milestone ${milestone}`}.`;
      block = ["- " + body];
    } else if (kind === "gateway") {
      if (stageAt(c, line)?.gate || value) return null;
      block = ["Exit Gateway:", ...sectionBlock("Exit Gateway", { ...ctx, stage: stageAt(c, line) })!];
    } else {
      if (!value) return null;
      const target = shortValue(value);
      block = [slot.lines ? "Escalate To: " + target : target];
    }
    if (!block) return null;
    const indent = slot.lines?.at(-1) ?? "";
    const text = [...(slot.lines?.slice(0, -1) ?? []), ...block.map((item) => indent + item)].join("\n");
    return { source: insertAuthoring(src, slot, block), text };
  }
  if (kind === "step" && value) return { source: addStep(src, c, shortValue(value), stageAt(c, line)?.idx), text: "- " + shortValue(value) };
  if (kind === "case file") {
    const [label, file] = value.split(/\s+(?:from|with source)\s+/i, 2);
    if (!file) return null;
    const name = nameOf(label, "Documents");
    const path = shortValue(file);
    if (!path || /["()]/.test(path)) return null;
    const field = /^[a-z]+:\/\//i.test(path) ? path : `pdf("${path}")`;
    return { source: upsertKey(src, c, ["Case File", name], "Source", field), text: `Case File:\n  ${name}:\n    Source: ${field}` };
  }
  if (kind === "component") {
    const component = componentSpec(value);
    if (!component || c.config[keywordId(component.name)]) return null;
    const text = component.name + keyLine(component.name, "config", ["config"], ctx);
    return { source: upsertKey(src, c, ["Config"], component.name, text.slice(text.indexOf(":") + 1).trim()), text };
  }
  if (kind === "set" || kind === "constraint") {
    const fields = /^(?:the\s+)?(.+?)\s*(?::\s*|\s+(?:to|as)\s+)(.+)$/i.exec(value);
    if (!fields) return null;
    const key = shortValue(fields[1]);
    const scalar = shortValue(fields[2]);
    const next = kind === "constraint" ? upsertKey(src, c, ["Business & Product Constraints"], nameOf(key, "Requirement"), scalar)
      : fieldEdit(src, c, line, key, scalar);
    return next ? { source: next, text: key + ": " + scalar } : null;
  }
  if (kind === "subcase" && value) {
    const name = nameOf(value.replace(/^(?:named|called)\s+/i, ""), "Additional Review");
    if (c.subcases.some((item) => item.name.toLowerCase() === name.toLowerCase())) return null;
    const text = `- Subcase: ${name}`;
    const budget = ctx.subcaseBudget!;
    const slot = authoringSlot(src, c, "subcase", line);
    if (!slot || budget.tokens <= 0) return null;
    const block = [text, `  Budget Ceiling: ${Math.min(1000, budget.tokens)} tokens or $${Math.min(budget.usd, 0.05).toFixed(2)}`];
    return { source: insertAuthoring(src, slot, block), text: block.join("\n") };
  }
  if (kind === "proposal") {
    const proposal = /^(.+?)\s+(?:reviewed|moderated)\s+by\s+(.+)$/i.exec(value);
    if (!proposal || /["()]/.test(proposal[2])) return null;
    const text = `- Suggest policy_review: "${shortValue(proposal[1]).replace(/"/g, "'")}" (Moderated by: ${shortValue(proposal[2])})`;
    const slot = authoringSlot(src, c, "proposal");
    return slot ? { source: insertAuthoring(src, slot, [text]), text } : null;
  }
  if (kind === "section") {
    const key = KEYWORDS.find((entry) => entry.level === "top" && keywordId(entry.key) === keywordId(value))?.key;
    if (!key) return null;
    const lines = src.split("\n");
    const slot = authoringSlot(src, c, "section")!;
    const indent = indentOf(slot.lines![0]);
    if (!isRepeatableBlock(key) && lines.slice(c.line - 1, c.endLine).some((text) => indentOf(text) === indent && keywordId(text.trim().split(":")[0]) === keywordId(key))) return null;
    // Put an explicit block request on the draft line when it is in this case's scope.
    const inPlace = inputIndent === indent && line > c.line;
    const body = sectionBlock(key, ctx, inPlace ? line : slot.line + 1);
    if (!body) return null;
    const text = [key + ":", ...body].join("\n");
    if (inPlace) {
      lines[line - 1] = text.split("\n").map((entry) => " ".repeat(indent) + entry).join("\n");
      return { source: lines.join("\n"), text };
    }
    return { source: insertAuthoring(src, slot, text.split("\n")), text };
  }
  return null;
}

export function draftIntent(src: string, line: number, command?: string): IntentDraft | null {
  const lines = src.split("\n");
  const original = lines[line - 1];
  const input = command ?? original?.trim();
  if (!input || !original?.trim() || input.length > 400 || /[\r\n]/.test(input) || /^\s*#/.test(original)) return null;
  const next = lines.slice(line).find((text) => text.trim() && !/^\s*#/.test(text));
  if (next && indentOf(next) > indentOf(original)) return null;
  lines[line - 1] = "";
  const clean = lines.join("\n");
  const before = compileSpec(clean);
  const start = !before.root && !clean.trim() && !/\b(?:add|create|start|insert)\s+(?:(?:a|an|the|new)\s+)*case\b(?!\s+file\b)/i.test(input);
  const source = start ? "Case: My Business Case" : clean;
  const draft = operation(source, start ? compileSpec(source).root : caseAt(before, line, src.split("\n")), line, input, indentOf(original));
  if (!draft || draft.source === clean) return null;
  const draftSource = draft.source.replace(/\n+$/, "");
  const compiled = compileSpec(draftSource);
  const errors = (result: CompileResult) => result.diagnostics.filter((d) => d.severity === "error");
  const previousErrors = before.root ? errors(before) : [];
  if (!compiled.root || errors(compiled).some((error) => {
    const old = previousErrors.findIndex((item) => item.message === error.message);
    if (old === -1) return true;
    previousErrors.splice(old, 1);
    return false;
  })) return null;
  if (command && /\badd rule\b/i.test(command) && !/\badd rule\b/i.test(original)) {
    const knownFields = new Set([...before.fields.keys(), ...RULE_TEMPLATES.flatMap((rule) =>
      [...compileSpec(`Case: Rule\nBinding Lean Contract:\n  Rules:\n    - ${rule.text.replace("${Milestone}", "StageExit")}`).fields.keys()])]);
    if ([...compiled.fields.keys()].some((field) => !knownFields.has(field))) return null;
  }
  return { line, text: start ? "Case: My Business Case\n" + draft.text : draft.text, source: draftSource, compiled };
}

export function draftLocalFallback(src: string, line: number, fragment: string): IntentDraft | null {
  const typed = fragment.trim().replace(/^-\s+/, "");
  const review = /^(?:(?:we )?(?:need|require) )?two (?:independent|different|distinct) reviewers?(?: before release)?[.!]?$/i.test(typed);
  const lane = /^(?:would you mind giving us|we need) (?:a |an |the )?(?:second |new )?lane (?:for|called|named) (.{1,76}?) with roles? (.+?)[.?!]?$/i.exec(typed);
  const command = review ? "add rule four-eyes" : lane ? `add lane ${lane[1]} with roles ${lane[2]}` : typed;
  const draft = draftIntent(src, line, command);
  return draft ? { ...draft, localFallback: true } : null;
}
