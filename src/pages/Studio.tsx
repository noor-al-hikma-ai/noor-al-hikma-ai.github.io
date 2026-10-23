import { useMemo, useState } from "react";
import { CodeEditor } from "../components/CodeEditor";
import { CaseCanvas } from "../components/CaseCanvas";
import { caseSpineLanguage } from "../lib/casespine/language";
import { emitAll } from "../lib/casespine/emit";
import { buildCsar } from "../lib/casespine/csar";
import { removeRange } from "../lib/casespine/edits";
import { EXAMPLES } from "../lib/casespine/examples";
import type { CaseAST } from "../lib/casespine/types";
import { getSpec, setSpec, useSpec } from "../store";
import "./studio.css";

const language = caseSpineLanguage();

function download(name: string, bytes: Uint8Array | string, type = "application/octet-stream") {
  const blob = new Blob([bytes as BlobPart], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function Studio() {
  const { spec, compiled } = useSpec();
  const [cursorLine, setCursorLine] = useState<number | null>(null);
  const [editorHl, setEditorHl] = useState<number[]>([]);
  const [tab, setTab] = useState("lean");
  const [focusNs, setFocusNs] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const withStages = compiled.cases.filter((c) => c.stages.length);
  const focus: CaseAST | undefined =
    compiled.cases.find((c) => c.namespacePath === focusNs) ?? withStages[0] ?? compiled.root ?? undefined;
  const targets = useMemo(() => emitAll(compiled, focus), [compiled, focus]);
  const csar = useMemo(() => (compiled.root ? buildCsar(compiled) : null), [compiled]);
  const errors = compiled.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = compiled.diagnostics.filter((d) => d.severity === "warning").length;
  const rules = compiled.cases.reduce((a, c) => a + c.rules.filter((r) => !r.inherited).length, 0);
  const current = targets.find((t) => t.id === tab);

  const exampleId = EXAMPLES.find((e) => e.src === spec)?.id ?? "";

  return (
    <div className="app-page studio">
      <div className="app-head">
        <h1>CaseSpine Studio</h1>
        <span className="sub">Write the case in English or Arabic · the canvas, contracts and cloud scaffolds follow.</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={exampleId}
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value);
              if (ex) {
                setSpec(ex.src);
                setFocusNs(null);
              }
            }}
            aria-label="Load example"
          >
            <option value="">Examples…</option>
            {EXAMPLES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" disabled={!csar} onClick={() => csar && download(csar.fileName, csar.bytes)} title="Portable assembly: python3 file.csar info">
            ⬇ Download .csar
          </button>
          <a className="btn btn-primary btn-sm" href="#/sandbox">
            Run in Sandbox →
          </a>
        </div>
      </div>

      <div className="studio-status">
        <span className={`chip ${errors ? "danger" : "emerald"}`}>
          <span className={`dot ${errors ? "bad" : "ok"}`} />
          {errors ? `${errors} error${errors > 1 ? "s" : ""}` : "Compiled"} · {compiled.ms.toFixed(1)} ms
        </span>
        <span className="chip">{compiled.cases.length} case{compiled.cases.length === 1 ? "" : "s"}</span>
        <span className="chip">{rules} rule{rules === 1 ? "" : "s"} → Lean 4</span>
        <span className={`chip ${compiled.language === "ar" ? "gold" : ""}`}>{compiled.language === "ar" ? "العربية → canonical IR" : "English"}</span>
        {warnings > 0 && <span className="chip" style={{ color: "var(--warn)" }}>{warnings} warning{warnings > 1 ? "s" : ""}</span>}
        <span className="muted" style={{ fontSize: 12.5, marginLeft: "auto" }}>
          <span className="kbd">Ctrl</span>+<span className="kbd">Space</span> completions · hover a rule for its Lean 4 · click a widget to jump to its line
        </span>
      </div>

      <div className="studio-grid">
        <section className="panel studio-editor" aria-label="CaseSpine source">
          <div className="panel-head">
            <span className="label">casespine · {focus?.name ?? "spec"}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setSpec(EXAMPLES[0].src)} title="Restore the reference example">
              Reset
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor value={spec} onChange={setSpec} onCursorLine={setCursorLine} highlight={editorHl} language={language} />
          </div>
        </section>

        <section className="panel studio-canvas" aria-label="Visual program">
          <div className="panel-head">
            <span className="label">Visual program</span>
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
                onEdit={(fn) => {
                  const { spec: s } = getSpec();
                  setSpec(fn(s, focus));
                }}
                onRemove={(range) => setSpec(removeRange(getSpec().spec, range))}
              />
            ) : (
              <div className="panel-body muted">Start with <code>Case: …</code></div>
            )}
          </div>
        </section>

        <section className="panel studio-out" aria-label="Compiled targets">
          <div className="panel-head" style={{ paddingBottom: 0, borderBottom: "1px solid var(--rule)" }}>
            <div className="tabs" role="tablist">
              {targets.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
              <button role="tab" aria-selected={tab === "csar"} className={tab === "csar" ? "on" : ""} onClick={() => setTab("csar")}>
                .csar
              </button>
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
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            {current && <pre className="code-out">{current.code}</pre>}
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
    </div>
  );
}
