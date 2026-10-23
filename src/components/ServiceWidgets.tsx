import { useEffect, useMemo, useState } from "react";
import { scaleLinear, scaleBand, scaleSqrt } from "d3-scale";
import { line, curveMonotoneX } from "d3-shape";
import { compileSpec } from "../lib/casespine/analyze";
import { setSpec } from "../store";
import "./services.css";

const ARCH_COLORS: Record<string, string> = {
  RAG: "var(--cat-retrieve)",
  Saga: "var(--cat-act)",
  Causal: "var(--cat-verify)",
  MILP: "var(--cat-data)",
  Data: "var(--cat-govern)",
  Code: "var(--cat-reason)",
  B2B: "var(--cat-human)",
};

// =====================================================================
// 1. Opportunity radar
// =====================================================================
type Opp = { n: string; v: number; f: number; r: number; a: keyof typeof ARCH_COLORS; check: string };
const DOMAINS: Record<string, Opp[]> = {
  "Retail banking": [
    { n: "Branch policy assistant", v: 7, f: 9, r: 0.9, a: "RAG", check: "Policy corpus quality, top-50 officer questions, citation coverage baseline." },
    { n: "Complaint triage & drafting", v: 8, f: 7, r: 0.7, a: "Saga", check: "Complaint taxonomy, SLA breaches, consumer-protection disclosures." },
    { n: "Next-best-offer uplift", v: 8, f: 5, r: 0.55, a: "Causal", check: "Historic campaign logs, uplift measurability, fairness constraints." },
    { n: "Card dispute STP", v: 7, f: 6, r: 0.6, a: "Saga", check: "Dispute reason codes, scheme rules, compensation paths." },
    { n: "KYC document extraction", v: 6, f: 8, r: 0.8, a: "Data", check: "Document mix (EN/AR), OCR quality, PII handling." },
  ],
  "Corporate & treasury": [
    { n: "Credit memo drafting", v: 9, f: 6, r: 0.6, a: "RAG", check: "Memo templates, financial spreading inputs, reviewer workflow." },
    { n: "Liquidity forecasting", v: 8, f: 5, r: 0.7, a: "MILP", check: "Cash-flow history granularity, regulatory ratios, scenario set." },
    { n: "Trade-finance document checks", v: 8, f: 6, r: 0.5, a: "RAG", check: "UCP 600 discrepancy catalogue, scan quality, sanctions hooks." },
    { n: "FX hedging optimiser", v: 7, f: 4, r: 0.5, a: "MILP", check: "Exposure data, hedge instruments, risk limits as constraints." },
    { n: "Supplier negotiation agent", v: 6, f: 4, r: 0.4, a: "B2B", check: "Price benchmarks, approval thresholds, vendor KYC." },
  ],
  "Islamic finance": [
    { n: "Murabaha structuring assistant", v: 9, f: 6, r: 0.6, a: "RAG", check: "Sharia manuals, committee precedents, ratio screens." },
    { n: "Sharia screening of corporates", v: 8, f: 7, r: 0.7, a: "Data", check: "Audited financials pipeline, screen thresholds, purification." },
    { n: "Sukuk prospectus Q&A", v: 7, f: 8, r: 0.8, a: "RAG", check: "Prospectus corpus, investor question bank, disclosure rules." },
    { n: "Profit-rate fairness audit", v: 7, f: 6, r: 0.6, a: "Causal", check: "Pricing model inputs, protected attributes, JSD tolerance." },
  ],
  "Compliance & AML": [
    { n: "Sanctions alert triage", v: 9, f: 6, r: 0.7, a: "RAG", check: "Alert volumes, false-positive drivers, four-eyes evidence." },
    { n: "STR narrative drafting", v: 8, f: 6, r: 0.6, a: "RAG", check: "goAML templates, case notes, tipping-off safeguards." },
    { n: "Regulatory change mapping", v: 8, f: 7, r: 0.8, a: "RAG", check: "Circular corpus, policy library, control inventory." },
    { n: "Model-risk documentation", v: 7, f: 8, r: 0.7, a: "Code", check: "Model inventory, validation templates, monitoring metrics." },
  ],
  "Operations & IT": [
    { n: "Reconciliation breaks", v: 8, f: 7, r: 0.7, a: "Data", check: "Break taxonomy, ledger feeds, auto-resolution limits." },
    { n: "API hardening agent", v: 7, f: 6, r: 0.7, a: "Code", check: "SAST baseline, test coverage, change-advisory process." },
    { n: "IT incident co-pilot", v: 6, f: 8, r: 0.8, a: "RAG", check: "Runbooks, ticket history, escalation matrix." },
    { n: "Data-quality foundry", v: 7, f: 7, r: 0.6, a: "Data", check: "Critical data elements, catalog coverage, DQ rules." },
  ],
};

