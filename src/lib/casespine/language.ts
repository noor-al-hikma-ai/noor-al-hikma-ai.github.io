// CodeMirror 6 support for CaseSpine: highlighting, context-aware completion
// (keywords, SBVR rule templates, lanes, milestones, SSO / cloud / governance
// values), hover hints showing the compiled Lean 4 for each rule, and linting.

import { StreamLanguage, HighlightStyle, syntaxHighlighting, type StringStream } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { autocompletion, snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { hoverTooltip, EditorView } from "@codemirror/view";
import { linter, lintGutter, type Diagnostic as CMDiagnostic } from "@codemirror/lint";
import type { EditorState, Extension } from "@codemirror/state";
import { compileSpec } from "./analyze";
import { classifyStep, KIND_META } from "./graph";
import { clauseText } from "./rules";
import { normKey } from "./tree";
import { KEYWORDS, PII_ENTITIES, RULE_TEMPLATES, STEP_TEMPLATES } from "./vocab";
import type { CompileResult } from "./types";
import { COMPONENTS, componentSpec, fieldSpec, formatValue, inlineDefaults } from "./configSchema";
import { ancestorsAt, levelOf, siblingKeys, translateKey, valueOptions, type Level } from "./suggest";
import { contextFrom, dropdowns, ghostText, rtlLines, showAllOptions } from "./assist";

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
  return KEYWORDS.filter((k) => k.level === lv).map((k) => ({
    label: ar && k.ar ? k.ar : k.key,
    apply: (ar && k.ar ? k.ar : k.key) + ": ",
    type: "keyword",
    detail: k.std ?? (ar ? k.key : k.ar),
    info: k.doc,
    boost: level === "top" ? 1 : 0,
  }));
}

function caseSpineCompletions(ctx: CompletionContext): CompletionResult | null {
  const showAll = showAllOptions.next;
  showAllOptions.next = false;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const indent = before.length - before.trimStart().length;
  const res = compiledFor(ctx.state);
  const sctx = contextFrom(res);
  const ar = res.language === "ar";
  const anc = ancestorsAt(docLines(ctx.state), line.number - 1, indent);
  const level = levelOf(anc);

  // Milestone names anywhere after "Milestone "
  const msm = /(Milestone|المعلم)\s+(\w*)$/.exec(before);
  if (msm) {
    return {
      from: ctx.pos - msm[2].length,
      options: [...new Set([...sctx.milestones, "IndexReady", "InquiryResolved", "CaseResolved"])].map((m) => ({ label: m, type: "constant", detail: sctx.milestones.includes(m) ? "reached in this case" : "new" })),
    };
  }
  // PII entities inside [ ... ] after redact / PII phrases
  const ent = /(redact|Scrub|for|حجب)\s*\[([^\]]*?)(\w*)$/i.exec(before);
  if (ent) return { from: ctx.pos - ent[3].length, options: PII_ENTITIES.map((e) => ({ label: e, type: "enum", detail: "PII entity" })) };

  // Value position: "Key: value"
  const kv = /^\s*(?:-\s+)?([^:"'[{#\s][^:]*?):\s+(.*)$/.exec(before);
  if (kv && level !== "rules" && level !== "steps") {
    const typed = kv[2];
    const opts = valueOptions(kv[1], anc, sctx);
    if (!opts.length) return null;
    return {
      from: ctx.pos - typed.length,
      options: opts.map((o, i) => ({ label: o, type: "text", boost: -i, detail: i === 0 ? "suggested" : undefined })),
      filter: !showAll,
    };
  }
  // Start of an item / key
  const head = /^\s*(-\s+)?([^:]*)$/.exec(before);
  if (!head) return null;
  if (!ctx.explicit && !showAll && head[2].length === 0 && !head[1]) return null;
  const from = ctx.pos - head[2].length;
  if (level === "rules") {
    const ms = sctx.milestones[sctx.milestones.length - 1] ?? "InquiryResolved";
    return {
      from,
      options: RULE_TEMPLATES.map((r) =>
        snippetCompletion(r.text.replace("${Milestone}", "${" + ms + "}"), { label: r.label, detail: r.detail, type: "function", info: "SBVR rule → Lean 4 proposition" }),
      ),
      filter: true,
    };
  }
  if (level === "steps") {
    return { from, options: STEP_TEMPLATES.map((st) => ({ label: st, type: "method", detail: classifyStep(st).map((k) => KIND_META[k.kind].engine).join(" ") })) };
  }
  if (level === "lane-name" || level === "cf-name" || level === "other") return null;
  if (level === "process") {
    return {
      from,
      options: [
        snippetCompletion("Stage ${1} (${Name}):\n      When: ${trigger}\n      Steps:\n        - ${step}\n      Reach Milestone: ${Milestone}", { label: "Stage", type: "class", detail: "BPMN SubProcess" }),
      ],
    };
  }
  const opts = keyCompletions(level, anc, ar);
  return { from, options: opts, validFor: /^[\w &()\u0600-\u06FF-]*$/ };
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
  const sctx = contextFrom(res);
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
  const anc = ancestorsAt(docLines(view.state), line.number - 1, k.indent);
  const level = levelOf(anc);
  const valueStart = line.text.indexOf(":", k.indent + dash) + 1;
  const rawValue = line.text.slice(valueStart).trim();
  // Hover on the value: alternatives you can click (Visual Studio quick-pick).
  if (pos > keyEnd && rawValue && !rawValue.startsWith("{")) {
    const opts = valueOptions(k.key, anc, sctx);
    if (opts.length < 2) return null;
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
  const present = siblingKeys(docLines(view.state), line.number - 1, k.indent);
  const siblings = (level === "config" ? COMPONENTS.map((c) => c.name) : level === "config-fields" ? componentSpec(anc[0])?.fields.map((f) => f.key) ?? [] : KEYWORDS.filter((x) => x.level === (doc?.level ?? "")).map((x) => x.key))
    .filter((x) => !present.has(normKey(x)) && normKey(x) !== normKey(en));
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
        const ind = " ".repeat(k.indent) + (dash ? "- " : "");
        const val = level === "config" ? inlineDefaults(componentSpec(sib)!) : valueOptions(sib, anc, sctx)[0] ?? "";
        view.dispatch({ changes: { from: line.to, insert: `\n${ind}${sib}: ${val}` }, selection: { anchor: line.to + 1 + ind.length + sib.length + 2 + val.length } });
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
const lint = linter(
  (view) => {
    const res = compiledFor(view.state);
    const out: CMDiagnostic[] = [];
    for (const d of res.diagnostics) {
      if (d.line < 1 || d.line > view.state.doc.lines) continue;
      const l = view.state.doc.line(d.line);
      const start = l.from + (l.text.length - l.text.trimStart().length);
      out.push({ from: start, to: Math.max(start + 1, l.to), severity: d.severity, message: d.message, source: "casespine" });
    }
    return out;
  },
  { delay: 250 },
);

export function caseSpineLanguage(): Extension[] {
  return [
    casespineStream,
    syntaxHighlighting(highlight),
    autocompletion({ override: [caseSpineCompletions], activateOnTyping: true, icons: false }),
    hover,
    lint,
    lintGutter(),
    ...ghostText(compiledFor),
    dropdowns(compiledFor),
    rtlLines(),
    EditorView.perLineTextDirection.of(true),
  ];
}
