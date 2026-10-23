import { useEffect, useMemo, useRef, useState } from "react";
import { CodeEditor } from "../components/CodeEditor";
import { CaseCanvas } from "../components/CaseCanvas";
import { CopilotPanel } from "../components/CopilotPanel";
import { caseSpineLanguage } from "../lib/casespine/language";
import { emitAll } from "../lib/casespine/emit";
import { buildCsar } from "../lib/casespine/csar";
import { changedLines, removeRange } from "../lib/casespine/edits";
import { EXAMPLES } from "../lib/casespine/examples";
import type { CaseAST } from "../lib/casespine/types";
import { getSpec, setSpec, useSpec } from "../store";
import "./studio.css";

const language = caseSpineLanguage();
const STEPS = ["Parse", "Formalise", "Prove", "Assemble"];

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
  const [editorHl, setEditorHl] = useState<number[]>([]);
  const [tab, setTab] = useState("lean");
  const [focusNs, setFocusNs] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copilot, setCopilot] = useState(false);
  const [step, setStep] = useState(-1);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [coach, setCoach] = useState(() => {
    try {
      return !localStorage.getItem("noor.coach.studio");
    } catch {
      return false;
    }
  });
  const outRef = useRef<HTMLDivElement>(null);

  const withStages = compiled.cases.filter((c) => c.stages.length);
  const focus: CaseAST | undefined = compiled.cases.find((c) => c.namespacePath === focusNs) ?? withStages[0] ?? compiled.root ?? undefined;
  const targets = useMemo(() => emitAll(compiled, focus), [compiled, focus]);
  const csar = useMemo(() => (compiled.root ? buildCsar(compiled) : null), [compiled]);
  const errors = compiled.diagnostics.filter((d) => d.severity === "error");
  const warnings = compiled.diagnostics.filter((d) => d.severity === "warning").length;
  const rules = compiled.cases.reduce((a, c) => a + c.rules.filter((r) => !r.inherited).length, 0);
  const current = targets.find((t) => t.id === tab);
  const exampleId = EXAMPLES.find((e) => e.src === spec)?.id ?? "";

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
    if (step >= 0) return;
    let i = 0;
    setStep(0);
    const t = setInterval(() => {
      i++;
      if (i < STEPS.length) {
        setStep(i);
        return;
      }
      clearInterval(t);
      setStep(-1);
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
    }, 170);
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
          <button className="btn btn-primary" onClick={compile} disabled={step >= 0} title="Compile (⌘/Ctrl + Enter)">
            ▶ Compile
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!csar} onClick={() => { if (csar) { download(csar.fileName, csar.bytes); toast(`Downloaded ${csar.fileName}`, "info"); } }} title="Portable assembly: python3 file.csar info">
            ⬇ .csar
          </button>
          <a className="btn btn-emerald btn-sm" href="#/sandbox">Run in Sandbox →</a>
        </div>
      </div>

      {coach && (
        <div className="coach fade-up" role="note">
          <b>New here?</b> Click <b>✨ Start from plain words</b> and describe your case — or put the cursor at the end of any line in the editor and press
          <span className="kbd">Tab</span> to accept the grey suggestion. Hover any value for alternatives, click ▾ for a dropdown, click a widget to configure it.
          <button className="btn btn-ghost btn-sm" onClick={dismissCoach}>Got it</button>
        </div>
      )}

      <div className="studio-status">
        {step >= 0 ? (
          <div className="stepper" aria-live="polite">
            {STEPS.map((s, i) => (
              <span key={s} className={i < step ? "done" : i === step ? "on" : ""}>{i < step ? "✓ " : ""}{s}</span>
            ))}
          </div>
        ) : (
          <>
            <span className={`chip ${errors.length ? "danger" : "emerald"}`}>
              <span className={`dot ${errors.length ? "bad" : "ok"}`} />
              {errors.length ? `${errors.length} error${errors.length > 1 ? "s" : ""}` : "Live-compiled"} · {compiled.ms.toFixed(1)} ms
            </span>
            <span className="chip">{compiled.cases.length} case{compiled.cases.length === 1 ? "" : "s"}</span>
            <span className="chip">{rules} rule{rules === 1 ? "" : "s"} → Lean 4</span>
            <span className={`chip ${compiled.language === "ar" ? "gold" : ""}`}>{compiled.language === "ar" ? "العربية → canonical IR" : "English"}</span>
            {warnings > 0 && <button className="chip" style={{ color: "var(--warn)", cursor: "pointer" }} onClick={() => setTab("diag")}>{warnings} warning{warnings > 1 ? "s" : ""}</button>}
          </>
        )}
        <span className="muted studio-keys">
          <span className="kbd">Tab</span> accept suggestion · <span className="kbd">Ctrl</span>+<span className="kbd">Space</span> options · <span className="kbd">⌘</span>+<span className="kbd">Enter</span> compile
        </span>
      </div>

      <div className="studio-grid">
        <section className="panel studio-editor" aria-label="CaseSpine source">
          <div className="panel-head">
            <span className="label">Text · {focus?.name ?? "spec"}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSpec(EXAMPLES[0].src); toast("Reset to the reference example", "info"); }} title="Restore the reference example">
              Reset
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor value={spec} onChange={setSpec} onCursorLine={setCursorLine} highlight={editorHl} language={language} />
          </div>
        </section>

        <section className="panel studio-canvas" aria-label="Visual program">
          <div className="panel-head">
            <span className="label">Visual · click a widget to configure</span>
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
            {focus ? (
              <CaseCanvas
                ast={focus}
                editable
                height="100%"
                highlightLines={cursorLine ? [cursorLine] : []}
                onSelectLines={(lines) => setEditorHl(lines)}
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
          toast(`Drafted “${name}” — compiling…`, "info");
          setTimeout(compile, 250);
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
