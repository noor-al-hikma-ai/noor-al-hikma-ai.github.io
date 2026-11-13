import { useEffect, useMemo, useRef, useState } from "react";
import { CodeEditor, type CodeEditorCommands } from "../components/CodeEditor";
import { CaseCanvas } from "../components/CaseCanvas";
import { CopilotPanel } from "../components/CopilotPanel";
import { SketchWorkflow } from "../components/SketchWorkflow";
import { caseSpineLanguage } from "../lib/casespine/language";
import { openOptions } from "../lib/casespine/assist";
import { continuationOptions, continuationSizes, type Continuation } from "../lib/casespine/continuations";
import { requestLiveModel } from "../lib/liveModel";
import { emitAll } from "../lib/casespine/emit";
import { buildCsar } from "../lib/casespine/csar";
import { authoringSlot, changedLines, removeRange, type AuthoringTarget } from "../lib/casespine/edits";
import { EXAMPLES } from "../lib/casespine/examples";
import { addNamedStage, type IntentDraft } from "../lib/casespine/intent";
import { compileSpec } from "../lib/casespine/analyze";
import type { CaseAST } from "../lib/casespine/types";
import { getSpec, setSpec, useSpec } from "../store";
import "./studio.css";

const language = caseSpineLanguage();
const nextStepEndpoint = import.meta.env.VITE_CASESPINE_NEXT_STEP_ENDPOINT?.trim();

