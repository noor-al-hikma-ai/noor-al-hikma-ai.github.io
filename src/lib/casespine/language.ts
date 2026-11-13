// CodeMirror 6 support for CaseSpine: highlighting, context-aware completion
// (keywords, SBVR rule templates, lanes, milestones, SSO / cloud / governance
// values), hover hints showing the compiled Lean 4 for each rule, and linting.

import { StreamLanguage, HighlightStyle, indentService, syntaxHighlighting, type StringStream } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { autocompletion, startCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { hoverTooltip, EditorView } from "@codemirror/view";
import { linter, lintGutter, type Diagnostic as CMDiagnostic } from "@codemirror/lint";
import type { EditorState, Extension } from "@codemirror/state";
import { compileSpec } from "./analyze";
import { classifyStep, KIND_META } from "./graph";
import { clauseText } from "./rules";
import { buildTree, normKey } from "./tree";
import { KEYWORDS, PII_ENTITIES, RULE_TEMPLATES, STEP_TEMPLATES } from "./vocab";
import type { CompileResult } from "./types";
import { COMPONENTS, componentSpec, fieldSpec, formatValue, inlineDefaults } from "./configSchema";
import { ancestorsAt, canSeedBlock, indentOf, indentSuggestion, keyLine, keywordId, laneBlock, lastMs, levelOf, listOptions, proposalText, sectionBlock, siblingKeys, stageBlock, subcaseBlock, translateKey, valueOptions, type Level } from "./suggest";
import { contextFrom, currentDraft, dropdowns, ghostText, goToKeyword, openOptions, rtlLines, showIntentDraft, takeUnfilteredOptions, useKeywordHelp } from "./assist";
import { applyRepair, checkedRepair, collectDraftIssues, commentFragment, intentChoices, keywordHelp, validatedIntentRepair, type DraftIssue, type Repair } from "./repairs";
import { draftIntent, draftLocalFallback, type IntentDraft } from "./intent";
import { requestLiveModel } from "../liveModel";

// ------------------------------------------------------------------ tokenizer
interface TokState {
  keyAllowed: boolean;
  indent: number;
}

const casespineStream = StreamLanguage.define<TokState>({
  name: "casespine",
  startState: () => ({ keyAllowed: true, indent: 0 }),
  token(stream: StringStream, state: TokState) {
    if (stream.sol()) {
      state.keyAllowed = true;
      state.indent = stream.indentation();
    }
    if (stream.eatSpace()) return null;
    if (state.keyAllowed && stream.peek() === "#") {
      stream.skipToEnd();
      return "comment";
    }
    if (state.keyAllowed && stream.match(/^-(?=\s)/)) return "punctuation";
    if (state.keyAllowed) {
      state.keyAllowed = false;
      if (stream.match(/^[^:"'[{#\s][^:]*?:(?=\s|$)/)) return state.indent === 0 ? "heading" : "keyword";
    }
    if (stream.match(/^It is (obligatory|prohibited|permitted|forbidden|required) that/i)) return "modifier";
    if (stream.match(/^(يجب أن (تكون|يكون)?|يُ?حظر أن (تكون|يكون)?|يجوز أن)/)) return "modifier";
    if (stream.match(/^(before\s+)?Milestone\s+\w+/i)) return "labelName";
    if (stream.match(/^(قبل المعلم|بلوغ المعلم)\s+\w+/)) return "labelName";
    if (stream.match(/^(>=|<=|!=|==|≥|≤|≠|=|>|<)/)) return "operator";
    if (stream.match(/^"[^"]*"?/)) return "string";
    if (stream.match(/^[a-z0-9_]+:\/\/[^\s,\])]*/)) return "link";
    if (stream.match(/^\$?\d[\d,]*(\.\d+)?(%|x\b)?/)) return "number";
    if (stream.match(/^[A-Z][A-Z0-9_]{2,}\b/)) return "atom";
    if (stream.match(/^[[\](),]/)) return "bracket";
    if (stream.match(/^[^\s"[\]()<>=!≥≤≠$\d,]+/)) return null;
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "#" } },
});

const highlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--cs-heading)", fontWeight: "650" },
  { tag: t.keyword, color: "var(--cs-key)", fontWeight: "550" },
  { tag: t.modifier, color: "var(--cs-modal)", fontStyle: "italic", fontWeight: "550" },
  { tag: t.labelName, color: "var(--cs-milestone)", fontWeight: "550" },
  { tag: t.operator, color: "var(--cs-op)", fontWeight: "700" },
  { tag: t.string, color: "var(--cs-string)" },
  { tag: t.link, color: "var(--cs-link)", textDecoration: "underline" },
  { tag: t.number, color: "var(--cs-number)" },
  { tag: t.atom, color: "var(--cs-atom)", fontWeight: "550" },
  { tag: t.comment, color: "var(--cs-comment)", fontStyle: "italic" },
  { tag: t.punctuation, color: "var(--cs-comment)" },
  { tag: t.bracket, color: "var(--cs-comment)" },
]);

// ------------------------------------------------------------------ compile cache
let cacheSrc = "";
let cacheRes: CompileResult | null = null;
export function compiledFor(state: EditorState): CompileResult {
  const src = state.doc.toString();
  if (src !== cacheSrc || !cacheRes) {
    cacheSrc = src;
    cacheRes = compileSpec(src);
  }
  return cacheRes;
}

// ------------------------------------------------------------------ context helpers
const KEY_AT = /^(\s*)(?:-\s+)?([^:"'[{#\s][^:]*?):(?:\s|$)/;

function lineKey(text: string): { indent: number; key: string } | null {
  const m = KEY_AT.exec(text);
  if (!m) return null;
  return { indent: m[1].length, key: m[2].trim() };
}

function docLines(state: EditorState) {
  return state.doc.toString().split("\n");
}

function keyCompletions(level: Level, anc: string[], ar: boolean): Completion[] {
  if (level === "config")
    return COMPONENTS.map((c) => ({ label: c.name, apply: `${c.name}: ${inlineDefaults(c)}`, type: "class", detail: "component config", info: c.doc, boost: 1 }));
  if (level === "config-fields") {
    const spec = componentSpec(anc[0]);
    return (spec?.fields ?? []).map((f) => ({
      label: f.key,
      apply: `${f.key}: ${f.type === "lane" ? "" : formatValue(f.default)}`,
      type: "property",
      detail: f.type === "number" ? `${f.min}–${f.max}` : f.options ? f.options.join(" | ") : f.type,
      info: f.doc,
    }));
  }
  const lv = level === "top" ? "top" : level === "case-file" ? "case-file" : level;
  return KEYWORDS.filter((k) => k.level === lv || (lv === "stage" && k.level === "breach")).map((k) => ({
    label: ar && k.ar ? k.ar : k.key,
    apply: (ar && k.ar ? k.ar : k.key) + ": ",
    type: "keyword",
    detail: k.std ?? (ar ? k.key : k.ar),
    info: k.doc,
    boost: level === "top" ? 1 : 0,
  }));
}

function caseSpineCompletions(ctx: CompletionContext): CompletionResult | null {
  const showAll = takeUnfilteredOptions(ctx.view);
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  if (/^\s*#/.test(before)) return null;
  const indent = indentOf(before);
  const res = compiledFor(ctx.state);
  const lines = docLines(ctx.state);
  const sctx = contextFrom(res, line.number, lines);
  const ar = res.language === "ar";
  const anc = ancestorsAt(lines, line.number - 1, indent);
  const level = levelOf(anc);
  const tailOfLine = line.text.slice(ctx.pos - line.from);

  if (!tailOfLine.trim() && before.trim()) {
    const snapshot = lines.join("\n");
    const suggestions = keywordHelp(lines, line.number, sctx, () => buildTree(res.normalized))
      .filter(({ repair }) => !repair || checkedRepair(snapshot, res, repair));
    if (suggestions.length) return {
      from: line.from + indent, to: line.to, filter: false,
      options: suggestions.map((suggestion) => ({
        label: suggestion.label, detail: suggestion.detail, info: suggestion.message,
        type: "keyword", apply: (view) => useKeywordHelp(view, suggestion, snapshot),
      })),
    };
  }

  // Milestone names anywhere after "Milestone "
  const msm = /(Milestone|المعلم)\s+(\w*)$/.exec(before);
  if (msm) {
    return {
      from: ctx.pos - msm[2].length,
      to: ctx.pos + (/^\w*/.exec(tailOfLine)?.[0].length ?? 0),
      options: [...new Set([...sctx.milestones, "IndexReady", "InquiryResolved", "CaseResolved"])].map((m) => ({ label: m, type: "constant", detail: sctx.milestones.includes(m) ? "reached in this case" : "new" })),
    };
  }
  const kv = /^\s*(?:-\s+)?([^:"'[{#\s][^:]*?):\s*(.*)$/.exec(before);
  const inline = level === "config" && kv ? componentSpec(kv[1]) : undefined;
  const mapStart = inline ? before.indexOf("{") : -1;
  if (inline && mapStart >= 0 && !before.slice(mapStart).includes("}")) {
    const fields = before.slice(mapStart + 1);
    // A comma inside a bracketed list belongs to the current field.
    const lastField = /(?:^|,)\s*([^:[\]{},]+):\s*([^{}]*)$/.exec(fields);
    const field = lastField && fieldSpec(inline.name, lastField[1].trim());
    if (field && !lastField[2].includes(",")) {
      const typed = lastField[2];
      const options = valueOptions(field.key, [inline.name, "config"], sctx);
      const tail = /^[^,}\]]*/.exec(line.text.slice(ctx.pos - line.from))?.[0] ?? "";
      if (options.length && field.type !== "multi") return {
        from: ctx.pos - typed.length,
        to: ctx.pos + tail.trimEnd().length,
        options: options.map((label) => ({ label, type: "enum" })),
        filter: !showAll,
      };
    }
    if (!field) {
      const partial = /(?:^|,)\s*([^:[\]{},]*)$/.exec(fields)?.[1];
      if (partial !== undefined) return {
        from: ctx.pos - partial.length,
        options: inline.fields.filter((field) => !fields.toLowerCase().includes(field.key.toLowerCase() + ":"))
          .map((field) => ({ label: field.key, apply: field.key + ": ", type: "property", info: field.doc })),
      };
    }
  }

  const open = before.lastIndexOf("[");
  const close = before.lastIndexOf("]");
  if (open > close) {
    const inlineKey = inline && /(?:^|,)\s*([^:,[\]{}]+):\s*$/.exec(before.slice(mapStart + 1, open))?.[1]?.trim();
    const configList = inlineKey ? fieldSpec(inline.name, inlineKey)?.options
      : kv && level === "config-fields" ? fieldSpec(anc[0], kv[1])?.options : undefined;
    const items = configList ?? (/(?:redact|Scrub|for|حجب)\s*$/i.test(before.slice(0, open))
      ? PII_ENTITIES : kv ? listOptions(kv[1], sctx) : []);
    if (items.length) {
      const list = before.slice(open + 1);
      const lastComma = list.lastIndexOf(",");
      const typed = list.slice(lastComma + 1).trimStart();
      const from = ctx.pos - typed.length;
      const rest = line.text.slice(ctx.pos - line.from);
      const tail = /^[^,\]]*/.exec(rest)?.[0] ?? "";
      const selected = list.slice(0, lastComma + 1).split(",").map((item) => item.trim());
      const append = showAll && !typed.endsWith(",") && !tail && items.includes(typed);
      return {
        from: append ? ctx.pos : from,
        to: ctx.pos + tail.length,
        options: items.filter((item) => !selected.includes(item) && (!append || item !== typed))
          .map((item) => ({ label: item, type: "enum", apply: (append ? ", " : "") + item })),
        filter: !showAll,
      };
    }
  }

  if (kv && level !== "rules" && level !== "steps") {
    const typed = kv[2];
    const block = !typed && !tailOfLine.trim() && canSeedBlock(lines, line.number - 1, indent) ? sectionBlock(kv[1], sctx) : null;
    if (block && !showAll) return {
      from: ctx.pos,
      options: [{
        label: `Start ${kv[1]}`,
        apply: indentSuggestion("\n" + block.join("\n"), indent),
        detail: "insert an editable example",
      }],
    };
    if (typed.startsWith("[") && typed.includes("]") && !showAll) return null;
    const opts = valueOptions(level === "stage" && keywordId(kv[1]) === "on breach" && typed ? "Escalate To" : kv[1], anc, sctx);
    if (!opts.length) return null;
    return {
      from: ctx.pos - typed.length,
      to: line.to,
      options: opts.map((o, i) => ({ label: o, apply: (before.endsWith(":") ? " " : "") + o, type: "text", boost: -i, detail: i === 0 ? "suggested" : undefined })),
      filter: !showAll,
    };
  }
  // Start of an item / key
  const head = /^\s*(-(?:\s+|$))?([^:]*)$/.exec(before);
  if (!head) return null;

  const from = ctx.pos - head[2].length;
  const dash = head[1] ?? "";
  const item = (value: string) => dash ? (dash === "-" ? " " : "") + value : "- " + value;
  const blockItem = (block: string[]) => indentSuggestion([item(block[0].replace(/^- /, "")), ...block.slice(1)].join("\n"), indent);
  if (level === "rules") {
    const ms = lastMs(sctx);
    const typed = head[2].toLowerCase();
    const matching = RULE_TEMPLATES.filter((rule) => rule.text.toLowerCase().startsWith(typed));
    const prose = !!typed && matching.length > 0;
    return {
      from,
      to: line.to,
      options: (prose && !showAll ? matching : RULE_TEMPLATES).map((r) => {
        const rule = r.text.replace("${Milestone}", ms);
        return { label: r.label, apply: item(rule), detail: r.detail, type: "function", info: rule };
      }),
      filter: !showAll && !prose,
    };
  }
  if (level === "steps") {
    return { from, to: line.to, options: STEP_TEMPLATES.map((st) => ({ label: st, apply: item(st), type: "method", detail: classifyStep(st).map((k) => KIND_META[k.kind].engine).join(" ") })) };
  }
  if (level === "lane-name" || level === "cf-name") {
    const names = level === "lane-name" ? ["Case Owner", "Head of Compliance", "Compliance Reviewer"] : ["Policy Documents", "Evidence File"];
    const used = siblingKeys(lines, line.number - 1, indent);
    return { from, to: line.to, options: names.filter((name) => !used.has(keywordId(name))).map((name) => ({
      label: name,
      apply: indentSuggestion((level === "lane-name" ? laneBlock(name) : [name + ":", '  Source: pdf("documents.pdf")']).join("\n"), indent),
      type: "class",
    })) };
  }
  if (level === "subcases")
    return sctx.subcaseBudget?.tokens === 0 ? null : { from, to: line.to, options: [{ label: "Subcase", apply: blockItem(subcaseBlock(sctx)), type: "class" }] };
  if (level === "proposals")
    return { from, to: line.to, options: [{ label: "Suggest policy review", apply: blockItem([proposalText(sctx)]), type: "class" }] };
  if (level === "other") return null;
  if (level === "process") {
    const previous = sctx.stages?.filter((stage) => stage.line < line.number).at(-1)?.milestone;
    const block = stageBlock(sctx, previous ?? null);
    return {
      from,
      to: line.to,
      options: [{ label: block[0].slice(2, -1), apply: blockItem(block), type: "class", detail: "add a stage with a trigger and milestone" }],
    };
  }
  const present = siblingKeys(lines, line.number - 1, indent);
  const opts = keyCompletions(level, anc, ar).filter((option) => !present.has(keywordId(option.label))
    && !(res.root && keywordId(option.label) === "case")).map((option) => {
    const key = translateKey(option.label);
    return { ...option, apply: indentSuggestion(option.label + keyLine(key, level, anc, sctx), indent) };
  });
  if (!res.root && level === "top") {
    return { from, options: opts.filter((option) => translateKey(option.label) === "Case").map((option) => ({
      ...option, apply: option.label + ": My Business Case",
    })) };
  }
  const prefix = head[2].trim().toLowerCase();
  return { from, to: line.to, filter: false, options: prefix && !showAll ? opts.filter((option) => option.label.toLowerCase().startsWith(prefix)) : opts };
}

// ------------------------------------------------------------------ hover
function pickList(view: EditorView, options: string[], from: number, to: number, current: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "cs-pick";
  for (const o of options.slice(0, 12)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = o;
    if (o === current) b.className = "on";
    b.onmousedown = (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from, to, insert: o }, userEvent: "input.pick" });
      view.focus();
    };
    wrap.appendChild(b);
  }
  return wrap;
}

const hover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const res = compiledFor(view.state);
  const lines = docLines(view.state);
  const sctx = contextFrom(res, line.number, lines);
  const dom = document.createElement("div");
  dom.className = "cs-hover";
  const k = lineKey(line.text);
  const rule = res.cases.flatMap((c) => c.rules).find((r) => r.line === line.number && !r.inherited);
  if (rule) {
    dom.innerHTML =
      `<div class="cs-hover-k">${rule.modality} · gate before <b>${rule.milestone}</b></div>` +
      `<pre class="cs-hover-lean">${escapeHtml(rule.lean)}</pre>` +
      `<div class="cs-hover-sub">Z3: <code>${escapeHtml(rule.smt2)}</code></div>` +
      (rule.clauses.length ? `<div class="cs-hover-sub">Runtime probes: ${rule.clauses.map((c) => `<code>${escapeHtml(clauseText(c))}</code>`).join(" ")}</div>` : `<div class="cs-hover-warn">Not formalised — rephrase as a comparison.</div>`);
    return { pos: line.from, end: line.to, above: true, create: () => ({ dom }) };
  }
  const step = res.cases.flatMap((c) => c.stages.flatMap((s) => s.steps)).find((s) => s.line === line.number);
  if (step) {
    const kinds = classifyStep(step.norm);
    if (!kinds.length) return null;
    dom.innerHTML =
      `<div class="cs-hover-k">Compiled to</div>` +
      kinds.map((x) => `<div class="cs-hover-row"><b>${KIND_META[x.kind].label}</b> <code>${KIND_META[x.kind].engine}</code><br><span>${KIND_META[x.kind].doc}</span></div>`).join("");
    return { pos: line.from, end: line.to, above: true, create: () => ({ dom }) };
  }
  if (!k) return null;
  const dash = line.text.trimStart().startsWith("-") ? 2 : 0;
  const keyStart = line.from + k.indent + dash;
  const keyEnd = keyStart + k.key.length;
  const anc = ancestorsAt(lines, line.number - 1, k.indent);
  const level = levelOf(anc);
  const valueStart = line.text.indexOf(":", k.indent + dash) + 1;
  const rawValue = line.text.slice(valueStart).trim();
  // Hover on the value: alternatives you can click (Visual Studio quick-pick).
  if (pos > keyEnd && rawValue && !rawValue.startsWith("{")) {
    const opts = valueOptions(k.key, anc, sctx);
    if (listOptions(k.key, sctx).length || opts.length < 2) return null;
    const from = line.from + valueStart + (line.text.slice(valueStart).length - line.text.slice(valueStart).trimStart().length);
    const fs = level === "config-fields" ? fieldSpec(anc[0], k.key) : undefined;
    const head = document.createElement("div");
    head.className = "cs-hover-k";
    head.innerHTML = `<b>${escapeHtml(k.key)}</b> · click an alternative${fs ? ` · ${escapeHtml(fs.doc)}` : ""}`;
    dom.appendChild(head);
    dom.appendChild(pickList(view, opts, from, line.to, rawValue));
    return { pos: from, end: line.to, above: true, create: () => ({ dom }) };
  }
  if (pos > keyEnd + 1) return null;
  const en = translateKey(k.key);
  const doc = KEYWORDS.find((d) => normKey(d.key) === normKey(en));
  const comp = level === "config" ? componentSpec(k.key) : undefined;
  const fs = level === "config-fields" ? fieldSpec(anc[0], k.key) : undefined;
  if (doc) {
    dom.innerHTML =
      `<div class="cs-hover-k"><b>${escapeHtml(doc.key)}</b>${doc.ar ? ` · <span lang="ar">${doc.ar}</span>` : ""}</div>` +
      (doc.std ? `<div class="cs-hover-std">${escapeHtml(doc.std)}</div>` : "") +
      `<div>${escapeHtml(doc.doc)}</div>`;
  } else if (comp) {
    dom.innerHTML = `<div class="cs-hover-k"><b>${escapeHtml(comp.name)}</b> · component</div><div>${escapeHtml(comp.doc)}</div><div class="cs-hover-sub">Fields: ${comp.fields.map((f) => `<code>${escapeHtml(f.key)}</code>`).join(" ")}</div>`;
  } else if (fs) {
    dom.innerHTML = `<div class="cs-hover-k"><b>${escapeHtml(fs.key)}</b> · ${fs.type}${fs.type === "number" ? ` ${fs.min}–${fs.max}` : ""} · default <code>${escapeHtml(formatValue(fs.default))}</code></div><div>${escapeHtml(fs.doc)}</div>`;
  } else return null;
  // Other keys that fit here — click to add one below.
  const present = siblingKeys(lines, line.number - 1, k.indent);
  const siblings = keyCompletions(level, anc, res.language === "ar").map((option) => option.label)
    .filter((key) => !present.has(keywordId(key)) && keywordId(key) !== keywordId(en) && keywordId(key) !== "case");
  if (siblings.length) {
    const lab = document.createElement("div");
    lab.className = "cs-hover-sub";
    lab.textContent = "Also available here — click to add:";
    dom.appendChild(lab);
    const wrap = document.createElement("div");
    wrap.className = "cs-pick";
    for (const sib of siblings.slice(0, 10)) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = sib;
      b.onmousedown = (e) => {
        e.preventDefault();
        const lines = docLines(view.state);
        let after = line.number;
        while (after < lines.length && lines[after].trim() && indentOf(lines[after]) > k.indent) after++;
        const from = view.state.doc.line(after).to;
        const insert = "\n" + " ".repeat(k.indent) + indentSuggestion(sib + keyLine(translateKey(sib), level, anc, sctx), k.indent);
        view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length }, userEvent: "input.complete" });
        view.focus();
      };
      wrap.appendChild(b);
    }
    dom.appendChild(wrap);
  }
  return { pos: keyStart, end: keyEnd, above: true, create: () => ({ dom }) };
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// ------------------------------------------------------------------ lint
const intentEndpoint = import.meta.env.VITE_CASESPINE_INTENT_ENDPOINT?.trim();

