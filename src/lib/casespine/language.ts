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
import { KEYWORDS, PII_ENTITIES, RULE_TEMPLATES, STEP_TEMPLATES, VALUE_SUGGESTIONS, type KeywordDoc } from "./vocab";
import type { CompileResult } from "./types";

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

function ancestors(state: EditorState, lineNo: number, indent: number): string[] {
  const out: string[] = [];
  let cur = indent;
  for (let n = lineNo - 1; n >= 1 && cur > 0; n--) {
    const text = state.doc.line(n).text;
    if (!text.trim() || /^\s*#/.test(text)) continue;
    const ind = text.length - text.trimStart().length;
    if (ind < cur) {
      const k = lineKey(text);
      out.push(k ? normKey(translateKey(k.key)) : normKey(text.trim().replace(/^-\s*/, "")));
      cur = ind;
    }
  }
  return out;
}

const AR_TO_EN = new Map(KEYWORDS.filter((k) => k.ar).map((k) => [k.ar!, k.key]));
function translateKey(k: string) {
  return AR_TO_EN.get(k) ?? k;
}

function levelFor(anc: string[]): KeywordDoc["level"] | "rules" | "steps" | "lane-name" | "cf-name" | null {
  const p = anc[0] ?? "";
  const gp = anc[1] ?? "";
  if (!anc.length) return "top";
  if (p.startsWith("rules")) return "rules";
  if (p === "steps") return "steps";
  if (p === "binding lean contract") return "contract";
  if (p === "cost & traffic guards") return "guards";
  if (p.startsWith("exit gateway")) return "gateway";
  if (p === "deployment") return "deployment";
  if (/^stage \d+/.test(p)) return "stage";
  if (p === "on breach") return "stage";
  if (gp === "lanes") return "lane";
  if (gp === "case file") return "case-file";
  if (p === "lanes") return "lane-name";
  if (p === "case file") return "cf-name";
  if (/^subcase\b/.test(p)) return "top";
  return null;
}

function keyCompletions(level: string, ar: boolean): Completion[] {
  return KEYWORDS.filter((k) => k.level === level).map((k) => ({
    label: ar && k.ar ? k.ar : k.key,
    apply: (ar && k.ar ? k.ar : k.key) + ": ",
    type: "keyword",
    detail: k.std ?? (ar ? k.key : k.ar),
    info: k.doc,
    boost: level === "top" ? 1 : 0,
  }));
}

function caseSpineCompletions(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const indent = before.length - before.trimStart().length;
  const res = compiledFor(ctx.state);
  const ar = res.language === "ar";
  const anc = ancestors(ctx.state, line.number, indent);
  const level = levelFor(anc);
  const milestones = [...new Set(res.cases.flatMap((c) => c.stages.map((s) => s.milestone)))];
  const lanes = [...new Set(res.cases.flatMap((c) => c.lanes.map((l) => l.name)))];

  // Milestone names anywhere after "Milestone "
  const msm = /(Milestone|المعلم)\s+(\w*)$/.exec(before);
  if (msm) {
    return {
      from: ctx.pos - msm[2].length,
      options: [...milestones, "IndexReady", "InquiryResolved", "ReleaseApproved"]
        .filter((v, i, a) => a.indexOf(v) === i)
        .map((m) => ({ label: m, type: "constant", detail: milestones.includes(m) ? "reached in this case" : "new" })),
    };
  }
  // PII entities inside [ ... ] after redact / PII phrases
  const ent = /(redact|Scrub|for|حجب)\s*\[([^\]]*?)(\w*)$/i.exec(before);
  if (ent) {
    return { from: ctx.pos - ent[3].length, options: PII_ENTITIES.map((e) => ({ label: e, type: "enum", detail: "PII entity" })) };
  }
  // Value position: "Key: value"
  const kv = /^\s*(?:-\s+)?([^:"'[{#\s][^:]*?):\s+(.*)$/.exec(before);
  if (kv && !(level === "rules" || level === "steps")) {
    const key = normKey(translateKey(kv[1].trim()));
    const typed = kv[2];
    if (key === "escalate to")
      return { from: ctx.pos - typed.length, options: lanes.map((l) => ({ label: l, type: "variable", detail: "Lane" })) };
    if (key === "reach milestone")
      return { from: ctx.pos - typed.length, options: milestones.map((l) => ({ label: l, type: "constant" })) };
    const sugg = VALUE_SUGGESTIONS[key];
    if (sugg) return { from: ctx.pos - typed.length, options: sugg.map((s) => ({ label: s, type: "text" })), filter: true };
    return null;
  }
  // Start of an item / key
  const head = /^\s*(-\s+)?([^:]*)$/.exec(before);
  if (!head) return null;
  if (!ctx.explicit && head[2].length === 0 && !head[1]) return null;
  const from = ctx.pos - head[2].length;
  if (level === "rules") {
    const ms = milestones[milestones.length - 1] ?? "InquiryResolved";
    return {
      from,
      options: RULE_TEMPLATES.map((r) =>
        snippetCompletion(r.text.replace("${Milestone}", "${" + ms + "}"), {
          label: r.label,
          detail: r.detail,
          type: "function",
          info: "SBVR rule → Lean 4 proposition",
        }),
      ),
      filter: true,
    };
  }
  if (level === "steps") {
    return { from, options: STEP_TEMPLATES.map((s) => ({ label: s, type: "method", detail: classifyStep(s).map((k) => KIND_META[k.kind].engine).join(" ") })) };
  }
  if (level === "lane-name" || level === "cf-name") return null;
  if (!level) return null;
  const opts = keyCompletions(level, ar);
  if (level === "top" && anc.length === 0) {
    opts.push(
      snippetCompletion("- Stage ${1} (${Name}):\n      When: ${trigger}\n      Steps:\n        - ${step}\n      Reach Milestone: ${Milestone}", {
        label: "Stage (template)",
        type: "class",
        detail: "BPMN SubProcess",
      }),
    );
  }
  if (anc[0] === "process flow") {
    return {
      from,
      options: [
        snippetCompletion("Stage ${1} (${Name}):\n      When: ${trigger}\n      Steps:\n        - ${step}\n      Reach Milestone: ${Milestone}", { label: "Stage", type: "class", detail: "BPMN SubProcess" }),
      ],
    };
  }
  return { from, options: opts, validFor: /^[\w &()؀-ۿ-]*$/ };
}

// ------------------------------------------------------------------ hover
const hover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const res = compiledFor(view.state);
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
  if (k) {
    const keyStart = line.from + k.indent + (line.text.trimStart().startsWith("-") ? 2 : 0);
    if (pos > keyStart + k.key.length + 1) return null;
    const en = translateKey(k.key);
    const doc = KEYWORDS.find((d) => normKey(d.key) === normKey(en));
    if (!doc) return null;
    dom.innerHTML =
      `<div class="cs-hover-k"><b>${escapeHtml(doc.key)}</b>${doc.ar ? ` · <span lang="ar">${doc.ar}</span>` : ""}</div>` +
      (doc.std ? `<div class="cs-hover-std">${escapeHtml(doc.std)}</div>` : "") +
      `<div>${escapeHtml(doc.doc)}</div>`;
    return { pos: keyStart, end: keyStart + k.key.length, above: true, create: () => ({ dom }) };
  }
  return null;
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
    EditorView.perLineTextDirection.of(true),
  ];
}
