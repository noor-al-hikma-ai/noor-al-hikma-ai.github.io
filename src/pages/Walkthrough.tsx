import { useEffect, useMemo, useRef, useState } from "react";
import { Logo, Octagram } from "../components/Logo";
import { PipelineFigure } from "../components/PipelineFigure";
import { RoiSim } from "../components/RoiSim";
import { ArchetypeStar, LedgerChain, RolesFigure, SovereignStack } from "../components/Figures";
import { CaseCanvas } from "../components/CaseCanvas";
import { compileSpec } from "../lib/casespine/analyze";
import { RETAIL_WIRE_EN } from "../lib/casespine/examples";
import { contactHref, SITE } from "../config";
import { useRoute } from "../router";
import "./walkthrough.css";

function Typewriter({ text, speed = 14, className }: { text: string; speed?: number; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((x) => (x >= text.length ? x : x + 3)), speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return (
    <pre className={className}>
      {text.slice(0, n)}
      <span className="wt-caret">▍</span>
    </pre>
  );
}

const CASE_PROSE = `“Branch officers keep asking Compliance about wire-transfer rules.
Let them ask an assistant instead — but only about our policies.
Never reveal a customer's IBAN or Emirates ID.
Every answer must cite the policy page it came from.
Don't spend more than ten cents a question.
If it isn't sure, it goes to the Head of Retail Compliance.”`;

const CASE_DSL = `Case: Retail Wire Policy Inquiry
Lanes:
  Branch Compliance Officer: { SSO Provider: Microsoft Entra ID }
  Head of Retail Compliance: { Roles: [HITM_APPROVER] }
Case File:
  Wire Transfer Policies:
    Curation: redact [UAE_IBAN, EMIRATES_ID] and require coherence >= 0.85
Binding Lean Contract:
  Rules:
    - It is obligatory that citation coverage >= 90% before Milestone InquiryResolved.
Cost & Traffic Guards:
  Budget Ceiling: 4000 tokens or $0.10
  Banned Topics: [investment advice]
Process Flow:
  - Stage 1 (Answer):
      On Breach:
        Escalate To: Head of Retail Compliance`;

const EN_RULES = `Rules:
  - It is obligatory that citation coverage >= 90%
    and tokens consumed <= 4000
    before Milestone InquiryResolved.
  - It is prohibited that cross-case
    confounders > 0.`;

const AR_RULES = `القواعد:
  - يجب أن تكون تغطية الاستشهادات >= 90%
    والرموز المستهلكة <= 4000
    قبل المعلم InquiryResolved.
  - يحظر أن تكون المتداخلات بين الحالات > 0.`;

interface Slide {
  kicker: string;
  title: string;
  ar?: string;
  body: () => React.ReactNode;
}

function GateDiagram() {
  return (
    <svg viewBox="0 0 640 230" className="wt-gate" role="img" aria-label="Exit gateway outcomes">
      <rect x={20} y={88} width={150} height={54} rx={10} fill="var(--card)" stroke="var(--rule-2)" />
      <text x={95} y={120} textAnchor="middle" className="wt-t">Stage output</text>
      <path d="M170,115 H232" stroke="var(--rule-2)" strokeWidth={2} />
      <g transform="translate(270,115) rotate(45)">
        <rect x={-34} y={-34} width={68} height={68} fill="var(--card)" stroke="var(--cat-verify)" strokeWidth={2.5} />
      </g>
      <text x={270} y={112} textAnchor="middle" className="wt-t" fill="var(--cat-verify)">⊢ Lean</text>
      <text x={270} y={128} textAnchor="middle" className="wt-s">contract</text>
      {[
        { y: 34, c: "var(--emerald)", t: "all rules hold", r: "emit deliverable · reach milestone" },
        { y: 115, c: "var(--danger)", t: "a rule fails", r: "halt loudly · compensate · escalate" },
        { y: 196, c: "var(--warn)", t: "a probe is unbound", r: "fail closed · human decides" },
      ].map((o) => (
        <g key={o.y}>
          <path d={`M318,115 C 360,115 360,${o.y} 400,${o.y}`} fill="none" stroke={o.c} strokeWidth={2} />
          <circle cx={404} cy={o.y} r={5} fill={o.c} />
          <text x={416} y={o.y - 3} className="wt-t" fill={o.c}>{o.t}</text>
          <text x={416} y={o.y + 14} className="wt-s">{o.r}</text>
        </g>
      ))}
    </svg>
  );
}

const PROBLEMS = [
  { k: "Unbounded cost", d: "Token spend is a meter nobody reads until the invoice arrives. One runaway integration can burn a quarter's budget in an afternoon.", g: "¤" },
  { k: "Unprovable outputs", d: "Compliance reviews screenshots, not guarantees. Nobody can say which rule an answer satisfied — or violated.", g: "⊬" },
  { k: "Lost in translation", d: "Business → product → data → ML → MLOps → risk. Six hand-offs, six documents, and the original intent erodes at each one.", g: "⇄" },
];

export default function Walkthrough() {
  const { anchor } = useRoute();
  const touch = useRef<number | null>(null);
  const demoCase = useMemo(() => compileSpec(RETAIL_WIRE_EN).root!, []);

  const slides: Slide[] = [
    {
      kicker: "Noor Al Hikma AI",
      title: "The business case is the program.",
      ar: "دراسة الحالة هي البرنامج",
      body: () => (
        <div className="wt-hero">
          <div className="wt-hero-orn"><Octagram size={520} opacity={0.22} /></div>
          <Logo size={86} />
          <p className="wt-lede">
            Write the case in plain English or Arabic. Get a running AI application whose outputs are proven against your rules and whose
            spend never exceeds your budget — deployable in UAE banks.
          </p>
          <div className="wt-hint">Press <span className="kbd">→</span> or swipe to begin · <span className="kbd">Esc</span> to exit</div>
        </div>
      ),
    },
    {
      kicker: "Why AI programmes stall",
      title: "Three gaps between the business case and production",
      body: () => (
        <div className="wt-cols">
          {PROBLEMS.map((p, k) => (
            <div key={p.k} className="wt-card fade-up" style={{ animationDelay: `${k * 0.12}s` }}>
              <div className="wt-glyph">{p.g}</div>
              <h3>{p.k}</h3>
              <p>{p.d}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      kicker: "The idea",
      title: "Say it once. The compiler writes the system.",
      body: () => (
        <div className="wt-split">
          <div>
            <div className="label">What the business owner says</div>
            <blockquote className="wt-quote">{CASE_PROSE}</blockquote>
          </div>
          <div>
            <div className="label">What they write in CaseSpine</div>
            <Typewriter text={CASE_DSL} className="wt-code" />
          </div>
        </div>
      ),
    },
    {
      kicker: "Bilingual by construction",
      title: "English or Arabic — the same Lean 4 contract",
      ar: "بالعربية أو بالإنجليزية — نفس العقد",
      body: () => (
        <div className="wt-split wt-eq">
          <pre className="wt-code">{EN_RULES}</pre>
          <div className="wt-equiv">≡</div>
          <pre className="wt-code" dir="rtl" lang="ar">{AR_RULES}</pre>
          <pre className="wt-code wt-lean">{`(s.citationCoverageMillipoints ≥ 900 ∧ s.tokensConsumed ≤ 4000)
s.crossCaseConfoundersCount ≤ 0`}</pre>
        </div>
      ),
    },
    {
      kicker: "Compile",
      title: "From one document to the whole toolchest",
      body: () => (
        <div className="wt-frame">
          <PipelineFigure height={460} />
        </div>
      ),
    },
    {
      kicker: "Prove",
      title: "Nothing ships unless the contract holds",
      body: () => (
        <div className="wt-split">
          <div>
            <pre className="wt-code wt-lean" style={{ fontSize: 13 }}>{`def ProcessContract (s : ProcessCaseState) : Prop :=
  (s.piiRedacted = true ∧ s.coherenceMillipoints ≥ 850) ∧
  s.crossCaseConfoundersCount ≤ 0 ∧
  (s.citationCoverageMillipoints ≥ 900 ∧
   s.tokensConsumed ≤ 4000)

-- the compiler finds a witness; Lean checks it
example : ProcessContract witness := by decide`}</pre>
            <p className="wt-note">Contradictory rules are caught at compile time — before anything is deployed.</p>
          </div>
          <GateDiagram />
        </div>
      ),
    },
    {
      kicker: "Govern",
      title: "Eight levers keep ROI inside the contract",
      body: () => (
        <div className="wt-frame">
          <RoiSim compact />
        </div>
      ),
    },
    {
      kicker: "Visualise",
      title: "Every case is also a picture you can edit",
      body: () => (
        <div className="wt-frame" style={{ height: 470 }}>
          <CaseCanvas ast={demoCase} height={470} />
          <p className="wt-note" style={{ padding: "0 14px" }}>Drag widgets in the Studio and the text updates; edit the text and the picture follows.</p>
        </div>
      ),
    },
    {
      kicker: "Collaborate",
      title: "Every role contributes with what it already has",
      body: () => (
        <div className="wt-frame">
          <RolesFigure />
        </div>
      ),
    },
    {
      kicker: "Generalise",
      title: "One language, eight solution archetypes",
      body: () => (
        <div className="wt-frame">
          <ArchetypeStar />
        </div>
      ),
    },
    {
      kicker: "Deploy",
      title: "Sovereign by design for UAE financial institutions",
      ar: "سيادة البيانات في دولة الإمارات",
      body: () => (
        <div className="wt-frame">
          <SovereignStack />
          <div className="wt-chips">
            {["CBUAE AI guidance note (2026)", "CBUAE Model Management Standards", "CBUAE Outsourcing Regulation", "UAE PDPL (FDL 45/2021)", "AML/CFT (FDL 10/2025)", "HSA / AAOIFI Sharia standards", "UAE IA Regulation", "DIFC & ADGM data protection"].map((c) => (
              <span key={c} className="chip gold">{c}</span>
            ))}
          </div>
        </div>
      ),
    },
    {
      kicker: "Audit",
      title: "An audit trail the auditor can verify alone",
      body: () => (
        <div className="wt-frame">
          <LedgerChain />
          <p className="wt-note" style={{ padding: "0 18px 14px" }}>
            Compilation, ingestion, queries, gate decisions and human approvals are SHA-256 chained and exported as W3C PROV-O.
          </p>
        </div>
      ),
    },
    {
      kicker: "Try it now",
      title: "From slides to a running case in your browser",
      body: () => (
        <div className="wt-cols">
          {[
            { h: "#/studio", t: "Studio", d: "Write a case with autocompletion and hints; watch the canvas, Lean contract and cloud scaffolds update.", c: "btn-primary" },
            { h: "#/sandbox", t: "RAG Sandbox", d: "Drop your own PDFs. Ask questions. See the gates, the citations and the audit ledger — all local.", c: "btn-emerald" },
            { h: "#/services", t: "Services", d: "Discovery sprints, turnkey delivery, dashboards, fine-tuning, coaching and executive education.", c: "btn-gold" },
          ].map((x) => (
            <a key={x.t} className="wt-card wt-link" href={x.h}>
              <h3>{x.t} →</h3>
              <p>{x.d}</p>
            </a>
          ))}
          <div style={{ gridColumn: "1 / -1", textAlign: "center", marginTop: 8 }}>
            <a className="btn btn-emerald" href={contactHref()}>Request a pilot</a>
          </div>
        </div>
      ),
    },
  ];

  const n = slides.length;
  // The slide index lives in the URL (#/walkthrough#3) so deep links and Back work.
  const i = Math.max(0, Math.min(n - 1, parseInt(anchor ?? "0", 10) || 0));
  const go = (k: number) => {
    const next = Math.max(0, Math.min(n - 1, k));
    if (next !== i) window.location.hash = `/walkthrough#${next}`;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(i + 1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(i - 1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(n - 1);
      else if (e.key === "Escape") window.location.hash = "/paper";
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const s = slides[i];
  return (
    <div
      className="wt"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 60 && !(e.target as HTMLElement).closest(".cv-stage,svg")) go(i + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
    >
      <header className="wt-top">
        <a href="#/paper" className="nav-brand" aria-label="Back to the paper">
          <Logo size={26} />
          <b>{SITE.name}</b>
        </a>
        <span className="wt-count">{String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
        <a href="#/paper" className="btn btn-ghost btn-sm">Exit ✕</a>
      </header>
      <section className="wt-slide" key={i} aria-live="polite">
        <div className="wt-kicker">{s.kicker}</div>
        <h2 className="wt-title">{s.title}</h2>
        {s.ar && <div className="wt-ar" lang="ar">{s.ar}</div>}
        <div className="wt-body">{s.body()}</div>
      </section>
      <footer className="wt-bottom">
        <button className="btn btn-ghost btn-sm" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide">← Prev</button>
        <div className="wt-dots" role="tablist">
          {slides.map((x, k) => (
            <button key={k} className={k === i ? "on" : k < i ? "past" : ""} onClick={() => go(k)} aria-label={`Slide ${k + 1}: ${x.title}`} />
          ))}
        </div>
        <button className="btn btn-emerald btn-sm" onClick={() => go(i + 1)} disabled={i === n - 1} aria-label="Next slide">Next →</button>
        <div className="wt-progress" style={{ width: `${((i + 1) / n) * 100}%` }} />
      </footer>
    </div>
  );
}
