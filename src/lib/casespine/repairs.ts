import { buildTree, normKey, parseKey, type SpecNode } from "./tree";
import { compileSpec } from "./analyze";
import { ancestorsAt, indentOf, indentSuggestion, keyLine, keywordBeforeColon, keywordId, lastMs, levelOf, listOptions, matchKeywords, sectionBlock, siblingKeyLines, valueOptions, type SuggestContext } from "./suggest";
import { CONSTRAINT_FACETS, RULE_TEMPLATES } from "./vocab";
import { fieldSpec, formatValue, validateField } from "./configSchema";
import type { CompileResult } from "./types";

interface RepairEdit {
  line: number;
  from: number;
  to: number;
  insert: string;
}

export interface Repair extends RepairEdit {
  label: string;
  more?: RepairEdit[];
  targetLine?: number;
}

export interface DraftIssue {
  line: number;
  from: number;
  to: number;
  message: string;
  repairs: Repair[];
  ambiguous?: boolean;
  targetLine?: number;
}

export interface KeywordHelp {
  label: string;
  message: string;
  detail: string;
  preview: string;
  repair?: Repair;
  targetLine?: number;
  continuation?: string;
}

function inlineLane(value: string, ctx: SuggestContext): string[] | null {
  const name = value.replace(/^['"]|['"]$/g, "").trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} &_.()'/-]{0,75}$/u.test(name)) return null;
  const existing = ctx.lanes.find((lane) => lane.toLowerCase() === name.toLowerCase());
  return existing ? null : ["  " + name + ":"];
}

function siblingNode(nodes: SpecNode[], line: number): { node: SpecNode; siblings: SpecNode[] } | undefined {
  for (const node of nodes) {
    if (node.line === line) return { node, siblings: nodes };
    if (node.line < line && line <= node.endLine) return siblingNode(node.children, line);
  }
}

/** Shared by hover, the menu, and the inline preview. All edits are opt-in. */
export function keywordHelp(lines: string[], line: number, ctx: SuggestContext, tree?: () => SpecNode[]): KeywordHelp[] {
  const text = lines[line - 1];
  if (!text || /^\s*#/.test(text)) return [];
  const start = indentOf(text);
  const ancestors = ancestorsAt(lines, line - 1, start);
  const level = levelOf(ancestors);
  const { query, value } = keywordBeforeColon(text);
  const marker = /^(-\s+)/.exec(text.trimStart())?.[0] ?? "";
  const parsedKey = parseKey(text.trim().replace(/^-\s+/, ""))?.key;
  if (parsedKey && value && keywordId(parsedKey) !== "lanes" && matchKeywords(level, ancestors, parsedKey).some((match) => match.kind === "exact" && !match.question)) return [];
  const matches = matchKeywords(level, ancestors, query);
  if (!matches.length) return [];
  const parsed = siblingNode(tree?.() ?? buildTree(lines.join("\n")), line);
  const children = parsed?.node.children ?? [];
  const siblings = parsed?.siblings.filter((item) => item.line !== line && item.indent === start) ?? [];
  const present = siblingKeyLines(lines, line - 1, start);
  return matches.flatMap(({ key, label, question }): KeywordHelp[] => {
    const id = keywordId(key);
    const existing = siblings.find((item) => keywordId(item.key ?? "") === id);
    const target = existing?.line ?? (present.has(id) ? present.get(id)! + 1 : undefined);
    const canonical = parsed?.node.key && keywordId(parsed.node.key) === id;
    const block = sectionBlock(key, ctx);
    const section = block && level !== "config";
    const lane = id === "lanes" && value ? inlineLane(value, ctx) : null;
    if (canonical && !lane && (!target || value || !section || !["top", "contract", "stage"].includes(level))) return [];
    if (target) {
      if (value || children.length) return [{
        label: `Go to existing ${label}`, detail: `already defined on line ${target}`, preview: "", targetLine: target,
        message: `\`${label}:\` already exists on line ${target}. Move these entries into that block.`,
      }];
      const name = `Use existing ${label}`;
      return [{
        label: name, detail: `line ${target}`, preview: `↳ ${label}: already on line ${target}`, targetLine: target,
        message: `\`${label}:\` is already on line ${target}. Continue in that block.`,
        repair: { label: name, line, from: 0, to: text.length, insert: "", targetLine: target },
      }];
    }
    if (section && value && (!lane || children.length)) return [];
    const suffix = lane ? ":\n" + lane.join("\n") : value ? ": " + value : children.length ? ":" : keyLine(key, level, ancestors, ctx);
    const replacement = marker + label + suffix;
    const fragment = text.slice(start).trimEnd();
    const continuation = !question && replacement.toLowerCase().startsWith(fragment.toLowerCase())
      ? replacement.slice(fragment.length) : undefined;
    const name = section && !children.length ? `Insert ${label} block` : `Use ${label}`;
    return [{
      label: name, detail: section && !children.length ? "starter block" : "correct the field name",
      message: section ? `Use \`${label}:\` to start this block.` : `Use \`${label}:\` for this field.`,
      preview: replacement, continuation,
      repair: { label: name, line, from: start, to: text.length, insert: indentSuggestion(replacement, start) },
    }];
  });
}

const BLOCKS = new Set([
  "lanes", "case file", "config", "binding lean contract", "rules", "cost & traffic guards", "process flow",
  "steps", "on breach", "exit gateway", "deployment", "business & product constraints", "subcases", "actuators", "ai smart suggestions",
]);

function insertLines(lines: string[], at: number, added: string[], label: string): Repair {
  const end = lines[at - 1].length;
  return { line: at, from: end, to: end, insert: "\n" + added.join("\n"), label };
}

export function checkedRepair(src: string, compiled: CompileResult, repair: Repair): { source: string; compiled: CompileResult } | null {
  const source = applyRepair(src, repair);
  const next = compileSpec(source);
  const remaining = compiled.diagnostics.filter((item) => item.severity === "error").map((item) => item.message);
  if (!next.root || next.diagnostics.some((item) => {
    if (item.severity !== "error") return false;
    const match = remaining.indexOf(item.message);
    if (match < 0) return true;
    remaining.splice(match, 1);
    return false;
  })) return null;
  return { source, compiled: next };
}

export function collectDraftIssues(src: string, compiled: CompileResult, context: (line: number) => SuggestContext): DraftIssue[] {
  const lines = src.split("\n");
  const issues: DraftIssue[] = [];
  const tree = buildTree(compiled.normalized);
  const errorLines = new Set(compiled.diagnostics.filter((d) => d.severity === "error").map((d) => d.line));
  const rules = new Map(compiled.cases.flatMap((item) => item.rules.filter((rule) => !rule.inherited)).map((rule) => [rule.line, rule]));
  const report = (node: SpecNode, message: string, repairs: Repair[], from = indentOf(lines[node.line - 1]), ambiguous = false, targetLine?: number) => {
    issues.push({ line: node.line, from, to: lines[node.line - 1].trimEnd().length, message, repairs, ambiguous, targetLine });
  };

  function scan(nodes: SpecNode[], parent?: SpecNode) {
    for (const node of nodes) {
      const key = normKey(node.key);
      const text = lines[node.line - 1];
      const end = text.trimEnd().length;
      const parentKey = normKey(parent?.key);
      const ancestors = ancestorsAt(lines, node.line - 1, node.indent);
      const level = levelOf(ancestors);
      const ctx = () => context(node.line);
      const add = (label: string, insert: string, from = end, to = end): Repair => ({ line: node.line, from, to, insert, label });
      const valueAt = (at: number, value: string): RepairEdit => {
        const end = lines[at - 1].length;
        return { line: at, from: end, to: end, insert: (lines[at - 1].endsWith(":") ? " " : "") + value };
      };

      const suggestions = !node.key || errorLines.has(node.line) || BLOCKS.has(key) ? keywordHelp(lines, node.line, ctx(), () => tree) : [];
      if (suggestions.length) {
        const [first] = suggestions;
        report(node, first.message, suggestions.slice(0, 3).flatMap(({ repair }) => repair ? [repair] : []), indentOf(text), false, first.targetLine);
      }

      if (!suggestions.length && BLOCKS.has(key)) {
        if (!node.children.length && !node.value) {
          const block = sectionBlock(node.key!, ctx());
          report(node, "This section is unfinished. Add an entry inside it.", block ? [
            insertLines(lines, node.line, block.map((line) => " ".repeat(node.indent) + line), "Add the first entry"),
          ] : []);
        } else if (node.children.length && key === "exit gateway") {
          const block = sectionBlock("Exit Gateway", ctx()) ?? [];
          const ind = node.children[0].indent;
          const label = "Complete gateway branches";
          const missing: string[] = [];
          const edits: RepairEdit[] = [];
          for (const branch of block) {
            const [branchKey, value] = branch.trim().split(/:\s+/, 2);
            const field = node.children.find((item) => normKey(item.key) === keywordId(branchKey));
            if (!field) missing.push(" ".repeat(ind) + branch.trimStart());
            else if (!field.value) edits.push(valueAt(field.line, value));
          }
          if (missing.length) edits.push(insertLines(lines, node.endLine, missing, label));
          const [first, ...more] = edits;
          if (first) report(node, "The exit gateway has unfinished branches.", [{ ...first, label, more }]);
        }
      }

      const stage = parentKey === "process flow" && /^stage\s+(\d+)\s*(?:\(([^()]*)\)?)?$/i.exec(node.key ?? node.text);
      if (stage) {
        const steps = node.children.find((field) => normKey(field.key) === "steps");
        const reach = node.children.find((field) => normKey(field.key) === "reach milestone");
        const when = node.children.find((field) => normKey(field.key) === "when");
        const gatewayMilestone = node.children.some((field) => normKey(field.key) === "exit gateway" && field.children.some(
          (branch) => normKey(branch.key) === "then" && /\breach milestone \w+/i.test(branch.value ?? ""),
        ));
        const ind = " ".repeat(node.children[0]?.indent ?? node.indent + 4);
        const base = `Stage${stage[1]}Complete`;
        const existing = new Set(ctx().milestones);
        let milestone = base;
        for (let i = 2; existing.has(milestone); i++) milestone = base + i;
        const label = "Complete this stage";
        const edits: RepairEdit[] = [];
        if (stage[2] !== undefined && !node.text.includes(")")) edits.push(add(label, "):"));
        else if (!node.key) edits.push(add("Add missing colon", ":"));
        const step = ind + "  - Review the case evidence";
        const added = !steps ? [ind + "Steps:", step] : [];
        if (steps && !steps.children.length) {
          const child = " ".repeat(steps.indent + 2) + "- Review the case evidence";
          edits.push(insertLines(lines, steps.line, [child], label));
        }
        if (reach && !reach.value) edits.push(valueAt(reach.line, milestone));
        if (!reach && !gatewayMilestone) added.push(ind + "Reach Milestone: " + milestone);
        if (when && !when.value) edits.push(valueAt(when.line, valueOptions("When", ["stage " + stage[1]], ctx())[0]));
        if (added.length) edits.push(insertLines(lines, node.endLine, added, label));
        const [first, ...more] = edits;
        if (first) report(node, "This stage has unfinished fields. Complete them and keep your existing entries.", [{ ...first, label, more }]);
      }

      if (node.key && node.value === "" && !node.children.length && !BLOCKS.has(key)
        && !["other", "lane-name", "cf-name", "process", "proposals", "rules", "steps"].includes(level)) {
        const value = valueOptions(node.key, ancestors, ctx())[0];
        if (value !== undefined) report(node, "This field is missing its value.", [{ ...valueAt(node.line, value), label: "Insert suggested value" }]);
      }

      if (node.key && node.value?.includes("[") && !node.value.includes("]") && (key === "curation" || listOptions(node.key, ctx()).length)) {
        report(node, "This list is still open.", [add("Close list with ]", "]")], text.indexOf("["));
      }

      if (level === "config" && node.value?.startsWith("{") && !node.value.endsWith("}")) {
        const close = node.value.includes("[") && !node.value.includes("]") ? "] }" : " }";
        report(node, "This component configuration is still open.", [add("Close the configuration", close)], text.indexOf("{"));
      }
      if (level === "config-fields" && node.key && node.value) {
        const field = fieldSpec(ancestors[0], node.key);
        const problem = field && validateField(field, node.value);
        if (field && problem) {
          const from = text.indexOf(":") + 1;
          const number = Number(node.value);
          const bound = field.type === "number" && Number.isFinite(number) ? Math.max(field.min ?? number, Math.min(field.max ?? number, number)) : undefined;
          report(node, problem, [add(bound === undefined ? "Use the suggested value" : "Use the closest allowed value",
            " " + formatValue(bound ?? field.default), from, end)], from);
        }
      }

      if (!suggestions.length && !node.key && !stage && !["steps", "rules", "proposals"].includes(level)) {
        const typed = text.trim().replace(/^-\s+/, "");
        if (typed) {
          const isNamedBlock = (level === "lane-name" || level === "cf-name") && /^[\p{L}][\p{L}\p{N} &'-]{1,70}$/u.test(typed);
          const repairs = isNamedBlock ? [add("Add missing colon", ":")] : [];
          report(node, repairs.length ? "This entry is unfinished." : "This fragment does not match a CaseSpine entry.", repairs, indentOf(text), !repairs.length);
        }
      }

      if (parentKey === "rules" && (errorLines.has(node.line) || rules.has(node.line))) {
        const typed = text.trim().replace(/^-\s*/, "");
        if (/\bfor\s*\[[^\]]*$/i.test(typed)) {
          report(node, "The rule's entity list is still open.", [add("Close list with ]", "]")], text.indexOf("["));
          continue;
        }
        if (!errorLines.has(node.line)) continue;
        const options = RULE_TEMPLATES.map((rule) => ({ ...rule, text: rule.text.replace("${Milestone}", lastMs(ctx())) }))
          .filter((rule) => typed && rule.text.toLowerCase().startsWith(typed.toLowerCase()));
        report(node, options.length ? "This rule is unfinished." : "This rule cannot be evaluated.", options.slice(0, 3).map((rule) =>
          add("Complete " + rule.label, rule.text.slice(typed.length))), indentOf(text), !options.length);
      }

      if (node.children.length) scan(node.children, node);
    }
  }
  scan(tree);
  return issues;
}

export function commentFragment(line: string): string {
  const indent = indentOf(line);
  return line.slice(0, indent) + "# " + line.slice(indent);
}

export interface IntentChoice {
  id: string;
  label: string;
  insert: string;
}

export function intentChoices(src: string, line: number, ctx: SuggestContext): IntentChoice[] {
  const lines = src.split("\n");
  const text = lines[line - 1];
  const level = levelOf(ancestorsAt(lines, line - 1, indentOf(text)));
  if (level === "rules") return RULE_TEMPLATES.map((rule, i) => ({
    id: "rule-" + i, label: rule.label + " — " + rule.detail, insert: "- " + rule.text.replace("${Milestone}", lastMs(ctx)),
  }));
  if (level === "stage" || level === "breach") return ctx.lanes.map((lane, i) => ({
    id: "escalation-" + i, label: "Escalate to " + lane, insert: "Escalate To: " + lane,
  })).slice(0, 14);
  if (level === "constraints") return CONSTRAINT_FACETS.map(({ key }) => ({
    id: "constraint-" + key.toLowerCase(), label: key + " constraint", insert: key + ": " + text.trim(),
  }));
  if (level === "top" && /^(?:(?:please\s+)?(?:set|add|make|define)\s+(?:the\s+)?(?:business\s+)?deliverable\b|(?:business\s+)?deliverable\s+is\b|(?:the\s+)?(?:case|workflow)\s+(?:must|should)\s+(?:produce|deliver|output|emit)\b)/i.test(text.trim())) return [
    { id: "deliverable", label: "Business deliverable — a concrete output this case must produce", insert: "Business Deliverable: " + text.trim() },
  ];
  return [];
}

export function applyRepair(src: string, repair: Repair): string {
  const lines = src.split("\n");
  for (const edit of [repair, ...(repair.more ?? [])].sort((a, b) => b.line - a.line || b.from - a.from)) {
    const text = lines[edit.line - 1];
    if (text === undefined) return src;
    lines[edit.line - 1] = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  }
  return lines.join("\n");
}

/** A model selects an existing choice. Its output is never inserted as source. */
export function validatedIntentRepair(src: string, line: number, choice: IntentChoice): Repair | null {
  const current = src.split("\n")[line - 1];
  if (!current) return null;
  const repair = { label: "Use " + choice.label, line, from: indentOf(current), to: current.length, insert: choice.insert };
  const errors = (value: string) => compileSpec(value).diagnostics.filter((d) => d.severity === "error");
  const before = errors(src);
  const after = errors(applyRepair(src, repair));
  return !after.some((d) => d.line === line) && after.length <= before.length ? repair : null;
}
