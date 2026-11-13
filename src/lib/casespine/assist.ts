// Editor assistance: Copilot-style ghost text (Tab accepts, Esc dismisses) and
// Visual-Studio-style ▾ dropdowns on every value that has a vocabulary.

import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { draftIntent, type IntentDraft } from "./intent";
import { acceptCompletion, closeCompletion, completionStatus, selectedCompletionIndex, startCompletion } from "@codemirror/autocomplete";
import { componentSpec } from "./configSchema";
import { checkedRepair, keywordHelp, type KeywordHelp, type Repair } from "./repairs";
import { buildTree } from "./tree";
import { compileSpec } from "./analyze";
import type { CompileResult } from "./types";
import { ancestorsAt, contextForCase, indentOf, indentSuggestion, listOptions, translateKey, suggestContinuation, valueOptions, type SuggestContext } from "./suggest";

export function contextFrom(res: CompileResult, line?: number, lines?: string[]): SuggestContext {
  const contains = (item: { line: number; endLine: number }) => line !== undefined && item.line <= line
    && (line <= item.endLine || (lines && indentOf(lines[line - 1]) > indentOf(lines[item.line - 1])
      && lines.slice(item.endLine, line - 1).every((text) => !text.trim() || /^\s*#/.test(text))));
  const c = [...res.cases].reverse().find(contains) ?? res.root;
  return contextForCase(c, c?.stages.find(contains));
}

// ------------------------------------------------------------------ ghost text
interface Ghost {
  pos: number;
  text: string;
  draft?: IntentDraft;
  keyword?: KeywordHelp;
}
const setGhost = StateEffect.define<Ghost | null>();
const ignoreDraft = StateEffect.define<number>();
const dismissedDraft = StateField.define<number | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(ignoreDraft)) return effect.value;
    return transaction.docChanged ? null : value;
  },
});

export function showIntentDraft(view: EditorView, draft: IntentDraft, keyword?: KeywordHelp) {
  view.dispatch({ effects: setGhost.of({ pos: view.state.doc.line(draft.line).to, text: draft.text, draft, keyword }) });
}

export const currentDraft = (state: EditorState) => state.field(ghostField, false)?.draft ?? null;

export function acceptIntentDraft(view: EditorView) {
  const draft = currentDraft(view.state);
  if (!draft) return false;
  const source = view.state.doc.toString();
  return applySourcePreview(view, source, draft.source);
}

function applySourcePreview(view: EditorView, source: string, replacement: string) {
  let from = 0;
  while (from < source.length && source[from] === replacement[from]) from++;
  let end = source.length, nextEnd = replacement.length;
  while (end > from && nextEnd > from && source[end - 1] === replacement[nextEnd - 1]) {
    end--;
    nextEnd--;
  }
  view.dispatch({ changes: { from, to: end, insert: replacement.slice(from, nextEnd) }, selection: { anchor: nextEnd },
    scrollIntoView: true, effects: setGhost.of(null), userEvent: "input.complete" });
  return true;
}

export function dismissIntentDraft(view: EditorView) {
  const draft = currentDraft(view.state);
  if (!draft) return false;
  view.dispatch({ effects: [setGhost.of(null), ignoreDraft.of(draft.line)] });
  return true;
}

export function goToKeyword(view: EditorView, line: number) {
  closeCompletion(view);
  const target = view.state.doc.line(line);
  view.dispatch({ selection: { anchor: target.to }, scrollIntoView: true, effects: [setGhost.of(null), ignoreDraft.of(line)] });
  view.focus();
}

export function applyEditorRepair(view: EditorView, snapshot: string, repair: Repair) {
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
  view.focus();
}

export function useKeywordHelp(view: EditorView, help: KeywordHelp, snapshot: string) {
  if (view.state.doc.toString() !== snapshot) return;
  if (help.targetLine) goToKeyword(view, help.targetLine);
  else if (help.repair && checkedRepair(snapshot, compileSpec(snapshot), help.repair)) applyEditorRepair(view, snapshot, help.repair);
}

