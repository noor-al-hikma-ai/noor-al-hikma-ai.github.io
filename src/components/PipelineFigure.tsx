import { useEffect, useState } from "react";

// Figure 1: business text -> parse -> SBVR clauses -> Lean 4 / Z3 -> IR + .csar
// -> orchestrated toolchest. Particles show work flowing through the compiler.

const SPEC_LINES = [
  { t: "Case: Retail Wire Policy Inquiry", c: "var(--cs-heading)" },
  { t: "Case File: Wire Transfer Policies", c: "var(--cs-heading)" },
  { t: "  Curation: redact [UAE_IBAN, EMIRATES_ID]", c: "var(--cs-key)" },
  { t: "Binding Lean Contract:", c: "var(--cs-heading)" },
  { t: "  - It is obligatory that citation", c: "var(--cs-modal)" },
  { t: "    coverage >= 90% before Milestone", c: "var(--cs-modal)" },
  { t: "    InquiryResolved.", c: "var(--cs-milestone)" },
  { t: "Cost & Traffic Guards:", c: "var(--cs-heading)" },
  { t: "  Budget Ceiling: 4000 tokens or $0.10", c: "var(--cs-key)" },
  { t: "  Model Ladder: [large, medium, small]", c: "var(--cs-key)" },
  { t: "Process Flow:", c: "var(--cs-heading)" },
  { t: "  - Retrieve … with RRF Reranker", c: "var(--ink-2)" },
  { t: "    Escalate To: Head of Compliance", c: "var(--cs-key)" },
];

const STAGES = [
  { k: "Parse", s: "literate YAML · EN / AR" },
  { k: "Formalise", s: "SBVR → typed clauses" },
  { k: "Prove", s: "Lean 4 · Z3 · witness" },
  { k: "Assemble", s: "IR → .csar orchestrator" },
];

const TARGETS = [
  { k: "LangGraph agents", c: "var(--cat-reason)" },
  { k: "Python tools & tests", c: "var(--cat-reason)" },
  { k: "AWS Step Functions", c: "var(--cat-act)" },
  { k: "Vertex AI · Workflows", c: "var(--cat-act)" },
  { k: "Databricks bundles", c: "var(--cat-data)" },
  { k: "Kubernetes · KEDA", c: "var(--cat-govern)" },
  { k: "ROI dashboards", c: "var(--cat-retrieve)" },
  { k: "Audit ledger", c: "var(--cat-verify)" },
];

export function PipelineFigure({ height = 420 }: { height?: number }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 40), 260);
    return () => clearInterval(id);
  }, []);
  const W = 1000, H = 420;
  const sx = 380, sw = 150, sGap = 18;
  const stageY = (i: number) => 60 + i * (66 + sGap);
  const tx = 760;
  const targetY = (i: number) => 34 + i * 46;
  const shown = Math.min(SPEC_LINES.length, step);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", maxHeight: height, display: "block" }} role="img" aria-label="CaseSpine compilation pipeline">
      <defs>
        <linearGradient id="pf-fade" x1="0" x2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.15" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* spec panel */}
      <rect x={16} y={20} width={320} height={380} rx={10} fill="var(--paper-2)" stroke="var(--rule)" />
      <text x={30} y={44} className="pf-label">BUSINESS CASE · CONSTRAINED ENGLISH</text>
      {SPEC_LINES.map((l, i) => (
        <text key={i} x={30} y={72 + i * 24} fontFamily="var(--mono)" fontSize={12.2} fill={l.c} opacity={i < shown ? 1 : 0.12} style={{ transition: "opacity .3s" }}>
          {l.t}
        </text>
      ))}
      {/* stages */}
      {STAGES.map((s, i) => {
        const active = step >= SPEC_LINES.length + i * 3;
        return (
          <g key={s.k}>
            <rect x={sx} y={stageY(i)} width={sw + 160} height={66} rx={10} fill="var(--card)" stroke={active ? "var(--emerald)" : "var(--rule-2)"} strokeWidth={active ? 2 : 1} style={{ transition: "stroke .3s" }} />
            <text x={sx + 18} y={stageY(i) + 28} fontFamily="var(--serif)" fontSize={18} fontWeight={650} fill="var(--ink)">
              {i + 1}. {s.k}
            </text>
            <text x={sx + 18} y={stageY(i) + 50} fontFamily="var(--sans)" fontSize={12.5} fill="var(--ink-3)">
              {s.s}
            </text>
            {i < STAGES.length - 1 && <path d={`M${sx + 155},${stageY(i) + 66} v${sGap}`} stroke="var(--rule-2)" strokeWidth={1.5} markerEnd="url(#pf-arr)" />}
          </g>
        );
      })}
      <path d={`M336,210 C 356,210 356,${stageY(0) + 33} ${sx},${stageY(0) + 33}`} fill="none" stroke="var(--gold)" strokeWidth={1.6} />
      {/* fan-out */}
      {TARGETS.map((t, i) => {
        const y = targetY(i);
        const d = `M${sx + sw + 160},${stageY(3) + 33} C ${tx - 60},${stageY(3) + 33} ${tx - 70},${y + 14} ${tx},${y + 14}`;
        const on = step >= SPEC_LINES.length + 12;
        return (
          <g key={t.k}>
            <path id={`pf-p${i}`} d={d} fill="none" stroke={on ? t.c : "var(--rule)"} strokeOpacity={on ? 0.55 : 1} strokeWidth={1.4} style={{ transition: "stroke .4s" }} />
            {on && (
              <circle r={3.2} fill={t.c}>
                <animateMotion dur={`${1.6 + (i % 3) * 0.35}s`} repeatCount="indefinite" begin={`${i * 0.15}s`}>
                  <mpath href={`#pf-p${i}`} />
                </animateMotion>
              </circle>
            )}
            <rect x={tx} y={y} width={222} height={30} rx={15} fill="var(--card)" stroke={on ? t.c : "var(--rule-2)"} style={{ transition: "stroke .4s" }} />
            <circle cx={tx + 16} cy={y + 15} r={5} fill={t.c} opacity={on ? 1 : 0.3} />
            <text x={tx + 30} y={y + 19.5} fontFamily="var(--sans)" fontSize={13} fill="var(--ink)">
              {t.k}
            </text>
          </g>
        );
      })}
      <text x={tx} y={H - 10} className="pf-label">ORCHESTRATED TOOLCHEST</text>
      <defs>
        <marker id="pf-arr" viewBox="0 0 10 10" refX="5" refY="8" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M1,1 L5,8 L9,1" fill="none" stroke="var(--rule-2)" strokeWidth="1.5" />
        </marker>
      </defs>
      <style>{`.pf-label{font-family:var(--sans);font-size:10.5px;font-weight:650;letter-spacing:.09em;fill:var(--ink-3)}`}</style>
    </svg>
  );
}
