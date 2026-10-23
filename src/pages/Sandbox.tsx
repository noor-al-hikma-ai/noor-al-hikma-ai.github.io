import { useEffect, useMemo, useRef, useState } from "react";
import { CaseCanvas, type CanvasRun } from "../components/CaseCanvas";
import { deriveGraph, layoutGraph, type GNode, type NodeKind } from "../lib/casespine/graph";
import { emitLean } from "../lib/casespine/emit";
import type { CaseAST } from "../lib/casespine/types";
import { extractFile, textToDoc, type ExtractedDoc } from "../lib/rag/extract";
import { buildIndex, newSession, runQuery, TIERS, type Index, type RunTrace, type SessionState } from "../lib/rag/runtime";
import { SAMPLE_DOCS, SAMPLE_QUESTIONS } from "../lib/rag/samples";
import { append, toProvJsonLd, verify, type LedgerEntry } from "../lib/ledger";
import { sha256Hex } from "../lib/sha256";
import { getSpec, setSpec, useSpec } from "../store";
import { setConfig } from "../lib/casespine/edits";
import { cfg } from "../lib/casespine/configSchema";
import { correctSpelling, relatedQuestions } from "../lib/rag/rephrase";
import "./sandbox.css";

interface Escalation {
  id: number;
  lane: string;
  query: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  failed: string[];
}

const STEP_KIND: Record<string, NodeKind[]> = {
  rate: ["rate"],
  preflight: ["preflight"],
  topics: ["topics"],
  cache: ["cache"],
  retrieve: ["bm25", "dense", "rrf"],
  optimizer: ["ladder", "optimizer", "budget"],
  synth: ["synth"],
  gate: ["gate"],
};

