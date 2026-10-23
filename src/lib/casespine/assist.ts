// Editor assistance: Copilot-style ghost text (Tab accepts, Esc dismisses) and
// Visual-Studio-style ▾ dropdowns on every value that has a vocabulary.

import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { startCompletion } from "@codemirror/autocomplete";
import type { CompileResult } from "./types";
import { ancestorsAt, indentSuggestion, suggestContinuation, valueOptions, type SuggestContext } from "./suggest";

export function contextFrom(res: CompileResult): SuggestContext {
  return {
    lanes: [...new Set(res.cases.flatMap((c) => c.lanes.map((l) => l.name)))],
    milestones: [...new Set(res.cases.flatMap((c) => c.stages.map((s) => s.milestone)))],
  };
}

// ------------------------------------------------------------------ ghost text
interface Ghost {
  pos: number;
  text: string;
}
const setGhost = StateEffect.define<Ghost | null>();

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(o: GhostWidget) {
    return o.text === this.text;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-ghost";
    span.textContent = this.text;
    const hint = document.createElement("span");
    hint.className = "cm-ghost-hint";
    hint.textContent = "Tab";
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
  provide: (f) =>
    EditorView.decorations.from(f, (g) => (g ? Decoration.set([Decoration.widget({ widget: new GhostWidget(g.text), side: 1 }).range(g.pos)]) : Decoration.none)),
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
        if (!sel.empty || !v.hasFocus) {
          if (st.field(ghostField)) v.dispatch({ effects: setGhost.of(null) });
          return;
        }
        const line = st.doc.lineAt(sel.head);
        let text = suggestContinuation(st.doc.toString(), sel.head, contextFrom(getCompiled(st)));
        if (text) text = indentSuggestion(text, line.text.length - line.text.trimStart().length);
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
    if (!g) return false;
    view.dispatch({ changes: { from: g.pos, insert: g.text }, selection: { anchor: g.pos + g.text.length }, effects: setGhost.of(null), userEvent: "input.complete" });
    return true;
  };
  const acceptWord = (view: EditorView) => {
    const g = view.state.field(ghostField, false);
    if (!g) return false;
    const m = /^\s*\S+/.exec(g.text);
    const chunk = m ? m[0] : g.text;
    view.dispatch({ changes: { from: g.pos, insert: chunk }, selection: { anchor: g.pos + chunk.length }, effects: setGhost.of(null) });
    return true;
  };
  const dismiss = (view: EditorView) => {
    if (!view.state.field(ghostField, false)) return false;
    view.dispatch({ effects: setGhost.of(null) });
    return true;
  };
  return [
    ghostField,
    plugin,
    Prec.highest(keymap.of([{ key: "Tab", run: accept }, { key: "Mod-ArrowRight", run: acceptWord }, { key: "Escape", run: dismiss }])),
  ];
}

// ------------------------------------------------------------------ ▾ dropdowns
/** When set, the next completion request lists every option (no filtering). */
export const showAllOptions = { next: false };

class DropWidget extends WidgetType {
  constructor(readonly lineEnd: number) {
    super();
  }
  eq(o: DropWidget) {
    return o.lineEnd === this.lineEnd;
  }
  toDOM(view: EditorView) {
    const b = document.createElement("button");
    b.className = "cm-drop";
    b.type = "button";
    b.textContent = "▾";
    b.title = "Show alternatives";
    b.setAttribute("aria-label", "Show alternatives");
    b.onmousedown = (e) => {
      e.preventDefault();
      view.focus();
      view.dispatch({ selection: { anchor: this.lineEnd } });
      showAllOptions.next = true;
      startCompletion(view);
    };
    return b;
  }
  ignoreEvent() {
    return false;
  }
}

const KV_RE = /^(\s*)(-\s+)?([^:"'[{#\s][^:]*?):\s+(\S.*)$/;

export function dropdowns(getCompiled: (s: EditorState) => CompileResult): Extension {
  const build = (view: EditorView): DecorationSet => {
    const st = view.state;
    const ctx = contextFrom(getCompiled(st));
    const lines = st.doc.toString().split("\n");
    const out = [];
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = st.doc.lineAt(pos);
        const m = KV_RE.exec(line.text);
        if (m && !m[4].trim().startsWith("{")) {
          const anc = ancestorsAt(lines, line.number - 1, m[1].length);
          if (valueOptions(m[3], anc, ctx).length > 1) out.push(Decoration.widget({ widget: new DropWidget(line.to), side: 1 }).range(line.to));
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