class GhostWidget extends WidgetType {
  constructor(readonly text: string, readonly rewrite: boolean = false) {
    super();
  }
  eq(o: GhostWidget) {
    return o.text === this.text && o.rewrite === this.rewrite;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.rewrite ? "cm-ghost cm-ghost-rewrite" : "cm-ghost";
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    const hint = document.createElement("span");
    hint.className = "cm-ghost-hint";
    hint.textContent = "Tab / →";
    span.appendChild(hint);
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

const ghostField = StateField.define<Ghost | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setGhost)) return e.value;
    if (tr.docChanged || tr.selection) return null;
    return v;
  },
  provide: (field) => EditorView.decorations.compute([field], (state) => {
    const g = state.field(field);
    if (!g) return Decoration.none;
    const widget = new GhostWidget(g.text, !!g.draft);
    if (!g.draft || g.draft.append) return Decoration.set([Decoration.widget({ widget, side: 1 }).range(g.pos)]);
    const line = state.doc.line(g.draft.line);
    const start = line.from + indentOf(line.text);
    return Decoration.set([start === line.to ? Decoration.widget({ widget, side: 1 }).range(start) : Decoration.replace({ widget }).range(start, line.to)]);
  }),
});

export function ghostText(getCompiled: (s: EditorState) => CompileResult): Extension[] {
  const plugin = ViewPlugin.fromClass(
    class {
      timer = 0;
      constructor(readonly view: EditorView) {}
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.focusChanged) {
          clearTimeout(this.timer);
          this.timer = window.setTimeout(() => this.compute(), 110);
        }
      }
      compute() {
        const v = this.view;
        const st = v.state;
        const sel = st.selection.main;
        if (currentDraft(st)) return;
        if (!sel.empty || !v.hasFocus) {
          if (st.field(ghostField)) v.dispatch({ effects: setGhost.of(null) });
          return;
        }
        const line = st.doc.lineAt(sel.head);
        if (st.field(dismissedDraft) === line.number) return;
        const source = st.doc.toString();
        const lines = source.split("\n");
        const compiled = getCompiled(st);
        const context = contextFrom(compiled, line.number, lines);
        if (sel.head === line.to && /^\s*(?:(?:hey|please|can you|could you)[,!]?\s+)*(?:add|create|insert|start|set|escalate|route)\s+/i.test(line.text)) {
          const draft = draftIntent(source, line.number);
          if (draft) {
            showIntentDraft(v, draft);
            return;
          }
        }
        if (sel.head === line.to) {
          const suggestion = keywordHelp(lines, line.number, context, () => buildTree(compiled.normalized))[0];
          if (suggestion?.repair) {
            const edit = checkedRepair(source, compiled, suggestion.repair);
            if (edit && suggestion.continuation) {
              const preview = indentSuggestion(suggestion.continuation, indentOf(line.text));
              v.dispatch({ effects: setGhost.of({ pos: sel.head, text: preview, keyword: suggestion }) });
            } else if (edit) showIntentDraft(v, { line: line.number, text: suggestion.preview, ...edit }, suggestion);
            return;
          }
        }
        let text = suggestContinuation(source, sel.head, context);
        if (text) text = indentSuggestion(text, line.text.length - line.text.trimStart().length);
        if (text) {
          const position = sel.head - line.from;
          const repair = { line: line.number, from: position, to: position, insert: text, label: "Continue typing" };
          if (!checkedRepair(source, compiled, repair)) text = null;
        }
        const cur = st.field(ghostField);
        if ((cur?.text ?? null) === text && cur?.pos === sel.head) return;
        v.dispatch({ effects: setGhost.of(text ? { pos: sel.head, text } : null) });
      }
      destroy() {
        clearTimeout(this.timer);
      }
    },
  );
  const accept = (view: EditorView) => {
    const g = view.state.field(ghostField, false);
    if (g?.keyword) {
      if ((selectedCompletionIndex(view.state) ?? 0) > 0) {
        acceptCompletion(view);
        return true;
      }
      closeCompletion(view);
      useKeywordHelp(view, g.keyword, view.state.doc.toString());
      return true;
    }
    if (acceptIntentDraft(view)) return true;
    if (completionStatus(view.state) === "active" && acceptCompletion(view)) return true;
    if (!g) return false;
    view.dispatch({ changes: { from: g.pos, insert: g.text }, selection: { anchor: g.pos + g.text.length }, effects: setGhost.of(null), userEvent: "input.complete" });
    return true;
  };
  const acceptWord = (view: EditorView) => {
    const g = view.state.field(ghostField, false);
    if (!g || g.draft) return false;
    const m = /^\s*\S+/.exec(g.text);
    const chunk = m ? m[0] : g.text;
    view.dispatch({ changes: { from: g.pos, insert: chunk }, selection: { anchor: g.pos + chunk.length }, effects: setGhost.of(null) });
    return true;
  };
  const acceptRight = (view: EditorView) => {
    const selection = view.state.selection.main;
    const ghost = view.state.field(ghostField, false);
    return selection.empty && selection.head === view.state.doc.lineAt(selection.head).to
      && (ghost?.pos === selection.head || completionStatus(view.state) === "active") && accept(view);
  };
  const dismiss = (view: EditorView) => {
    const completion = closeCompletion(view);
    if (dismissIntentDraft(view)) return true;
    const ghost = view.state.field(ghostField, false);
    if (!ghost) return completion;
    view.dispatch({ effects: [setGhost.of(null), ignoreDraft.of(view.state.doc.lineAt(ghost.pos).number)] });
    return true;
  };
  return [
    ghostField,
    dismissedDraft,
    plugin,
    Prec.highest(keymap.of([{ key: "Tab", run: accept }, { key: "ArrowRight", run: acceptRight }, { key: "Mod-ArrowRight", run: acceptWord }, { key: "Escape", run: dismiss }])),
  ];
}

