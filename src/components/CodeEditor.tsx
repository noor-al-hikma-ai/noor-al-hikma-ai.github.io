import { useEffect, useRef } from "react";
import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, foldGutter } from "@codemirror/language";
import { closeBrackets, completionKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { lintKeymap } from "@codemirror/lint";

const setHl = StateEffect.define<number[]>();
const hlField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects)
      if (e.is(setHl)) {
        const lines = [...new Set(e.value)].filter((l) => l >= 1 && l <= tr.state.doc.lines).sort((a, b) => a - b);
        deco = Decoration.set(lines.map((l) => Decoration.line({ class: "cm-hl-line" }).range(tr.state.doc.line(l).from)));
      }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

interface Props {
  value: string;
  onChange: (v: string) => void;
  onCursorLine?: (line: number) => void;
  highlight?: number[];
  language: Extension[];
  readOnly?: boolean;
}

export function CodeEditor({ value, onChange, onCursorLine, highlight, language, readOnly }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onCursorLine });
  cb.current = { onChange, onCursorLine };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightSelectionMatches(),
          EditorState.tabSize.of(2),
          EditorState.readOnly.of(!!readOnly),
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...lintKeymap, indentWithTab]),
          ...language,
          hlField,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
            if (u.selectionSet && u.view.hasFocus) cb.current.onCursorLine?.(u.state.doc.lineAt(u.state.selection.main.head).number);
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // The editor is created once; later value changes are applied below.
  }, []);

  // External value changes (palette, example picker) -> minimal transaction.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur === value) return;
    let start = 0;
    while (start < cur.length && start < value.length && cur[start] === value[start]) start++;
    let endA = cur.length, endB = value.length;
    while (endA > start && endB > start && cur[endA - 1] === value[endB - 1]) {
      endA--;
      endB--;
    }
    v.dispatch({ changes: { from: start, to: endA, insert: value.slice(start, endB) } });
  }, [value]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const lines = highlight ?? [];
    v.dispatch({ effects: setHl.of(lines) });
    if (lines.length && !v.hasFocus) {
      const l = Math.min(...lines);
      if (l >= 1 && l <= v.state.doc.lines) v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(l).from, { y: "center" }) });
    }
  }, [highlight]);

  return <div ref={host} style={{ height: "100%", minHeight: 0, overflow: "hidden" }} />;
}