function isModelIntent(value: unknown): value is { command?: string; choice?: string | null } {
  return !!value && typeof value === "object" && (("command" in value && typeof value.command === "string")
    || ("choice" in value && (value.choice === null || typeof value.choice === "string")));
}

function applyEditorRepair(view: EditorView, snapshot: string, repair: Repair) {
  if (view.state.doc.toString() !== snapshot) return;
  const changes = view.state.changes([repair, ...(repair.more ?? [])].map((edit) => {
    const line = view.state.doc.line(edit.line);
    return { from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert };
  }));
  const to = view.state.doc.line(repair.line).from + repair.to;
  view.dispatch({
    changes,
    selection: { anchor: changes.mapPos(to, 1) },
    scrollIntoView: true,
    userEvent: "input.complete",
  });
  if (repair.targetLine) goToKeyword(view, repair.targetLine);
  view.focus();
}

function draftDiagnostic(state: EditorState, snapshot: string, issue: DraftIssue, severity: CMDiagnostic["severity"]): CMDiagnostic {
  const line = state.doc.line(issue.line);
  const repairs = issue.repairs.map((repair) => ({
    name: repair.label,
    apply: (view: EditorView) => applyEditorRepair(view, snapshot, repair),
  }));
  if (issue.targetLine && !repairs.length) repairs.push({
    name: "Go to existing block",
    apply: (view) => { if (view.state.doc.toString() === snapshot) goToKeyword(view, issue.targetLine!); },
  });
  if (issue.ambiguous) repairs.push({
    name: "Keep as a # comment",
    apply: (view) => applyEditorRepair(view, snapshot, {
      label: "Keep as a # comment", line: issue.line, from: 0, to: line.length, insert: commentFragment(line.text),
    }),
  });
  if (!repairs.length) repairs.push({
    name: "Show suggestions",
    apply: (view) => {
      if (view.state.doc.toString() !== snapshot) return;
      view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true });
      view.focus();
      openOptions(view);
    },
  });
  const diagnostic: CMDiagnostic = {
    from: line.from + issue.from,
    to: line.from + issue.to,
    severity,
    markClass: issue.ambiguous ? "cs-unrecognized" : "cs-unfinished",
    message: issue.message,
    source: "CaseSpine",
    actions: repairs,
  };
  if (intentEndpoint && issue.ambiguous && line.text.trim().length <= 400) {
    const endpoint = intentEndpoint;
    const choices = intentChoices(snapshot, issue.line, contextFrom(compiledFor(state), issue.line, snapshot.split("\n")));
    diagnostic.renderMessage = (view) => {
      const wrap = document.createElement("span");
      wrap.className = "cs-intent";
      const message = document.createElement("span");
      message.textContent = issue.message;
      const ask = document.createElement("button");
      ask.type = "button";
      ask.className = "cm-diagnosticAction";
      ask.textContent = "Ask AI about this line";
      const status = document.createElement("span");
      status.className = "cs-intent-status";
      status.setAttribute("role", "status");
      ask.onclick = async () => {
        if (ask.disabled || view.state.doc.toString() !== snapshot) return;
        ask.disabled = true;
        status.textContent = "Checking this fragment…";
        const fragment = line.text.trim();
        const answer = await requestLiveModel(endpoint, {
          fragment, options: choices.map(({ id, label }) => ({ id, label })),
        });
        if (view.state.doc.toString() !== snapshot || !wrap.isConnected) return;
        const online = isModelIntent(answer);
        let draft: IntentDraft | null = null;
        if (online) {
          if (answer.command) draft = draftIntent(snapshot, issue.line, answer.command);
          const choice = choices.find((option) => option.id === answer.choice);
          const repair = !draft && choice ? validatedIntentRepair(snapshot, issue.line, choice) : null;
          if (repair) {
            const source = applyRepair(snapshot, repair);
            draft = { line: issue.line, text: repair.insert, source, compiled: compileSpec(source) };
          }
        } else draft = draftLocalFallback(snapshot, issue.line, fragment);
        if (draft) {
          view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true });
          view.focus();
          showIntentDraft(view, draft);
        } else {
          status.textContent = online
            ? "No reliable CaseSpine interpretation. Keep the text as a comment."
            : "Live model unavailable. You can keep this line as a comment.";
          ask.disabled = online;
        }
      };
      const note = document.createElement("small");
      note.textContent = "Sends only this line and the available choices. Use demo text.";
      wrap.append(message, ask, note, status);
      return wrap;
    };
  }
  return diagnostic;
}