// ------------------------------------------------------------------ ▾ dropdowns
const unfiltered = new WeakSet<EditorView>();

export function openOptions(view: EditorView) {
  unfiltered.add(view);
  if (!startCompletion(view)) unfiltered.delete(view);
}

export function takeUnfilteredOptions(view: EditorView | undefined): boolean {
  return view ? unfiltered.delete(view) : false;
}

class DropWidget extends WidgetType {
  constructor(readonly cursor: number, readonly label: string) {
    super();
  }
  eq(o: DropWidget) {
    return o.cursor === this.cursor && o.label === this.label;
  }
  toDOM(view: EditorView) {
    const b = document.createElement("button");
    b.className = "cm-drop";
    b.type = "button";
    b.textContent = "▾";
    b.title = `Show options for ${this.label}`;
    b.setAttribute("aria-label", b.title);
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => {
      view.focus();
      view.dispatch({ selection: { anchor: this.cursor } });
      openOptions(view);
    };
    return b;
  }
  ignoreEvent() {
    return false;
  }
}

const KV_RE = /^(\s*)(-\s+)?([^:"'[{#\s][^:]*?):(?:\s*(.*))$/;

export function dropdowns(getCompiled: (s: EditorState) => CompileResult): Extension {
  const build = (view: EditorView): DecorationSet => {
    const st = view.state;
    const compiled = getCompiled(st);
    const lines = st.doc.toString().split("\n");
    const out = [];
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = st.doc.lineAt(pos);
        const m = KV_RE.exec(line.text);
        if (m) {
          const ctx = contextFrom(compiled, line.number, lines);
          const anc = ancestorsAt(lines, line.number - 1, m[1].length);
          const key = m[3];
          const list = listOptions(key, ctx).length > 0 || /^(?:curation)$/i.test(translateKey(key));
          const close = list ? line.text.lastIndexOf("]") : -1;
          const cursor = close >= 0 ? line.from + close : line.to;
          const component = anc[0] === "config" && m[4].startsWith("{") ? componentSpec(key) : undefined;
          if (component) {
            for (const match of line.text.matchAll(/(?:\{|,)\s*([^:{},[\]]+):\s*([^,}\[]*)/g)) {
              const field = component.fields.find((field) => field.key.toLowerCase() === match[1].trim().toLowerCase());
              if (!field || !["select", "toggle", "lane"].includes(field.type)) continue;
              const end = line.from + match.index + match[0].trimEnd().length;
              out.push(Decoration.widget({ widget: new DropWidget(end, field.key), side: 1 }).range(end));
            }
          } else if (list || valueOptions(key, anc, ctx).length > 0) {
            out.push(Decoration.widget({ widget: new DropWidget(cursor, key), side: 1 }).range(line.to));
          }
        }
        pos = line.to + 1;
      }
    }
    return Decoration.set(out, true);
  };
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

// ------------------------------------------------------------------ Arabic lines read right-to-left
const AR_FIRST = /^[^\p{L}]*[؀-ۿ]/u;
export function rtlLines(): Extension {
  const rtl = Decoration.line({ attributes: { dir: "rtl", class: "cm-rtl" } });
  const build = (view: EditorView): DecorationSet => {
    const out = [];
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos);
        if (AR_FIRST.test(line.text.replace(/^\s*-\s+/, ""))) out.push(rtl.range(line.from));
        pos = line.to + 1;
      }
    }
    return Decoration.set(out);
  };
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