function orderedNodes(c: CaseAST): GNode[] {
  const g = deriveGraph(c);
  const pos = layoutGraph(g, 100, 100, 1000);
  return [...g.nodes].sort((a, b) => pos.get(a.id)!.x - pos.get(b.id)!.x || pos.get(a.id)!.y - pos.get(b.id)!.y);
}

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const fmtUsd = (x: number) => (x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(2)}`);

export default function Sandbox() {
  const { compiled } = useSpec();
  const cases = compiled.cases.filter((c) => c.stages.length || c.caseFiles.length);
  const [ns, setNs] = useState<string | null>(null);
  const c: CaseAST | undefined = cases.find((x) => x.namespacePath === ns) ?? cases.find((x) => x.stages.length) ?? cases[0];

  const [docs, setDocs] = useState<ExtractedDoc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [index, setIndex] = useState<Index | null>(null);
  const [lane, setLane] = useState<string>("");
  const [query, setQuery] = useState(SAMPLE_QUESTIONS[0]);
  const [trace, setTrace] = useState<RunTrace | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [tampered, setTampered] = useState<LedgerEntry[] | null>(null);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [inject, setInject] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [budget, setBudget] = useState(0.05);
  const [probes, setProbes] = useState<Record<string, number | boolean>>({});
  const [run, setRun] = useState<CanvasRun | null>(null);
  const [openCite, setOpenCite] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const session = useRef<SessionState>(newSession(budget));
  const [, force] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const lanes = c?.lanes ?? [];
  const agent = lane || lanes[0]?.name || "Case Owner";
  const sso = lanes.find((l) => l.name === agent)?.sso ?? "SSO";

  // Re-index only when the corpus or an index-relevant setting changes.
  const indexKey = c
    ? JSON.stringify([
        c.namespacePath,
        c.caseFiles.map((f) => [f.redact, f.coherence]),
        c.config["chunker"],
        c.config["pii redactor"],
        c.config["retriever"]?.["bm25 k1"],
        c.config["retriever"]?.["bm25 b"],
        c.config["retriever"]?.["dense dims"],
      ])
    : "";
  useEffect(() => {
    if (!c || !docs.length) {
      setIndex(null);
      return;
    }
    const t = setTimeout(() => {
      const idx = buildIndex(docs, c);
      setIndex(idx);
      setLedger((L) => {
        let l = L;
        l = append(l, "casespine-runtime", "curation.completed", {
          namespace: c.namespacePath,
          chunks: idx.report.chunks.length,
          quarantined: idx.report.quarantined.length,
          piiRedacted: idx.report.piiRedacted,
          piiLeftInPlace: idx.report.piiLeftInPlace,
        });
        l = append(l, "casespine-runtime", "index.built", { vocab: idx.bm25.vocabSize, denseDims: idx.dense.dims, ms: Math.round(idx.ms) });
        return l;
      });
      const nodes = orderedNodes(c);
      const curationKinds: NodeKind[] = ["source", "extract", "pii", "coherence", "isolate"];
      const firstMs = nodes.find((n) => n.kind === "milestone");
      setRun({ lit: nodes.filter((n) => curationKinds.includes(n.kind) || n.id === firstMs?.id).map((n) => n.id) });
    }, 30);
    return () => clearTimeout(t);
  }, [docs, indexKey]);

  // Compile event on case change.
  const leanHash = useMemo(() => sha256Hex(emitLean(compiled)).slice(0, 16), [compiled]);
  useEffect(() => {
    if (!c) return;
    setLedger((L) => append(L, "casespine-compiler", "case.compiled", { case: c.name, namespace: c.namespacePath, isolation: c.isolationHash, rules: c.rules.length, leanSha256: leanHash }));
    setLane("");
    setTrace(null);
    session.current = newSession(budget);
  }, [c?.namespacePath, leanHash]);

  useEffect(() => {
    session.current.sessionBudgetUsd = budget;
    force((x) => x + 1);
  }, [budget]);

  const unboundFields = useMemo(() => {
    if (!c) return [] as { field: string; type: "Nat" | "Bool" }[];
    const bound = new Set(["piiRedacted", "coherenceMillipoints", "crossCaseConfoundersCount", "lineageNamespaceVerified", "citationCoverageMillipoints", "tokensConsumed", "costPerQueryCents", "p95LatencyMs"]);
    const out = new Map<string, "Nat" | "Bool">();
    for (const r of c.rules)
      for (const cl of r.clauses) {
        if (!bound.has(cl.field)) out.set(cl.field, cl.type);
        if (cl.rhsField && !bound.has(cl.rhsField)) out.set(cl.rhsField, "Nat");
      }
    return [...out.entries()].map(([field, type]) => ({ field, type }));
  }, [c]);

  const addDocs = async (files: FileList | File[]) => {
    const list = [...files];
    for (const f of list) {
      setBusy(`Extracting ${f.name}…`);
      try {
        const d = await extractFile(f);
        setDocs((D) => [...D.filter((x) => x.name !== d.name), d]);
        setLedger((L) => append(L, agent, "casefile.ingested", { file: d.name, kind: d.kind, bytes: d.bytes, pages: d.pages.length, sha256: d.sha256 }));
      } catch (e) {
        setLedger((L) => append(L, agent, "casefile.rejected", { file: f.name, error: String(e).slice(0, 160) }));
      }
    }
    setBusy(null);
  };

  const loadSamples = () => {
    const ds = SAMPLE_DOCS.map((s) => textToDoc(s.name, s.text, sha256Hex(s.text)));
    setDocs(ds);
    setLedger((L) => ds.reduce((l, d) => append(l, agent, "casefile.ingested", { file: d.name, kind: "md", bytes: d.bytes, pages: d.pages.length, sha256: d.sha256, synthetic: true }), L));
  };

  const animate = (t: RunTrace) => {
    if (!c) return;
    const nodes = orderedNodes(c);
    const preRun = run?.lit ?? [];
    const stepKinds = t.steps.flatMap((s) => (s.status === "block" && s.id !== "gate" && s.id !== "synth" ? [] : STEP_KIND[s.id] ?? []));
    const blockedStep = t.blocked ? t.steps.find((s) => s.status === "block") : undefined;
    const blockedNode = blockedStep ? nodes.find((n) => (STEP_KIND[blockedStep.id] ?? []).includes(n.kind)) : undefined;
    const ok = t.outcome === "VERIFIED";
    const gateIdx = nodes.findIndex((n) => n.kind === "gate");
    const seq = nodes.filter((n, i) => {
      if (preRun.includes(n.id)) return false;
      if (t.blocked) return stepKinds.includes(n.kind) && (!blockedNode || i < nodes.indexOf(blockedNode));
      if (["emit"].includes(n.kind)) return ok;
      if (["compensate", "escalate"].includes(n.kind)) return !ok && (gateIdx < 0 || i > gateIdx || n.kind === "escalate");
      if (n.kind === "milestone") return i < gateIdx || ok;
      return true;
    });
    let i = 0;
    setRun({ lit: preRun });
    const timer = setInterval(() => {
      i++;
      const lit = [...preRun, ...seq.slice(0, i).map((n) => n.id)];
      if (i >= seq.length) {
        clearInterval(timer);
        setRun({ lit, outcome: t.outcome, blockedAt: blockedNode?.id });
      } else setRun({ lit });
    }, 140);
  };

  const ask = (q = query) => {
    if (!c) return;
    if (!q.trim()) return;
    if (!index) {
      // No documents yet: load the sample bank policies and answer as soon as they are indexed.
      setPending(q);
      if (!docs.length) loadSamples();
      return;
    }
    const t = runQuery(q, c, index, session.current, { lane: agent, probes, injectConfounder: inject });
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    setTrace(t);
    setOpenCite(null);
    animate(t);
    setLedger((L) => {
      let l = append(L, agent, "query.received", { lane: agent, sso: `${sso} (simulated)`, query: q, querySha256: sha256Hex(q) });
      if (t.blocked) return append(l, "roi-governor", "query.blocked", { reason: t.blockReason, tokens: 0 });
      l = append(l, "casespine-runtime", "retrieval", { chunks: t.ranked.map((r) => `${r.chunk.doc}#p${r.chunk.page}/c${r.chunk.id}`), cached: t.cached });
      l = append(l, "roi-governor", "synthesis", { tier: t.tier, tokens: t.tokens.total, costUsd: +t.costUsd.toFixed(5), compressed: t.compressed });
      l = append(l, "lean4-reference-monitor", "gate.evaluated", {
        outcome: t.outcome,
        rules: Object.fromEntries(t.rules.map((r) => [r.rule.id, r.verdict === undefined ? "unbound" : r.verdict])),
        state: t.state,
      });
      if (t.outcome === "VERIFIED") l = append(l, "casespine-runtime", "deliverable.emitted", { deliverable: c.deliverable ?? "Verified_Output" });
      else l = append(l, "casespine-runtime", "escalated", { to: t.escalateTo, outcome: t.outcome });
      return l;
    });
    if (t.outcome === "BREACH" || t.outcome === "FAIL_CLOSED") {
      setEscalations((E) => [
        {
          id: Date.now(),
          lane: t.escalateTo ?? "Case Owner",
          query: q,
          reason: t.outcome === "BREACH" ? "Contract breached" : "Unbound probes (fail-closed)",
          status: "pending",
          failed: t.rules.filter((r) => r.verdict !== true).map((r) => r.rule.id),
        },
        ...E,
      ]);
    }
  };

  useEffect(() => {
    if (index && pending) {
      const q = pending;
      setPending(null);
      ask(q);
    }
  }, [index, pending]);

  const corrected = trace && index ? correctSpelling(trace.query, index) : null;
  const related = trace && index ? relatedQuestions(trace.query, index, trace) : [];
  const topK = c ? cfg<number>(c.config, "Retriever", "Top K") : 3;

  const decide = (id: number, status: "approved" | "rejected") => {
    const e = escalations.find((x) => x.id === id);
    if (!e) return;
    setEscalations((E) => E.map((x) => (x.id === id ? { ...x, status } : x)));
    setLedger((L) => append(L, `${e.lane} (HITM)`, `hitm.${status}`, { escalation: id, rules: e.failed, query: e.query }));
  };

  const chain = tampered ?? ledger;
  const integrity = useMemo(() => verify(chain), [chain]);
  const roi = session.current.spentUsd > 0 ? session.current.valueUsd / session.current.spentUsd : 0;

  if (!c)
    return (
      <div className="paper">
        <h1>RAG Sandbox</h1>
        <p>The current Studio spec has no case with a Case File or Process Flow. <a href="#/studio">Open the Studio</a> and load an example.</p>
      </div>
    );

  const outcomeClass = trace ? { VERIFIED: "ok", BREACH: "bad", FAIL_CLOSED: "warn", BLOCKED: "bad" }[trace.outcome] : "";

  return (
    <div className="app-page sandbox">
      <div className="app-head">
        <h1>RAG Sandbox</h1>
        <span className="sub">Upload documents, ask questions — every answer passes the case's ROI guards and Lean 4 gate. Nothing leaves this tab.</span>
      </div>
      <div className="sb-bar">
        <label>
          <span className="label">Case</span>
          <select value={c.namespacePath} onChange={(e) => setNs(e.target.value)}>
            {cases.map((x) => (
              <option key={x.namespacePath} value={x.namespacePath}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Signed in as (simulated SSO)</span>
          <select value={agent} onChange={(e) => setLane(e.target.value)}>
            {(lanes.length ? lanes : [{ name: "Case Owner", sso: "SSO" }]).map((l) => (
              <option key={l.name} value={l.name}>
                {l.name} · {l.sso ?? "SSO"}
              </option>
            ))}
          </select>
        </label>
        <span className="chip">budget {c.guards.budgetTokens.toLocaleString()} tok / ${c.guards.budgetUsd.toFixed(2)} per inquiry</span>
        <span className="chip">{c.rules.length} contract rules</span>
        <a href="#/studio" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>
          Edit case in Studio
        </a>
      </div>

      <div className="sb-canvas panel">
        <CaseCanvas ast={c} run={run} height={300} compact />
      </div>

      <div className="sb-grid">
        {/* ------------------------------------------------ Case File */}
        <section className="panel">
          <div className="panel-head">
            <span className="label">1 · Case File</span>
            <span className="muted" style={{ fontSize: 11.5 }}>{c.caseFiles[0]?.name ?? "documents"}</span>
          </div>
          <div className="panel-body">
            <div
              className={`sb-drop${drag ? " on" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (e.dataTransfer.files.length) addDocs(e.dataTransfer.files);
              }}
              onClick={() => fileInput.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && fileInput.current?.click()}
            >
              <b>Drop PDF, DOCX, TXT, MD, HTML</b>
              <span>or click to choose · parsed locally, never uploaded</span>
              <input ref={fileInput} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.markdown,.html,.htm,.csv,.json" onChange={(e) => e.target.files && addDocs(e.target.files)} />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button className="btn btn-gold btn-sm" onClick={loadSamples}>
                Load synthetic bank corpus
              </button>
              {docs.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setDocs([])}>
                  Clear
                </button>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              No PDF handy? <a href="./samples/demo_bank_card_disputes.pdf" download>Download a synthetic sample</a> and drop it above.
            </div>
            {busy && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>{busy}</div>}
            {docs.map((d) => (
              <div key={d.name} className="sb-doc">
                <span className="mono">{d.name}</span>
                <span className="muted">{d.pages.length} p · {(d.bytes / 1024).toFixed(1)} KB · {d.sha256.slice(0, 10)}…</span>
              </div>
            ))}
            {index && (
              <div className="sb-report">
                <div className="sb-kv"><span>Chunks indexed</span><b>{index.report.chunks.length}</b></div>
                <div className="sb-kv"><span>Quarantined (coherence &lt; {index.minCoherence})</span><b>{index.report.quarantined.length}</b></div>
                <div className="sb-kv"><span>PII redacted</span><b>{Object.entries(index.report.piiRedacted).map(([k, v]) => `${k}×${v}`).join(", ") || "none found"}</b></div>
                {Object.keys(index.report.piiLeftInPlace).length > 0 && (
                  <div className="sb-kv warn"><span>Detected, not in contract</span><b>{Object.entries(index.report.piiLeftInPlace).map(([k, v]) => `${k}×${v}`).join(", ")}</b></div>
                )}
                <div className="sb-kv"><span>BM25 vocabulary</span><b>{index.bm25.vocabSize.toLocaleString()} terms</b></div>
                <div className="sb-kv"><span>Dense index</span><b>{index.dense.dims}D SVD · {(index.dense.explained * 100).toFixed(0)}% of sketch energy</b></div>
                <div className="sb-kv"><span>Build time</span><b>{index.ms.toFixed(0)} ms</b></div>
                <div className="sb-kv"><span>Namespace</span><b className="mono" style={{ fontSize: 11 }}>{index.namespace}</b></div>
              </div>
            )}
            <details className="sb-levers" open>
              <summary className="label">Runtime levers</summary>
              <label className="sb-row">
                <span>Top-k chunks</span>
                <input type="range" min={1} max={10} value={topK} onChange={(e) => c && setSpec(setConfig(getSpec().spec, c, "Retriever", "Top K", e.target.value))} title="Writes Config › Retriever › Top K in the case" />
                <b>{topK}</b>
              </label>
              <label className="sb-row">
                <span>Session budget</span>
                <input type="range" min={0.005} max={0.5} step={0.005} value={budget} onChange={(e) => setBudget(+e.target.value)} />
                <b>${budget.toFixed(3)}</b>
              </label>
              <label className="sb-check">
                <input type="checkbox" checked={inject} onChange={(e) => setInject(e.target.checked)} /> Simulate isolation breach (inject a chunk from another case)
              </label>
              {unboundFields.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    Probes from upstream systems (unset = unbound → fail-closed):
                  </div>
                  {unboundFields.map((f) => (
                    <label key={f.field} className="sb-row">
                      <span className="mono" style={{ fontSize: 11 }}>{f.field}</span>
                      {f.type === "Bool" ? (
                        <select
                          value={probes[f.field] === undefined ? "" : String(probes[f.field])}
                          onChange={(e) => setProbes((P) => { const n = { ...P }; if (e.target.value === "") delete n[f.field]; else n[f.field] = e.target.value === "true"; return n; })}
                        >
                          <option value="">unbound</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          type="number"
                          placeholder="unbound"
                          value={probes[f.field] === undefined ? "" : String(probes[f.field])}
                          onChange={(e) => setProbes((P) => { const n = { ...P }; if (e.target.value === "") delete n[f.field]; else n[f.field] = +e.target.value; return n; })}
                          style={{ width: 90 }}
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </details>
          </div>
        </section>

        {/* ------------------------------------------------ Ask */}
        <section className="panel">
          <div className="panel-head">
            <span className="label">2 · Ask as {agent}</span>
          </div>
          <div className="panel-body">
            <form
              className="sb-ask"
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Question" placeholder="Ask about the case file…" />
              <button className="btn btn-primary" disabled={!!pending || !query.trim()}>
                {pending ? "Loading policies…" : "Ask"}
              </button>
            </form>
            <div className="sb-samples">
              {SAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  className="chip"
                  disabled={!!pending}
                  onClick={() => {
                    setQuery(q);
                    ask(q);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            {!index && !pending && (
              <p className="muted" style={{ fontSize: 14 }}>
                Just ask — we'll load sample bank policies for you. Or drop your own documents on the left.
              </p>
            )}
            {trace && (
              <div className="fade-up" key={trace.query + trace.latencyMs} ref={resultRef}>
                <div className={`sb-outcome ${outcomeClass}`}>
                  <b>{{ VERIFIED: "✓ Verified answer", BREACH: "✕ Contract breached — halted", FAIL_CLOSED: "◐ Fail-closed — awaiting human", BLOCKED: "⊘ Blocked at 0 tokens" }[trace.outcome]}</b>
                  <span>
                    {trace.outcome === "VERIFIED"
                      ? `${c.deliverable?.replace(/_/g, " ") ?? "Deliverable"} emitted`
                      : trace.outcome === "BLOCKED"
                        ? trace.blockReason
                        : `Escalated to ${trace.escalateTo}`}
                  </span>
                </div>
                {(corrected || ((trace.blocked || trace.answer?.abstained) && related.length > 0)) && (
                  <div className="sb-suggest">
                    {corrected && (
                      <div>
                        Did you mean{" "}
                        <button className="sb-sug" onClick={() => { setQuery(corrected); ask(corrected); }}>
                          “{corrected}”
                        </button>
                        ?
                      </div>
                    )}
                    {(trace.blocked || trace.answer?.abstained) && related.length > 0 && (
                      <div>
                        <span className="muted">Try asking about what these documents cover:</span>
                        <div className="sb-sugs">
                          {related.map((r) => (
                            <button key={r} className="sb-sug" onClick={() => { setQuery(r); ask(r); }}>{r}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {trace.answer && !trace.blocked && (
                  <div className="sb-answer">
                    {trace.answer.abstained ? (
                      <p className="muted">No grounded evidence in the case file — the runtime abstains instead of guessing.</p>
                    ) : (
                      <p>
                        {trace.answer.sentences.map((s, i) => (
                          <span key={i}>
                            {s.text}{" "}
                            <button className={`sb-cite${openCite === s.cite ? " on" : ""}`} onClick={() => setOpenCite(openCite === s.cite ? null : s.cite)}>
                              [{s.cite}]
                            </button>{" "}
                          </span>
                        ))}
                      </p>
                    )}
                    {openCite !== null && (() => {
                      const ci = trace.answer!.citations.find((x) => x.n === openCite);
                      if (!ci) return null;
                      return (
                        <blockquote className="sb-quote">
                          <div className="label">[{ci.n}] {ci.chunk.doc} · page {ci.chunk.page} · chunk {ci.chunk.id} · coherence {ci.chunk.coherence.toFixed(2)}</div>
                          {ci.chunk.text}
                        </blockquote>
                      );
                    })()}
                    {!trace.answer.abstained && related.length > 0 && (
                      <div className="sb-related">
                        <span className="muted">Related:</span>
                        {related.map((r) => (
                          <button key={r} className="sb-sug" onClick={() => { setQuery(r); ask(r); }}>{r}</button>
                        ))}
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 12 }}>
                      Extractive synthesis runs locally for this demo; in production the same gate wraps the LLM tier chosen by the optimizer.
                    </div>
                  </div>
                )}
                <ol className="sb-steps">
                  {trace.steps.map((s) => (
                    <li key={s.id + s.label} className={s.status}>
                      <span className="dot" />
                      <b>{s.label}</b>
                      <span>{s.detail}</span>
                    </li>
                  ))}
                </ol>
                {!trace.blocked && (
                  <>
                    <div className="label" style={{ margin: "14px 0 6px" }}>Lean 4 contract at the exit gateway</div>
                    {trace.rules.map((r) => (
                      <div key={r.rule.id} className={`sb-rule ${r.verdict === true ? "ok" : r.verdict === false ? "bad" : "warn"}`}>
                        <div className="sb-rule-h">
                          <b>{r.rule.id}</b>
                          <span>{r.verdict === true ? "holds" : r.verdict === false ? "violated" : "unbound"}</span>
                          {r.rule.inherited && <span className="chip" style={{ fontSize: 10.5, padding: "0 6px" }}>inherited</span>}
                        </div>
                        <code>{r.rule.lean}</code>
                        <div className="sb-probes">
                          {r.probes.map((p, i) => (
                            <span key={i} className={p.ok === true ? "ok" : p.ok === false ? "bad" : "warn"}>
                              {p.field} = <b>{p.value === undefined ? "?" : String(p.value)}</b> {p.expected}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {trace.ranked.length > 0 && (
                      <>
                        <div className="label" style={{ margin: "14px 0 6px" }}>Retrieval trace (BM25 ⋈ dense SVD via RRF)</div>
                        <div className="table-scroll">
                          <table className="paper-table" style={{ fontSize: 12.5 }}>
                            <thead>
                              <tr><th>Chunk</th><th>BM25 rank</th><th>Dense rank</th><th>RRF</th></tr>
                            </thead>
                            <tbody>
                              {trace.ranked.map((r) => (
                                <tr key={r.chunk.id + r.chunk.namespace}>
                                  <td>
                                    <span className="mono" style={{ fontSize: 11.5 }}>{r.chunk.doc} p{r.chunk.page} #{r.chunk.id}</span>
                                    {r.chunk.namespace !== index?.namespace && <span className="chip danger" style={{ marginLeft: 6, fontSize: 10.5, padding: "0 6px" }}>foreign namespace</span>}
                                  </td>
                                  <td>{r.bm25Rank}</td>
                                  <td>{r.denseRank}</td>
                                  <td>{r.rrf.toFixed(4)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------ Governance */}
        <section className="panel">
          <div className="panel-head">
            <span className="label">3 · ROI, escalations &amp; audit</span>
          </div>
          <div className="panel-body">
            <div className="sb-roi">
              <div>
                <span className="label">Spent</span>
                <b>{fmtUsd(session.current.spentUsd)}</b>
              </div>
              <div>
                <span className="label">Value</span>
                <b>{fmtUsd(session.current.valueUsd)}</b>
              </div>
              <div>
                <span className="label">ROI</span>
                <b style={{ color: c.guards.targetRoi && roi && roi < c.guards.targetRoi ? "var(--danger)" : "var(--emerald)" }}>{roi ? `${roi.toFixed(0)}×` : "—"}</b>
              </div>
            </div>
            <div className="sb-meter" title="Session budget consumed">
              <i style={{ width: `${Math.min(100, (session.current.spentUsd / budget) * 100)}%` }} />
              {c.guards.modelLadder?.threshold && <em style={{ left: `${100 - c.guards.modelLadder.threshold}%` }} title="Model ladder engages here" />}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              Session budget {fmtUsd(budget)} · ladder {c.guards.modelLadder?.tiers.join(" → ") ?? "large → medium → small"} · prices: {Object.values(TIERS).map((t) => `${t.label.split(" ")[0]} $${t.in}/$${t.out}`).join(", ")} per 1M tok (illustrative)
            </div>

            <div className="label" style={{ margin: "16px 0 6px" }}>Escalation queue (human-in-the-middle)</div>
            {!escalations.length && <div className="muted" style={{ fontSize: 13 }}>Empty. Breaches and fail-closed outcomes land here.</div>}
            {escalations.slice(0, 5).map((e) => (
              <div key={e.id} className={`sb-esc ${e.status}`}>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <b>{e.lane}</b>
                  <span className="muted" style={{ fontSize: 11.5 }}>{e.reason} · {e.failed.join(", ")}</span>
                </div>
                <div style={{ fontSize: 13 }}>“{e.query}”</div>
                {e.status === "pending" ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="btn btn-emerald btn-sm" onClick={() => decide(e.id, "approved")}>Approve release</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => decide(e.id, "rejected")}>Reject</button>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{e.status === "approved" ? "Approved — logged with approver identity" : "Rejected — output quarantined"}</div>
                )}
              </div>
            ))}

            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "16px 0 6px" }}>
              <span className="label">Audit ledger · SHA-256 chain</span>
              <span className={`chip ${integrity.ok ? "emerald" : "danger"}`} style={{ marginLeft: "auto", fontSize: 11 }}>
                {integrity.ok ? `intact · ${chain.length} events` : `broken at #${integrity.brokenAt}`}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => download("casespine_audit_prov.jsonld", JSON.stringify(toProvJsonLd(chain, c.name), null, 2))} disabled={!chain.length}>
                Export PROV-O JSON-LD
              </button>
              {tampered ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setTampered(null)}>Restore</button>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={ledger.length < 3}
                  onClick={() => setTampered(ledger.map((e, i) => (i === 1 ? { ...e, entity: { ...e.entity, tampered: "edited after the fact" } } : e)))}
                  title="Edit entry #1 without re-hashing to see verification fail"
                >
                  Try tampering
                </button>
              )}
            </div>
            <ol className="sb-ledger">
              {[...chain].reverse().slice(0, 40).map((e) => (
                <li key={e.seq} className={integrity.brokenAt !== undefined && e.seq >= integrity.brokenAt ? "bad" : ""}>
                  <div>
                    <span className="mono muted">#{e.seq}</span> <b>{e.activity}</b> <span className="muted">· {e.agent}</span>
                  </div>
                  <div className="mono sb-hash">{e.hash.slice(0, 20)}… ← {e.prev.slice(0, 8)}…</div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