const lint = linter(
  (view) => {
    const res = compiledFor(view.state);
    const snapshot = view.state.doc.toString();
    const lines = snapshot.split("\n");
    const drafts = collectDraftIssues(snapshot, res, (line) => contextFrom(res, line, lines));
    const errors = new Set(res.diagnostics.filter((d) => d.severity === "error").map((d) => d.line));
    const previewLine = currentDraft(view.state)?.line;
    const repairedLines = new Set(drafts.map((issue) => issue.line));
    const out: CMDiagnostic[] = [];
    for (const d of res.diagnostics) {
      if (d.line < 1 || d.line > view.state.doc.lines || d.line === previewLine) continue;
      if (repairedLines.has(d.line)) continue;
      const l = view.state.doc.line(d.line);
      if (!l.text.trim()) continue;
      const start = l.from + (l.text.length - l.text.trimStart().length);
      out.push({ from: start, to: l.to, severity: d.severity, message: d.message, source: "casespine" });
    }
    return out.concat(drafts.filter((issue) => issue.line !== previewLine)
      .map((issue) => draftDiagnostic(view.state, snapshot, issue, errors.has(issue.line) || issue.ambiguous ? "error" : "warning")));
  },
  { delay: 130, needsRefresh: (update) => currentDraft(update.state) !== currentDraft(update.startState) },
);