export function OpportunityRadar() {
  const domains = Object.keys(DOMAINS);
  const [d, setD] = useState(domains[0]);
  const [sel, setSel] = useState(0);
  const opps = DOMAINS[d];
  const W = 520, H = 350, m = 40;
  const x = scaleLinear().domain([3, 10]).range([m, W - 14]);
  const y = scaleLinear().domain([5, 10]).range([H - m, 14]);
  const r = scaleSqrt().domain([0, 1]).range([4, 20]);
  const o = opps[Math.min(sel, opps.length - 1)];
  const fMid = 6.5, vMid = 7.5;
  return (
    <div className="sw sw-radar">
      <div className="sw-tabs">
        {domains.map((k) => (
          <button key={k} className={k === d ? "on" : ""} onClick={() => { setD(k); setSel(0); }}>{k}</button>
        ))}
      </div>
      <div className="sw-two">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Use cases by value and feasibility">
          <rect x={x(fMid)} y={y(10)} width={x(10) - x(fMid)} height={y(vMid) - y(10)} fill="var(--emerald-soft)" opacity={0.7} />
          <line x1={x(fMid)} x2={x(fMid)} y1={y(5)} y2={y(10)} stroke="var(--rule-2)" strokeDasharray="3 3" />
          <line x1={x(3)} x2={x(10)} y1={y(vMid)} y2={y(vMid)} stroke="var(--rule-2)" strokeDasharray="3 3" />
          <rect x={x(3)} y={y(10)} width={x(10) - x(3)} height={y(5) - y(10)} fill="none" stroke="var(--rule)" />
          <text x={x(9.9)} y={y(9.75)} textAnchor="end" className="sw-ax" fill="var(--emerald)">QUICK WINS</text>
          <text x={x(3.1)} y={y(9.75)} className="sw-ax">STRATEGIC BETS</text>
          <text x={x(9.9)} y={y(5.15)} textAnchor="end" className="sw-ax">EASY, SMALLER VALUE</text>
          <text x={(x(3) + x(10)) / 2} y={H - 10} textAnchor="middle" className="sw-ax">FEASIBILITY →</text>
          <text transform={`translate(14,${(y(5) + y(10)) / 2}) rotate(-90)`} textAnchor="middle" className="sw-ax">VALUE →</text>
          {opps.map((p, i) => {
            const rr = r(p.r);
            const below = i % 2 === 1;
            return (
              <g key={d + p.n} className="sw-bub" style={{ transform: `translate(${x(p.f)}px, ${y(p.v)}px)` }} onClick={() => setSel(i)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSel(i)} aria-label={p.n}>
                <circle r={rr} fill={ARCH_COLORS[p.a]} fillOpacity={i === sel ? 0.9 : 0.35} stroke={ARCH_COLORS[p.a]} strokeWidth={i === sel ? 2.5 : 1.2} />
                <text y={below ? rr + 13 : -rr - 6} textAnchor="middle" className="sw-bl" style={{ fontWeight: i === sel ? 700 : 500 }}>{p.n}</text>
              </g>
            );
          })}
        </svg>
        <div className="sw-side fade-up" key={d + sel}>
          <div className="label" style={{ color: ARCH_COLORS[o.a] }}>{o.a} archetype · data readiness {(o.r * 100).toFixed(0)}%</div>
          <h4>{o.n}</h4>
          <p><b>What the sprint validates:</b> {o.check}</p>
          <div className="label" style={{ marginTop: 10 }}>10-day sprint</div>
          <ol className="sw-days">
            {["Stakeholder interviews", "Data & controls audit", "CaseSpine drafts", "ROI model & risk map", "Sandbox prototype", "Board-ready readout"].map((s, i) => (
              <li key={s}><span>D{[1, 3, 5, 7, 9, 10][i]}</span>{s}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// 2. Case clinic intake -> live CaseSpine draft
// =====================================================================
const PII = ["UAE_IBAN", "EMIRATES_ID", "PASSPORT", "EMAIL", "PHONE_UAE", "CARD_PAN"];

export function CaseClinic() {
  const [f, setF] = useState({
    name: "Trade Finance Discrepancy Desk",
    problem: "Checkers spend hours comparing letters of credit with shipping documents.",
    users: "Trade Operations Checker",
    approver: "Head of Trade Operations",
    docs: "ucp600_guide.pdf, lc_templates.pdf",
    banned: "legal advice, pricing promises",
    pii: ["UAE_IBAN", "EMAIL"],
    budget: 0.2,
    value: 12,
  });
  const set = (k: keyof typeof f, v: unknown) => setF({ ...f, [k]: v });
  const spec = useMemo(() => {
    const docs = f.docs.split(",").map((s) => `"${s.trim()}"`).filter((s) => s !== '""').join(", ");
    return `# Drafted by the AI Case Clinic intake — refine with us in the session
Case: ${f.name || "Untitled Case"}
Version: "5.0"
Solution Archetype: KNOWLEDGE_SYNTHESIS_AND_RAG
# Problem: ${f.problem.replace(/\n/g, " ")}

Lanes:
  ${f.users || "Case User"}:
    SSO Provider: Microsoft Entra ID
  ${f.approver || "Case Approver"}:
    SSO Provider: Microsoft Entra ID
    Roles: [HITM_APPROVER]

Case File:
  Source Documents:
    Source: pdf(${docs || '"upload.pdf"'})
    Curation: redact [${f.pii.join(", ") || "EMAIL"}] and require coherence >= 0.85

Binding Lean Contract:
  Rules (SBVR & FEEL Constrained English):
    - It is obligatory that PII is redacted for [${f.pii.join(", ") || "EMAIL"}] before Milestone IndexReady.
    - It is obligatory that citation coverage >= 90% and cost per query <= $${f.budget.toFixed(2)} before Milestone CaseResolved.

Cost & Traffic Guards:
  Budget Ceiling: ${Math.round(f.budget * 40000)} tokens or $${f.budget.toFixed(2)}
  Banned Topics: [${f.banned}]
  Value Per Outcome: $${f.value.toFixed(2)}

Process Flow:
  - Stage 1 (Curate):
      When: Case File "Source Documents" is loaded
      Steps:
        - Extract prose sections and reconstruct booktabs tables
      Reach Milestone: IndexReady
  - Stage 2 (Resolve):
      When: ${f.users || "Case User"} submits a request
      Steps:
        - Evaluate Cost & Traffic Guards on request
        - Retrieve top 3 chunks using Okapi BM25 and 12D SVD Dense Indexer with RRF Reranker
        - Synthesize grounded answer with inline page and chunk citations
      On Breach:
        Escalate To: ${f.approver || "Case Approver"}
      Exit Gateway (Lean 4 Spine Reference Monitor):
        If: all Binding Lean Contract rules hold
        Then: Emit Verified Answer and reach Milestone CaseResolved
        Else: Halt loudly and Compensate via "Quarantine Output"
`;
  }, [f]);
  const res = useMemo(() => compileSpec(spec), [spec]);
  const errs = res.diagnostics.filter((d) => d.severity === "error").length;
  return (
    <div className="sw sw-clinic">
      <div className="sw-form">
        <label>Case name<input type="text" value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label>Your problem in one or two sentences<textarea rows={2} value={f.problem} onChange={(e) => set("problem", e.target.value)} /></label>
        <div className="sw-row2">
          <label>Who asks<input type="text" value={f.users} onChange={(e) => set("users", e.target.value)} /></label>
          <label>Who decides when unsure<input type="text" value={f.approver} onChange={(e) => set("approver", e.target.value)} /></label>
        </div>
        <label>Documents<input type="text" value={f.docs} onChange={(e) => set("docs", e.target.value)} /></label>
        <label>Never discuss<input type="text" value={f.banned} onChange={(e) => set("banned", e.target.value)} /></label>
        <div className="sw-pii">
          {PII.map((p) => (
            <label key={p} className={f.pii.includes(p) ? "on" : ""}>
              <input type="checkbox" checked={f.pii.includes(p)} onChange={() => set("pii", f.pii.includes(p) ? f.pii.filter((x) => x !== p) : [...f.pii, p])} />
              {p}
            </label>
          ))}
        </div>
        <div className="sw-row2">
          <label>Max cost per answer: <b>${f.budget.toFixed(2)}</b><input type="range" min={0.02} max={1} step={0.01} value={f.budget} onChange={(e) => set("budget", +e.target.value)} /></label>
          <label>Value per resolved case: <b>${f.value}</b><input type="range" min={1} max={100} value={f.value} onChange={(e) => set("value", +e.target.value)} /></label>
        </div>
      </div>
      <div className="sw-draft">
        <div className="sw-draft-h">
          <span className={`chip ${errs ? "danger" : "emerald"}`}>{errs ? `${errs} issue(s)` : "Compiles"} · {res.cases[0]?.rules.length ?? 0} Lean rules</span>
          <button className="btn btn-primary btn-sm" onClick={() => { setSpec(spec); window.location.hash = "/studio"; }}>Open in Studio →</button>
        </div>
        <pre>{spec}</pre>
      </div>
    </div>
  );
}

// =====================================================================
// 3. Turnkey delivery plan
// =====================================================================
const MODULES = [
  { k: "rag", label: "Grounded assistant (RAG)", w: 3 },
  { k: "agent", label: "Agentic workflow", w: 4 },
  { k: "dash", label: "ROI dashboards", w: 2 },
  { k: "ft", label: "Fine-tuned model", w: 4 },
  { k: "core", label: "Core-banking integration", w: 3 },
  { k: "iam", label: "SSO & governance onboarding", w: 1 },
];

export function DeliveryPlan() {
  const [on, setOn] = useState<Record<string, boolean>>({ rag: true, dash: true, iam: true });
  const picked = MODULES.filter((m) => on[m.k]);
  const n = picked.length;
  const buildMax = Math.max(0, ...picked.map((m) => m.w));
  const buildSum = picked.reduce((a, m) => a + m.w, 0);
  const phases = [
    { k: "Discovery & value model", d: 2, c: "var(--gold)" },
    { k: "Case authoring & contracts", d: 1 + 0.5 * n, c: "var(--emerald)" },
    { k: "Build & integrate", d: Math.max(1, buildMax + 0.5 * (buildSum - buildMax)), c: "var(--cobalt)" },
    { k: "Verification (Lean, tests, red team)", d: 1 + 0.5 * n, c: "var(--cat-verify)" },
    { k: "UAT & model-risk review", d: 2, c: "var(--cat-curate)" },
    { k: "Go-live & hypercare", d: 2, c: "var(--turquoise)" },
  ];
  let t = 0;
  const bars = phases.map((p, i) => {
    const start = i === 3 ? t - p.d * 0.5 : t; // verification overlaps build
    const b = { ...p, start: Math.max(0, start), end: Math.max(0, start) + p.d };
    t = b.end;
    return b;
  });
  const total = Math.ceil(t);
  const W = 560, H = 236, ml = 210;
  const x = scaleLinear().domain([0, Math.max(total, 10)]).range([ml, W - 12]);
  const y = scaleBand().domain(phases.map((p) => p.k)).range([10, H - 26]).padding(0.28);
  return (
    <div className="sw sw-plan">
      <div className="sw-mods">
        {MODULES.map((m) => (
          <label key={m.k} className={on[m.k] ? "on" : ""}>
            <input type="checkbox" checked={!!on[m.k]} onChange={() => setOn({ ...on, [m.k]: !on[m.k] })} />
            {m.label}
          </label>
        ))}
        <div className="sw-total"><b>{total}</b> weeks to production<small>indicative · runs in your tenancy</small></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Indicative delivery plan">
        {Array.from({ length: Math.max(total, 10) + 1 }, (_, w) => (
          <g key={w}>
            <line x1={x(w)} x2={x(w)} y1={6} y2={H - 24} stroke="var(--rule)" strokeDasharray={w % 4 ? "2 3" : undefined} />
            {w % 2 === 0 && <text x={x(w)} y={H - 10} textAnchor="middle" className="sw-ax">w{w}</text>}
          </g>
        ))}
        {bars.map((b) => (
          <g key={b.k}>
            <text x={ml - 8} y={y(b.k)! + y.bandwidth() / 2 + 4} textAnchor="end" className="sw-gl">{b.k}</text>
            <rect x={x(b.start)} y={y(b.k)} width={Math.max(2, x(b.end) - x(b.start))} height={y.bandwidth()} rx={5} fill={b.c} opacity={0.85} style={{ transition: "all .45s cubic-bezier(.2,.8,.2,1)" }} />
          </g>
        ))}
        <g transform={`translate(${x(total)},${H - 30})`}>
          <rect x={-6} y={-6} width={12} height={12} transform="rotate(45)" fill="var(--gold)" style={{ transition: "all .45s" }} />
        </g>
      </svg>
    </div>
  );
}

// =====================================================================
// 4. Mini dashboard
// =====================================================================
const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const DASH = (() => {
  const rnd = seeded(42);
  const weights = [0.32, 0.36, 0.14, 0.06, 0.06, 0.04, 0.02];
  const rows: { w: number; e: string; seg: string; q: number; res: number; esc: number; cost: number }[] = [];
  for (let w = 0; w < 12; w++)
    EMIRATES.forEach((e, i) =>
      ["Retail", "Corporate"].forEach((seg) => {
        const base = 900 * weights[i] * (seg === "Retail" ? 1 : 0.35) * (1 + w * 0.06);
        const q = Math.round(base * (0.85 + rnd() * 0.3));
        const resRate = 0.78 + w * 0.012 + rnd() * 0.04;
        rows.push({ w, e, seg, q, res: Math.round(q * Math.min(0.97, resRate)), esc: Math.round(q * (0.07 - w * 0.003 + rnd() * 0.02)), cost: q * (0.021 - w * 0.0009 + rnd() * 0.002) });
      }),
    );
  return rows;
})();

export function MiniDashboard() {
  const [em, setEm] = useState("All");
  const [seg, setSeg] = useState("All");
  const [hover, setHover] = useState<string | null>(null);
  const rows = DASH.filter((r) => (em === "All" || r.e === em) && (seg === "All" || r.seg === seg));
  const sum = (k: "q" | "res" | "esc" | "cost", rs = rows) => rs.reduce((a, r) => a + r[k], 0);
  const weeks = Array.from({ length: 12 }, (_, w) => {
    const rs = rows.filter((r) => r.w === w);
    return { w, res: sum("res", rs), esc: sum("esc", rs) };
  });
  const byEm = EMIRATES.map((e) => {
    const rs = DASH.filter((r) => r.e === e && (seg === "All" || r.seg === seg));
    return { e, q: sum("q", rs), cpa: sum("cost", rs) / Math.max(1, sum("res", rs)) };
  });
  const W = 330, H = 170, m = { l: 34, r: 8, t: 10, b: 20 };
  const x = scaleLinear().domain([0, 11]).range([m.l, W - m.r]);
  const y = scaleLinear().domain([0, Math.max(1, ...weeks.map((d) => d.res)) * 1.1]).range([H - m.b, m.t]);
  const ln = (k: "res" | "esc") => line<(typeof weeks)[number]>().x((d) => x(d.w)).y((d) => y(d[k])).curve(curveMonotoneX)(weeks) ?? "";
  const bx = scaleBand().domain(EMIRATES).range([0, 220]).padding(0.25);
  const by = scaleLinear().domain([0, Math.max(...byEm.map((d) => d.q))]).range([0, 120]);
  const cpa = sum("cost") / Math.max(1, sum("res"));
  const value = sum("res") * 3.5;
  return (
    <div className="sw sw-dash">
      <div className="sw-filters">
        <select value={em} onChange={(e) => setEm(e.target.value)} aria-label="Emirate"><option>All</option>{EMIRATES.map((e) => <option key={e}>{e}</option>)}</select>
        <select value={seg} onChange={(e) => setSeg(e.target.value)} aria-label="Segment"><option>All</option><option>Retail</option><option>Corporate</option></select>
        <span className="muted" style={{ fontSize: 11.5 }}>Synthetic data · 12 weeks</span>
      </div>
      <div className="sw-kpis">
        <div><span>Inquiries</span><b>{sum("q").toLocaleString()}</b></div>
        <div><span>Resolved</span><b>{((sum("res") / Math.max(1, sum("q"))) * 100).toFixed(1)}%</b></div>
        <div><span>Cost / answer</span><b>${cpa.toFixed(3)}</b></div>
        <div><span>ROI</span><b style={{ color: "var(--emerald)" }}>{(value / Math.max(1, sum("cost"))).toFixed(0)}×</b></div>
      </div>
      <div className="sw-two">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly resolved and escalated">
          {y.ticks(3).map((t) => (
            <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" /><text x={m.l - 4} y={y(t) + 3} textAnchor="end" className="sw-ax">{t >= 1000 ? `${t / 1000}k` : t}</text></g>
          ))}
          <path d={ln("res")} fill="none" stroke="var(--emerald)" strokeWidth={2.2} style={{ transition: "d .5s" }} />
          <path d={ln("esc")} fill="none" stroke="var(--gold)" strokeWidth={2} strokeDasharray="4 3" style={{ transition: "d .5s" }} />
          {[0, 3, 6, 9, 11].map((w) => <text key={w} x={x(w)} y={H - 5} textAnchor="middle" className="sw-ax">W{w + 1}</text>)}
          <text x={W - m.r} y={m.t + 8} textAnchor="end" className="sw-ax" fill="var(--emerald)">resolved</text>
          <text x={W - m.r} y={m.t + 20} textAnchor="end" className="sw-ax" fill="var(--gold)">escalated</text>
        </svg>
        <svg viewBox="0 0 230 170" role="img" aria-label="Inquiries by emirate">
          {byEm.map((d) => {
            const sel = em === d.e || hover === d.e;
            return (
              <g key={d.e} onMouseEnter={() => setHover(d.e)} onMouseLeave={() => setHover(null)} onClick={() => setEm(em === d.e ? "All" : d.e)} style={{ cursor: "pointer" }}>
                <rect x={bx(d.e)! + 5} y={140 - by(d.q)} width={bx.bandwidth()} height={by(d.q)} rx={3} fill={sel ? "var(--cobalt)" : "var(--cobalt-soft)"} stroke="var(--cobalt)" strokeWidth={0.8} style={{ transition: "all .4s" }} />
                <text x={bx(d.e)! + 5 + bx.bandwidth() / 2} y={154} textAnchor="middle" className="sw-ax">{d.e.split(" ").map((w) => w[0]).join("")}</text>
                {hover === d.e && <text x={115} y={12} textAnchor="middle" className="sw-gl">{d.e}: {d.q.toLocaleString()} · ${d.cpa.toFixed(3)}/ans</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// =====================================================================
// 5. Fine-tuning advisor
// =====================================================================
export function FineTuneLab() {
  const [examples, setExamples] = useState(2.7); // log10
  const [shift, setShift] = useState(1); // 0 low 1 med 2 high
  const [sens, setSens] = useState(1); // 0 public 1 internal 2 restricted
  const [latency, setLatency] = useState(1200);
  const [knowledge, setKnowledge] = useState(true);
  const n = Math.round(10 ** examples);
  const plan: { k: string; why: string }[] = [];
  if (knowledge) plan.push({ k: "RAG over governed case files", why: "Facts change; retrieval keeps answers current and citable." });
  if (n < 300) plan.push({ k: "Prompt & contract engineering", why: "Too few labelled examples to train safely — encode behaviour as rules." });
  else if (n < 20000 || shift < 2) plan.push({ k: `LoRA / QLoRA (rank ${n < 2000 ? 8 : 16})`, why: `${n.toLocaleString()} examples suit parameter-efficient tuning for tone, format and domain terms.` });
  else plan.push({ k: "Full fine-tune or continued pre-training", why: "Large labelled corpus with strong domain shift." });
  if (sens === 2) plan.push({ k: "Open-weight model on-premises (e.g. Falcon, Jais) + vLLM", why: "Restricted data never leaves the bank's perimeter." });
  if (latency < 500) plan.push({ k: "Distil to a small model", why: `A ${latency} ms latency target needs a compact student model behind the gate.` });
  plan.push({ k: "Lean-gated evaluation harness", why: "Every candidate must pass the same contract before promotion." });
  const ranks = [8, 16, 64];
  const W = 320, H = 160, m = 26;
  const xs = scaleLinear().domain([0, 100]).range([m, W - 8]);
  const ys = scaleLinear().domain([0.3, 1.05]).range([H - 18, 8]);
  const curve = (rank: number) =>
    Array.from({ length: 51 }, (_, i) => {
      const s = i * 2;
      const cap = Math.log10(rank) / 2;
      const data = Math.min(1, examples / 4.3);
      const floor = 0.42 + 0.3 * (1 - data) - 0.06 * cap + 0.05 * shift;
      const overfit = Math.max(0, (cap - data * 0.9)) * Math.max(0, s - 40) * 0.006;
      return { s, v: floor + (1 - floor) * Math.exp(-s / (14 + 6 * cap)) + overfit };
    });
  const lg = line<{ s: number; v: number }>().x((d) => xs(d.s)).y((d) => ys(d.v)).curve(curveMonotoneX);
  return (
    <div className="sw sw-ft">
      <div className="sw-form">
        <label>Labelled examples: <b>{n.toLocaleString()}</b><input type="range" min={1} max={5} step={0.05} value={examples} onChange={(e) => setExamples(+e.target.value)} /></label>
        <label>Domain shift: <b>{["low", "medium", "high"][shift]}</b><input type="range" min={0} max={2} step={1} value={shift} onChange={(e) => setShift(+e.target.value)} /></label>
        <label>Data sensitivity: <b>{["public", "internal", "restricted"][sens]}</b><input type="range" min={0} max={2} step={1} value={sens} onChange={(e) => setSens(+e.target.value)} /></label>
        <label>Latency target: <b>{latency} ms</b><input type="range" min={150} max={3000} step={50} value={latency} onChange={(e) => setLatency(+e.target.value)} /></label>
        <label className="sw-inline"><input type="checkbox" checked={knowledge} onChange={(e) => setKnowledge(e.target.checked)} /> Answers depend on documents that change</label>
      </div>
      <div>
        <div className="label">Recommended path</div>
        <ol className="sw-plan-list">
          {plan.map((p) => <li key={p.k} className="fade-up"><b>{p.k}</b><span>{p.why}</span></li>)}
        </ol>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Illustrative validation loss by LoRA rank">
          <line x1={m} x2={W - 8} y1={H - 18} y2={H - 18} stroke="var(--rule-2)" />
          {ranks.map((r, i) => (
            <path key={r} d={lg(curve(r)) ?? ""} fill="none" stroke={["var(--emerald)", "var(--cobalt)", "var(--gold)"][i]} strokeWidth={2} style={{ transition: "d .4s" }} />
          ))}
          <text x={m} y={H - 4} className="sw-ax">steps →</text>
          <text x={W - 8} y={14} textAnchor="end" className="sw-ax">validation loss (illustrative)</text>
          {ranks.map((r, i) => <text key={r} x={W - 8} y={30 + i * 12} textAnchor="end" className="sw-ax" fill={["var(--emerald)", "var(--cobalt)", "var(--gold)"][i]}>rank {r}</text>)}
        </svg>
      </div>
    </div>
  );
}

// =====================================================================
// 6. Career radar
// =====================================================================
const AXES = ["ML foundations", "LLM engineering", "MLOps", "Data engineering", "Product sense", "Banking domain", "Leadership", "Communication"];
const ROLE_PROFILES: Record<string, number[]> = {
  "Head of AI": [4, 4, 3, 3, 5, 4, 5, 5],
  "ML / LLM Engineer": [4, 5, 4, 3, 2, 2, 2, 3],
  "AI Product Manager": [3, 3, 2, 2, 5, 4, 4, 5],
  "Data Scientist": [5, 3, 2, 3, 3, 3, 2, 3],
  "MLOps Engineer": [3, 3, 5, 4, 2, 2, 2, 3],
};
const ACTIONS: Record<string, string> = {
  "ML foundations": "Re-derive three classic models end-to-end; one Kaggle-style project with a written error analysis.",
  "LLM engineering": "Ship a RAG service with evaluation harness; tune a LoRA adapter and compare against prompting.",
  MLOps: "Containerise a model, add CI, canary rollout and drift monitoring on a free-tier cluster.",
  "Data engineering": "Build a medallion pipeline with dbt or Delta Live Tables and register it in a catalog.",
  "Product sense": "Write three one-page business cases with value-per-outcome and kill criteria.",
  "Banking domain": "Map one product end-to-end: regulation, controls, data flows and failure modes.",
  Leadership: "Lead a cross-functional review; practise saying no with a cost-of-delay argument.",
  Communication: "Present a technical result to a non-technical panel in 5 minutes; get scored feedback.",
};

export function CareerRadar() {
  const [me, setMe] = useState([3, 2, 2, 3, 3, 4, 3, 3]);
  const [role, setRole] = useState("Head of AI");
  const target = ROLE_PROFILES[role];
  const R = 92, cx = 120, cy = 112;
  const pt = (i: number, v: number) => {
    const a = (i / AXES.length) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * (R * v) / 5, cy + Math.sin(a) * (R * v) / 5];
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(",")).join(" ");
  const gaps = AXES.map((a, i) => ({ a, g: target[i] - me[i] })).filter((x) => x.g > 0).sort((p, q) => q.g - p.g).slice(0, 3);
  return (
    <div className="sw sw-career">
      <div className="sw-form">
        <label>Target role
          <select value={role} onChange={(e) => setRole(e.target.value)}>{Object.keys(ROLE_PROFILES).map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        {AXES.map((a, i) => (
          <label key={a} className="sw-slider">
            <span>{a}</span>
            <input type="range" min={0} max={5} step={1} value={me[i]} onChange={(e) => setMe(me.map((v, j) => (j === i ? +e.target.value : v)))} />
            <b>{me[i]}</b>
          </label>
        ))}
      </div>
      <div>
        <svg viewBox="-36 0 312 230" role="img" aria-label="Skills radar: you versus target role">
          {[1, 2, 3, 4, 5].map((k) => <polygon key={k} points={poly(AXES.map(() => k))} fill="none" stroke="var(--rule)" />)}
          {AXES.map((a, i) => {
            const [x, y] = pt(i, 5.9);
            return <text key={a} x={x} y={y} textAnchor="middle" className="sw-ax" dy="0.3em">{a.split(" ")[0]}</text>;
          })}
          <polygon points={poly(target)} fill="var(--gold)" fillOpacity={0.15} stroke="var(--gold)" strokeWidth={1.5} strokeDasharray="4 3" />
          <polygon points={poly(me)} fill="var(--emerald)" fillOpacity={0.25} stroke="var(--emerald)" strokeWidth={2} style={{ transition: "all .35s" }} />
        </svg>
        <div className="label">Your 90-day focus</div>
        {gaps.length ? (
          <ol className="sw-plan-list">
            {gaps.map((g) => <li key={g.a}><b>{g.a} (+{g.g})</b><span>{ACTIONS[g.a]}</span></li>)}
          </ol>
        ) : (
          <p style={{ fontSize: 14 }}>You already match the {role} profile — time to prepare the interview loop.</p>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// 7. Academy + mock interviews
// =====================================================================
const CURRICULUM = [
  { k: "AI economics & ROI for leaders", h: 3 },
  { k: "LLMs, agents and RAG — demystified", h: 3 },
  { k: "AI governance & UAE regulation", h: 3 },
  { k: "Writing business cases in CaseSpine", h: 4 },
  { k: "Building and leading AI teams", h: 2 },
  { k: "Vendor & model evaluation", h: 2 },
  { k: "Data strategy for AI", h: 2 },
];
const QUESTIONS: Record<string, { q: string; good: string[] }[]> = {
  "Head of AI": [
    { q: "Your CEO wants a GenAI assistant in 90 days. How do you decide what to build first?", good: ["Value per outcome × volume, not novelty", "Data readiness and control owners identified", "Kill criteria and a budget ceiling agreed upfront"] },
    { q: "How would you prove to the risk committee that an LLM answer is compliant?", good: ["Rules as testable contracts", "Citations and abstention", "Human escalation and an audit trail"] },
    { q: "Tell us about an AI project you stopped. Why and how?", good: ["Clear leading indicators", "Sunk-cost discipline", "What was reused"] },
  ],
  "ML / LLM Engineer": [
    { q: "Design a RAG system for 50,000 policy pages in English and Arabic.", good: ["Chunking and Arabic normalisation", "Hybrid sparse + dense retrieval with fusion", "Evaluation set and regression tests"] },
    { q: "When would you fine-tune instead of using retrieval?", good: ["Behaviour/format vs knowledge", "Data volume and drift", "Cost and latency trade-offs"] },
    { q: "How do you keep token spend under a hard ceiling?", good: ["Pre-flight gates", "Model ladder and compression", "Caching and per-tenant budgets"] },
  ],
  "AI Product Manager": [
    { q: "Define success metrics for a branch-officer assistant.", good: ["Resolution and deflection rates", "Cost per answer and escalation rate", "Quality via grounded-citation coverage"] },
    { q: "Compliance wants every answer reviewed by a human. What do you propose?", good: ["Risk-tiered review", "Gate-based sampling", "Evidence from the audit ledger"] },
  ],
  "Data Scientist": [
    { q: "How would you test a pricing model for unfair differences across nationality?", good: ["Counterfactual perturbations", "Distribution distance (e.g. JSD) thresholds", "Business-justified factors documented"] },
    { q: "Explain reciprocal rank fusion to a business stakeholder.", good: ["Combines two rankings robustly", "No score calibration needed", "Simple example"] },
  ],
};

export function Academy() {
  const [tab, setTab] = useState<"prog" | "mock">("prog");
  const [mods, setMods] = useState<string[]>(CURRICULUM.slice(0, 4).map((c) => c.k));
  const [role, setRole] = useState("Head of AI");
  const [qi, setQi] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [secs, setSecs] = useState(120);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSecs((s) => (s <= 1 ? (setRunning(false), 0) : s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);
  const qs = QUESTIONS[role];
  const q = qs[qi % qs.length];
  const hours = CURRICULUM.filter((c) => mods.includes(c.k)).reduce((a, c) => a + c.h, 0);
  const next = (d: number) => { setQi((qi + d + qs.length) % qs.length); setReveal(false); setSecs(120); setRunning(false); };
  return (
    <div className="sw sw-acad">
      <div className="sw-tabs">
        <button className={tab === "prog" ? "on" : ""} onClick={() => setTab("prog")}>Executive programme</button>
        <button className={tab === "mock" ? "on" : ""} onClick={() => setTab("mock")}>Mock interview</button>
      </div>
      {tab === "prog" ? (
        <div className="sw-two">
          <div className="sw-mods">
            {CURRICULUM.map((c) => (
              <label key={c.k} className={mods.includes(c.k) ? "on" : ""}>
                <input type="checkbox" checked={mods.includes(c.k)} onChange={() => setMods(mods.includes(c.k) ? mods.filter((x) => x !== c.k) : [...mods, c.k])} />
                {c.k} <small>{c.h}h</small>
              </label>
            ))}
          </div>
          <div className="sw-side">
            <div className="sw-total"><b>{hours}</b> hours · {Math.ceil(hours / 6)} day{Math.ceil(hours / 6) === 1 ? "" : "s"}<small>on-site in Abu Dhabi or Dubai, or live online · English or Arabic</small></div>
            <p style={{ fontSize: 14 }}>Each module ends with a hands-on exercise in the CaseSpine sandbox, so managers leave able to write and review a governed AI business case.</p>
          </div>
        </div>
      ) : (
        <div>
          <div className="sw-filters">
            <select value={role} onChange={(e) => { setRole(e.target.value); setQi(0); setReveal(false); setSecs(120); setRunning(false); }} aria-label="Role">
              {Object.keys(QUESTIONS).map((r) => <option key={r}>{r}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>Question {(qi % qs.length) + 1} / {qs.length}</span>
            <span className={`sw-timer${secs < 30 ? " low" : ""}`}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setRunning(!running)}>{running ? "Pause" : "Start timer"}</button>
          </div>
          <div className="sw-card fade-up" key={role + qi}>
            <p className="sw-q">“{q.q}”</p>
            {reveal ? (
              <ul>{q.good.map((g) => <li key={g}>{g}</li>)}</ul>
            ) : (
              <button className="btn btn-gold btn-sm" onClick={() => setReveal(true)}>Reveal what good looks like</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => next(-1)}>← Previous</button>
            <button className="btn btn-ghost btn-sm" onClick={() => next(1)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