function download(name: string, bytes: Uint8Array | string, type = "application/octet-stream") {
  const blob = new Blob([bytes as BlobPart], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

interface Toast {
  id: number;
  text: string;
  kind: "ok" | "info" | "bad";
}

export default function Studio() {
  const { spec, compiled } = useSpec();
  const [cursorLine, setCursorLine] = useState<number | null>(null);
  const [draft, setDraft] = useState<IntentDraft | null>(null);
  const [nextSteps, setNextSteps] = useState<{ source: string; options: Continuation[]; pending: boolean; recommended?: string; local?: boolean } | null>(null);
  const nextRequest = useRef(0);
  const [sketch, setSketch] = useState(false);
  const [editorHl, setEditorHl] = useState<number[]>([]);
  const [tab, setTab] = useState("lean");
  const [focusNs, setFocusNs] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copilot, setCopilot] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [coach, setCoach] = useState(() => {
    try {
      return !localStorage.getItem("noor.coach.studio");
    } catch {
      return false;
    }
  });
  const editorCommands = useRef<CodeEditorCommands>(null);
  const outRef = useRef<HTMLDivElement>(null);

  const withStages = compiled.cases.filter((c) => c.stages.length);
  const focus: CaseAST | undefined = compiled.cases.find((c) => c.namespacePath === focusNs) ?? withStages[0] ?? compiled.root ?? undefined;
  const visual = draft ? draft.compiled.cases.find((c) => c.namespacePath === focus?.namespacePath) ?? draft.compiled.root : focus;
  const errors = compiled.diagnostics.filter((d) => d.severity === "error");
  const canBuild = !!compiled.root && !errors.length;
  const targets = useMemo(() => canBuild ? emitAll(compiled, focus) : [], [canBuild, compiled, focus]);
  const csar = useMemo(() => tab === "csar" && canBuild ? buildCsar(compiled) : null, [tab, canBuild, compiled]);
  const warnings = compiled.diagnostics.filter((d) => d.severity === "warning").length;
  const rules = compiled.cases.reduce((a, c) => a + c.rules.filter((r) => !r.inherited).length, 0);
  const current = targets.find((t) => t.id === tab);
  const exampleId = EXAMPLES.find((e) => e.src === spec)?.id ?? "";
  const suggestions = nextSteps?.source === spec ? nextSteps : null;

  async function suggestNextStep() {
    const request = ++nextRequest.current;
    const { spec: source, compiled: result } = getSpec();
    const lines = source.split("\n");
    const line = Math.min(cursorLine ?? lines.length, lines.length);
    const { level, options } = continuationOptions(source, line, result);
    setNextSteps({ source, options, pending: !!nextStepEndpoint && options.length > 1 });
    if (!nextStepEndpoint || options.length <= 1) return;
    const reply = await requestLiveModel(nextStepEndpoint, {
      context: { position: level, state: result.diagnostics.some((item) => item.severity === "error") ? "needs-repair" : "ready" },
      options: options.map(({ id, label, size }) => ({ id, label, size })),
    });
    if (request !== nextRequest.current || getSpec().spec !== source) return;
    const choice = reply && typeof reply === "object" && "choice" in reply ? reply.choice : undefined;
    const recommended = options.find((option) => option.id === choice)?.id;
    setNextSteps({ source, options, pending: false, recommended, local: !recommended });
  }

  function suggest(target: AuthoringTarget) {
    if (!focus) {
      editorCommands.current?.suggestAt(spec.split("\n").length, [""]);
      return;
    }
    const slot = authoringSlot(spec, focus, target, cursorLine ?? undefined);
    if (slot) editorCommands.current?.suggestAt(slot.line, slot.lines, target === "escalation" ? openOptions : undefined);
  }

  const toast = (text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((T) => [...T.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((T) => T.filter((t) => t.id !== id)), 3200);
  };
  const dismissCoach = () => {
    setCoach(false);
    try {
      localStorage.setItem("noor.coach.studio", "1");
    } catch {
      /* ignore */
    }
  };

  function previewSketch(stages: string[]) {
    let source = spec.trim() ? spec : "Case: Sketched Workflow";
    let result = compileSpec(source);
    const namespace = focus?.namespacePath;
    const count = focus?.stages.length ?? 0;
    for (const name of stages) {
      const target = result.cases.find((item) => item.namespacePath === namespace) ?? result.root;
      if (!target) break;
      source = addNamedStage(source, target, name);
      result = compileSpec(source);
    }
    const target = result.cases.find((item) => item.namespacePath === namespace) ?? result.root;
    const added = target?.stages.slice(count) ?? [];
    if (added.length !== stages.length || result.diagnostics.some((item) => item.severity === "error")) {
      toast("Resolve the source errors before adding the sketched stages.", "bad");
      return;
    }
    setSketch(false);
    const lines = source.split("\n");
    const text = [...(spec.trim() ? [] : [lines[0], "Process Flow:"]), ...added.flatMap((stage) => lines.slice(stage.line - 1, stage.endLine))].join("\n");
    const last = spec.split("\n").length;
    editorCommands.current?.previewDraft({ line: last, text: "\n" + text, source, compiled: result, append: true });
  }

  // Every visual edit is a text edit: apply it, then flash the lines it touched.
  const applyEdit = (fn: (src: string, c: CaseAST) => string, what?: string) => {
    if (!focus) return;
    const before = getSpec().spec;
    const after = fn(before, focus);
    if (after === before) return;
    setSpec(after);
    const lines = changedLines(before, after);
    setEditorHl(lines);
    if (what) toast(`${what} → line${lines.length > 1 ? "s" : ""} ${lines[0]}${lines.length > 1 ? `–${lines[lines.length - 1]}` : ""}`, "info");
  };

  const compile = () => {
    const r = getSpec().compiled;
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    if (errs.length || !r.root) {
      setTab("diag");
      setEditorHl([errs[0]?.line ?? 1]);
      toast(`${errs.length || 1} problem${errs.length > 1 ? "s" : ""} to fix — see Diagnostics`, "bad");
    } else {
      setTab("lean");
      const n = r.cases.reduce((a, c) => a + c.rules.filter((x) => !x.inherited).length, 0);
      toast(`Compiled · ${r.cases.length} case${r.cases.length > 1 ? "s" : ""} · ${n} rules → Lean 4 · 9 targets · ${r.ms.toFixed(1)} ms`);
    }
    outRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        compile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="app-page studio">
      <div className="app-head">
        <h1>CaseSpine Studio</h1>
        <span className="sub">Describe it, type it or draw it — the three views stay in sync.</span>
        <div className="studio-actions">
          <button className="btn btn-gold" onClick={() => { setCopilot(true); dismissCoach(); }}>
            ✨ Start from plain words
          </button>
          <button className="btn btn-ghost" onClick={() => { setSketch(true); dismissCoach(); }}>Sketch workflow</button>
          <select
            value={exampleId}
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value);
              if (ex) {
                setSpec(ex.src);
                setFocusNs(null);
                toast(`Loaded example: ${ex.label}`, "info");
              }
            }}
            aria-label="Load example"
          >
            <option value="">Examples…</option>
            {EXAMPLES.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={compile} title="Compile (⌘/Ctrl + Enter)">
            ▶ Compile
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!compiled.root || errors.length > 0} onClick={() => { const assembly = csar ?? buildCsar(compiled); if (assembly) { download(assembly.fileName, assembly.bytes); toast(`Downloaded ${assembly.fileName}`, "info"); } }} title="Portable assembly: python3 file.csar info">
            ⬇ .csar
          </button>
          <a className="btn btn-emerald btn-sm" href="#/sandbox">Run in Sandbox →</a>
        </div>
      </div>

      {sketch && <SketchWorkflow onClose={() => setSketch(false)} onPreview={previewSketch} />}
      {coach && (
        <div className="coach fade-up" role="note">
          <b>New here?</b> Click <b>✨ Start from plain words</b> and describe your case — or put the cursor at the end of any line in the editor and press
          <span className="kbd">Tab</span> or <span className="kbd">→</span> to accept the grey suggestion. Hover any value for alternatives, click ▾ for a dropdown, click a widget to configure it.
          <button className="btn btn-ghost btn-sm" onClick={dismissCoach}>Got it</button>
        </div>
      )}

      <div className="studio-status">
            <span className={`chip ${errors.length ? "danger" : "emerald"}`}>
              <span className={`dot ${errors.length ? "bad" : "ok"}`} />
              {errors.length ? `${errors.length} error${errors.length > 1 ? "s" : ""}` : "Live-compiled"} · {compiled.ms.toFixed(1)} ms
            </span>
            <span className="chip">{compiled.cases.length} case{compiled.cases.length === 1 ? "" : "s"}</span>
            <span className="chip">{rules} rule{rules === 1 ? "" : "s"} → Lean 4</span>
            <span className={`chip ${compiled.language === "ar" ? "gold" : ""}`}>{compiled.language === "ar" ? "العربية → canonical IR" : "English"}</span>
            {warnings > 0 && <button className="chip" style={{ color: "var(--warn)", cursor: "pointer" }} onClick={() => setTab("diag")}>{warnings} warning{warnings > 1 ? "s" : ""}</button>}
        <span className="muted studio-keys">
          <span className="kbd">Tab</span> or <span className="kbd">→</span> accept · <span className="kbd">Ctrl</span>+<span className="kbd">Space</span> options · <span className="kbd">⌘</span>+<span className="kbd">Enter</span> compile
        </span>
      </div>

      <div className="studio-grid">
        <section className="panel studio-editor" aria-label="CaseSpine source">
          <div className="panel-head">
            <span className="label">Text · {focus?.name ?? "spec"}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              setSpec("");
              setFocusNs(null);
              setEditorHl([]);
            }} disabled={!spec}>Start blank</button>
            <button className="btn btn-ghost btn-sm" onClick={() => suggest("section")}>{spec ? "Add section" : "Suggest first line"}</button>
            <button className="btn btn-ghost btn-sm" aria-expanded={!!suggestions} onClick={() => {
              if (suggestions) { nextRequest.current++; setNextSteps(null); }
              else void suggestNextStep();
            }}>Suggest next step</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSpec(EXAMPLES[0].src); toast("Reset to the reference example", "info"); }} title="Restore the reference example">
              Reset
            </button>
          </div>
          {focus && <div className="studio-authoring" role="group" aria-label="Workflow suggestions">
            <button className="btn btn-ghost btn-sm" onClick={() => suggest("lane")}>Add lane</button>
            <button className="btn btn-ghost btn-sm" onClick={() => suggest("stage")}>Add stage</button>
            <button className="btn btn-ghost btn-sm" onClick={() => suggest("rule")}>Add rule</button>
            <button className="btn btn-ghost btn-sm" onClick={() => suggest("escalation")} disabled={!focus.stages.length}>Add escalation</button>
            <button className="btn btn-ghost btn-sm" onClick={() => suggest("gateway")} disabled={!focus.stages.length}>Add gateway</button>
            <button className="btn btn-ghost btn-sm" onClick={() => suggest("constraint")}>Add constraint</button>
          </div>}
          {!spec && <p className="muted" style={{ margin: "8px 12px" }}>
            Choose Suggest first line to name your case. Then use the editor buttons or press Tab to build your workflow.
          </p>}
          {suggestions && <div className="studio-next-steps" aria-label="Next step options">
            <small className="muted" role="status">{suggestions.pending ? "Finding a recommendation…" : suggestions.recommended ? "Model recommendation available" : suggestions.local ? "Local suggestions" : ""}</small>
            {suggestions.options.length ? suggestions.options.map((option) => <button key={option.id}
              className={`btn btn-sm ${option.id === suggestions.recommended ? "btn-emerald" : "btn-ghost"}`}
              title={continuationSizes[option.size]} onClick={() => {
                nextRequest.current++;
                setNextSteps(null);
                editorCommands.current?.previewDraft(option.draft);
              }}>{option.label}{option.id === suggestions.recommended ? " · Recommended" : ""}</button>)
              : <small>Use the editor suggestions at your cursor or choose Add section.</small>}
          </div>}
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor commands={editorCommands} value={spec} onChange={setSpec} onCursorLine={setCursorLine} onDraft={setDraft} highlight={editorHl} language={language} />
          </div>
        </section>

        <section className="panel studio-canvas" aria-label="Visual program">
          <div className="panel-head">
            <span className="label">{draft ? draft.heading ?? "Suggested workflow" : "Visual · click a widget to configure"}</span>
            {draft && <>
              {draft.localFallback && <small className="muted" role="status">Live model unavailable. Local draft.</small>}
              <button className="btn btn-emerald btn-sm" onClick={() => editorCommands.current?.acceptDraft()}>Accept draft</button>
              <button className="btn btn-ghost btn-sm" onClick={() => editorCommands.current?.dismissDraft()}>Dismiss draft</button>
            </>}
            {compiled.cases.length > 1 && (
              <select value={focus?.namespacePath ?? ""} onChange={(e) => setFocusNs(e.target.value)} aria-label="Case shown on canvas" style={{ maxWidth: 260, fontSize: 12.5, padding: "3px 6px" }}>
                {compiled.cases.map((c) => (
                  <option key={c.namespacePath} value={c.namespacePath}>
                    {"· ".repeat(c.depth)}
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {visual ? (
              <CaseCanvas
                ast={visual}
                editable={!draft}
                outline
                height="100%"
                highlightLines={cursorLine && !draft ? [cursorLine] : []}
                onSelectLines={draft ? undefined : (lines) => setEditorHl(lines)}
                onEdit={(fn) => applyEdit(fn)}
                onPalette={(label, fn) => applyEdit(fn, `Added ${label}`)}
                onRemove={(range) => {
                  setSpec(removeRange(getSpec().spec, range));
                  toast(`Removed line${range[0] === range[1] ? "" : "s"} ${range[0]}${range[0] === range[1] ? "" : "–" + range[1]}`, "info");
                }}
              />
            ) : (
              <div className="panel-body muted">
                Start with <code>Case: …</code> — or press <b>✨ Start from plain words</b>.
              </div>
            )}
          </div>
        </section>

        <section className="panel studio-out" aria-label="Compiled targets" ref={outRef}>
          <div className="panel-head" style={{ paddingBottom: 0, borderBottom: "1px solid var(--rule)" }}>
            <div className="tabs" role="tablist">
              {targets.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
              <button role="tab" aria-selected={tab === "csar"} className={tab === "csar" ? "on" : ""} onClick={() => setTab("csar")}>.csar</button>
              <button role="tab" aria-selected={tab === "diag"} className={tab === "diag" ? "on" : ""} onClick={() => setTab("diag")}>
                Diagnostics {compiled.diagnostics.length ? `(${compiled.diagnostics.length})` : ""}
              </button>
            </div>
            {current && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, paddingBottom: 6 }}>
                <span className="muted mono" style={{ fontSize: 11, alignSelf: "center" }}>{current.file}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(current.code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    } catch {
                      /* clipboard blocked */
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }} key={tab + compiled.ms}>
            {current && <pre className="code-out fade-up">{current.code}</pre>}
            {!canBuild && tab !== "diag" && <p className="panel-body muted">Resolve the source errors to generate the compiled outputs.</p>}
            {tab === "csar" && csar && (
              <div className="panel-body">
                <p style={{ marginTop: 0, fontSize: 14 }}>
                  <b>{csar.fileName}</b> — {(csar.bytes.length / 1024).toFixed(1)} KB, PEP 441 Python zipapp. Run anywhere with Python 3.9+:
                </p>
                <pre className="code-out" style={{ height: "auto", background: "var(--paper-2)", borderRadius: 8 }}>
{`python3 ${csar.fileName} info        # case tree, budgets, rules
python3 ${csar.fileName} verify      # SHA-256 digests of every file
python3 ${csar.fileName} check state.json   # evaluate the Lean contract
python3 ${csar.fileName} extract ./out      # unpack scaffolds for engineers`}
                </pre>
                <div className="table-scroll">
                  <table className="paper-table" style={{ fontSize: 12.5 }}>
                    <thead>
                      <tr><th>File</th><th>Bytes</th><th>SHA-256</th></tr>
                    </thead>
                    <tbody>
                      {csar.files.map((f) => (
                        <tr key={f.name}>
                          <td className="mono">{f.name}</td>
                          <td>{f.size.toLocaleString()}</td>
                          <td className="mono muted">{f.sha256.slice(0, 16)}…</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {tab === "diag" && (
              <div className="panel-body">
                {!compiled.diagnostics.length && <div className="muted">No diagnostics. Every rule is formalised and every contract is satisfiable.</div>}
                {compiled.diagnostics.map((d, i) => (
                  <button key={i} className={`diag diag-${d.severity}`} onClick={() => setEditorHl([d.line])}>
                    <span className="diag-sev">{d.severity}</span>
                    <span className="mono">L{d.line}</span>
                    <span>{d.message}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <CopilotPanel
        open={copilot}
        onClose={() => setCopilot(false)}
        onUse={(s, name) => {
          setSpec(s);
          setFocusNs(null);
          setCopilot(false);
          toast(`Drafted “${name}”`, "info");
          compile();
        }}
      />

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.kind === "ok" ? "✓ " : t.kind === "bad" ? "! " : ""}{t.text}</div>
        ))}
      </div>
    </div>
  );
}