export function caseSpineLanguage(): Extension[] {
  return [
    casespineStream,
    syntaxHighlighting(highlight),
    indentService.of((context, pos) => {
      const line = context.state.doc.lineAt(pos);
      const before = line.text.slice(0, pos - line.from);
      if (context.simulatedBreak !== pos || !before.trimEnd().endsWith(":") || /^\s*#/.test(before)) return null;
      return indentOf(before) + (/^\s*-\s+Stage\b/i.test(before) ? 4 : 2);
    }),
    autocompletion({ override: [caseSpineCompletions], activateOnTyping: true, activateOnTypingDelay: 65, icons: false }),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || !update.view.hasFocus) return;
      const { head } = update.state.selection.main;
      const line = update.state.doc.lineAt(head);
      const before = line.text.slice(0, head - line.from);
      if (!/(?:[:[,]|^\s*-?)\s*$/.test(before)) return;
      if (/^\s*$/.test(before) && !before.length) return;
      const block = lineKey(before);
      if (block && before.trimEnd().endsWith(":") && sectionBlock(block.key, contextFrom(compiledFor(update.state), line.number))) return;
      const state = update.state;
      requestAnimationFrame(() => {
        if (update.view.state === state && update.view.hasFocus) startCompletion(update.view);
      });
    }),
    hover,
    lint,
    lintGutter(),
    ...ghostText(compiledFor),
    dropdowns(compiledFor),
    rtlLines(),
    EditorView.perLineTextDirection.of(true),
  ];
}
