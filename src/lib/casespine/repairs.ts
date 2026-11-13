import { buildTree, normKey, type SpecNode } from "./tree";
import { compileSpec } from "./analyze";
import { ancestorsAt, indentOf, indentSuggestion, keyLine, keysFor, keywordId, lastMs, levelOf, listOptions, sectionBlock, valueOptions, type SuggestContext } from "./suggest";
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
}

export interface DraftIssue {
  line: number;
  from: number;
  to: number;
  message: string;
  repairs: Repair[];
  ambiguous?: boolean;
}

const BLOCKS = new Set([
  "lanes", "case file", "config", "binding lean contract", "rules", "cost & traffic guards", "process flow",
  "steps", "on breach", "exit gateway", "deployment", "business & product constraints", "subcases", "actuators", "ai smart suggestions",
]);

function insertLines(lines: string[], at: number, added: string[], label: string): Repair {
  const end = lines[at - 1].length;
  return { line: at, from: end, to: end, insert: "\n" + added.join("\n"), label };
}

export function collectDraftIssues(src: string, compiled: CompileResult, context: (line: number) => SuggestContext): DraftIssue[] {
  const lines = src.split("\n");
  const issues: DraftIssue[] = [];
  const tree = buildTree(compiled.normalized);
  const errorLines = new Set(compiled.diagnostics.filter((d) => d.severity === "error").map((d) => d.line));
  const rules = new Map(compiled.cases.flatMap((item) => item.rules.filter((rule) => !rule.inherited)).map((rule) => [rule.line, rule]));
  const report = (node: SpecNode, message: string, repairs: Repair[], from = indentOf(lines[node.line - 1]), ambiguous = false) => {
    issues.push({ line: node.line, from, to: lines[node.line - 1].trimEnd().length, message, repairs, ambiguous });
  };

  function scan(nodes: SpecNode[], parent?: SpecNode) {
    const sections = new Set<string>();
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

      if (BLOCKS.has(key)) {
        if (sections.has(key) && !node.children.length && !node.value) {
          report(node, "This section already exists.", [add("Remove empty duplicate", "", 0, text.length)]);
        } else if (!node.children.length && !node.value) {
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
        sections.add(key);
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

      if (!node.key && !stage && !["steps", "rules", "proposals"].includes(level)) {
        const typed = text.trim().replace(/^-\s+/, "");
        if (typed) {
          const known = keysFor(level, ancestors);
          const exact = known.find((option) => keywordId(option) === keywordId(typed));
          const prefixes = known.filter((option) => option.toLowerCase().startsWith(typed.toLowerCase())).slice(0, 3);
          const isNamedBlock = (level === "lane-name" || level === "cf-name") && /^[\p{L}][\p{L}\p{N} &'-]{1,70}$/u.test(typed);
          const completion = exact && !node.children.length ? keyLine(exact, level, ancestors, ctx()) : "";
          const repairs = completion.trim().length > 1
            ? [add("Complete " + exact, indentSuggestion(completion, node.indent))]
            : exact || isNamedBlock ? [add("Add missing colon", ":")]
            : prefixes.map((option) => add("Complete " + option, indentSuggestion(option.slice(typed.length) + keyLine(option, level, ancestors, ctx()), node.indent)));
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
  if (level === "top") return [
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
