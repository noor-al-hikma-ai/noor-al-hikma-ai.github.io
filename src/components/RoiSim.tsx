import { useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import { line, area, curveMonotoneX } from "d3-shape";

// Illustrative 24-hour simulation of the CaseSpine ROI governor. Parameters
// are assumptions for teaching the levers, not a forecast.

export interface Levers {
  preflight: boolean;
  topics: boolean;
  rate: boolean;
  cache: boolean;
  ladder: boolean;
  compression: boolean;
  downscale: boolean;
  gate: boolean;
}

export const LEVER_INFO: { key: keyof Levers; label: string; hint: string }[] = [
  { key: "preflight", label: "Pre-flight gate", hint: "Junk and off-topic queries blocked at 0 tokens" },
  { key: "topics", label: "Topic limiting", hint: "Banned topics never reach a model" },
  { key: "rate", label: "Rate limiting", hint: "A runaway integration at 14:00 is capped" },
  { key: "cache", label: "Semantic cache", hint: "Near-duplicates served from verified answers" },
  { key: "ladder", label: "Model downsizing", hint: "Tier steps down when burn exceeds plan" },
  { key: "compression", label: "Context compression", hint: "Fewer input tokens per call" },
  { key: "downscale", label: "Downscaling", hint: "Scale to zero overnight" },
  { key: "gate", label: "Lean gate + escalation", hint: "Wrong answers stopped and routed to people" },
];

const ALL_OFF: Levers = { preflight: false, topics: false, rate: false, cache: false, ladder: false, compression: false, downscale: false, gate: false };
export const ALL_ON: Levers = { preflight: true, topics: true, rate: true, cache: true, ladder: true, compression: true, downscale: true, gate: true };

const P = {
  daily: 6000,
  junk: 0.16,
  offTopic: 0.07,
  banned: 0.03,
  dup: 0.22,
  flood: 2200, // misconfigured integration at 14:00
  tokensIn: 3200,
  tokensOut: 320,
  price: { large: [3, 15], medium: [0.8, 4], small: [0.15, 0.6] } as Record<string, [number, number]>,
  quality: { large: 0.93, medium: 0.89, small: 0.84 } as Record<string, number>,
  infraPerHour: 1.6,
  valuePerAnswer: 3.5,
  incident: 25,
  regIncident: 250,
  human: 3,
  budget: 75,
};

function profile(h: number) {
  const day = Math.exp(-((h - 11) ** 2) / 10) + 0.85 * Math.exp(-((h - 16) ** 2) / 8) + 0.06;
  return day;
}

export interface SimPoint {
  h: number;
  spend: number;
  net: number;
  tier: string;
}

export function simulate(L: Levers) {
  const prof = Array.from({ length: 24 }, (_, h) => profile(h));
  const sum = prof.reduce((a, b) => a + b, 0);
  let spend = 0, value = 0, losses = 0, humans = 0, served = 0, blocked = 0, cached = 0, breachHour: number | null = null;
  const pts: SimPoint[] = [{ h: 0, spend: 0, net: 0, tier: "large" }];
  for (let h = 0; h < 24; h++) {
    const d = (P.daily * prof[h]) / sum;
    let legit = d * (1 - P.junk - P.offTopic - P.banned);
    let junk = d * (P.junk + P.offTopic);
    let banned = d * P.banned;
    let flood = h === 14 ? P.flood : 0;
    if (L.rate) flood = Math.min(flood, 120);
    if (L.preflight) {
      blocked += junk;
      junk = 0;
    }
    if (L.topics) {
      blocked += banned;
      banned = 0;
    }
    let hits = 0;
    if (L.cache) {
      hits = legit * P.dup;
      cached += hits;
      legit -= hits;
    }
    const plan = (P.budget * (h + 1)) / 24;
    let tier = "large";
    if (L.ladder) tier = spend > plan * 1.15 ? "small" : spend > plan * 0.8 ? "medium" : "large";
    const [pin, pout] = P.price[tier];
    const tin = P.tokensIn * (L.compression ? 0.62 : 1);
    const perCall = (tin * pin + P.tokensOut * pout) / 1e6;
    const calls = legit + junk + banned + flood;
    const infra = L.downscale && prof[h] / sum < 0.012 ? 0 : P.infraPerHour;
    spend += calls * perCall + infra;
    if (breachHour === null && spend > P.budget) breachHour = h;
    const q = P.quality[tier] - (L.compression ? 0.01 : 0);
    const answered = legit + hits;
    const wrong = legit * (1 - q);
    let caught = 0;
    if (L.gate) {
      caught = wrong * 0.88;
      humans += caught;
    }
    const slipped = wrong - caught;
    value += (answered - wrong + caught) * P.valuePerAnswer;
    losses += slipped * P.incident + junk * 0.05 * P.incident + banned * 0.15 * P.regIncident;
    served += answered;
    pts.push({ h: h + 1, spend, net: value - losses - humans * P.human, tier });
  }
  const net = value - losses - humans * P.human;
  return { pts, spend, value, losses, humans, served, blocked, cached, net, roi: net / spend, breachHour, budget: P.budget };
}

export function RoiSim({ compact, initial }: { compact?: boolean; initial?: Levers }) {
  const [L, setL] = useState<Levers>(initial ?? ALL_OFF);
  const sim = useMemo(() => simulate(L), [L]);
  const base = useMemo(() => simulate(ALL_OFF), []);
  const W = 640, H = compact ? 230 : 270, m = { l: 46, r: 16, t: 14, b: 26 };
  const x = scaleLinear().domain([0, 24]).range([m.l, W - m.r]);
  const yMax = Math.max(base.spend, sim.spend, P.budget) * 1.08;
  const y = scaleLinear().domain([0, yMax]).range([H - m.b, m.t]);
  const spendLine = line<SimPoint>().x((d) => x(d.h)).y((d) => y(d.spend)).curve(curveMonotoneX);
  const spendArea = area<SimPoint>().x((d) => x(d.h)).y0(y(0)).y1((d) => y(d.spend)).curve(curveMonotoneX);
  const onCount = Object.values(L).filter(Boolean).length;
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`);

  return (
    <div className={`roi${compact ? " compact" : ""}`}>
      <div className="roi-levers">
        {LEVER_INFO.map((l) => (
          <label key={l.key} className={L[l.key] ? "on" : ""} title={l.hint}>
            <input type="checkbox" checked={L[l.key]} onChange={() => setL({ ...L, [l.key]: !L[l.key] })} />
            <span className="roi-sw" aria-hidden="true" />
            <span>
              {l.label}
              {!compact && <small>{l.hint}</small>}
            </span>
          </label>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setL(ALL_ON)}>All levers on</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setL(ALL_OFF)}>Off</button>
        </div>
      </div>
      <div className="roi-chart">
        <div className="roi-kpis">
          <div><span className="label">Spend / day</span><b style={{ color: sim.spend > P.budget ? "var(--danger)" : "var(--ink)" }}>{fmt(sim.spend)}</b></div>
          <div><span className="label">Net value</span><b style={{ color: sim.net < 0 ? "var(--danger)" : "var(--emerald)" }}>{fmt(sim.net)}</b></div>
          <div><span className="label">Incidents avoided</span><b>{fmt(Math.max(0, base.losses - sim.losses))}</b></div>
          <div><span className="label">Levers</span><b>{onCount}/8</b></div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Cumulative spend against the daily budget ceiling">
          {y.ticks(4).map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
              <text x={m.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-3)" fontFamily="var(--sans)">${t}</text>
            </g>
          ))}
          {[0, 6, 12, 18, 24].map((h) => (
            <text key={h} x={x(h)} y={H - 8} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)" fontFamily="var(--sans)">{String(h).padStart(2, "0")}:00</text>
          ))}
          <path d={spendLine(base.pts) ?? ""} fill="none" stroke="var(--rule-2)" strokeWidth={1.5} strokeDasharray="4 4" />
          <path d={spendArea(sim.pts) ?? ""} fill="var(--cobalt)" opacity={0.1} style={{ transition: "d .5s" }} />
          <path d={spendLine(sim.pts) ?? ""} fill="none" stroke="var(--cobalt)" strokeWidth={2.4} style={{ transition: "d .5s" }} />
          <line x1={m.l} x2={W - m.r} y1={y(P.budget)} y2={y(P.budget)} stroke="var(--gold)" strokeWidth={1.6} strokeDasharray="6 4" />
          <text x={W - m.r} y={y(P.budget) - 6} textAnchor="end" fontSize={11} fill="var(--gold)" fontFamily="var(--sans)" fontWeight={600}>Budget Ceiling ${P.budget}/day</text>
          {sim.breachHour !== null && (
            <g>
              <circle cx={x(sim.breachHour + 1)} cy={y(P.budget)} r={5} fill="var(--danger)" />
              <text x={x(sim.breachHour + 1) + 8} y={y(P.budget) + 16} fontSize={11} fill="var(--danger)" fontFamily="var(--sans)" fontWeight={600}>breach at {String(sim.breachHour + 1).padStart(2, "0")}:00</text>
            </g>
          )}
          {sim.pts.slice(1).map((p, i) =>
            p.tier !== "large" ? <rect key={i} x={x(p.h - 1)} y={H - m.b - 4} width={x(1) - x(0)} height={4} fill={p.tier === "small" ? "var(--turquoise)" : "var(--cat-verify)"} opacity={0.7} /> : null,
          )}
        </svg>
        <div className="roi-legend">
          <span><i style={{ background: "var(--cobalt)" }} /> cumulative spend</span>
          <span><i style={{ background: "var(--rule-2)" }} /> no levers</span>
          {L.ladder && <span><i style={{ background: "var(--cat-verify)" }} /> medium tier <i style={{ background: "var(--turquoise)" }} /> small tier</span>}
          <span className="muted">Illustrative assumptions, not a forecast.</span>
        </div>
      </div>
      <style>{`
.roi{display:grid;grid-template-columns:230px 1fr;gap:18px;padding:16px;font-family:var(--sans)}
.roi.compact{grid-template-columns:200px 1fr;padding:12px}
@media(max-width:720px){.roi,.roi.compact{grid-template-columns:1fr}}
.roi-levers{display:flex;flex-direction:column;gap:4px}
.roi-levers label{display:grid;grid-template-columns:30px 1fr;gap:8px;align-items:start;font-size:13.5px;padding:4px 6px;border-radius:8px;cursor:pointer;color:var(--ink-2)}
.roi-levers label:hover{background:var(--paper-2)}
.roi-levers label.on{color:var(--ink)}
.roi-levers input{position:absolute;opacity:0;pointer-events:none}
.roi-levers label:focus-within{outline:2px solid var(--cobalt);outline-offset:1px}
.roi-levers small{display:block;font-size:11.5px;color:var(--ink-3);line-height:1.3}
.roi-sw{width:28px;height:16px;border-radius:99px;background:var(--rule-2);position:relative;margin-top:2px;transition:background .2s}
.roi-sw::after{content:"";position:absolute;width:12px;height:12px;border-radius:50%;background:var(--card);top:2px;left:2px;transition:transform .2s}
.roi-levers label.on .roi-sw{background:var(--emerald)}
.roi-levers label.on .roi-sw::after{transform:translateX(12px)}
.roi-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px}
@media(max-width:520px){.roi-kpis{grid-template-columns:repeat(2,1fr)}}
.roi-kpis>div{background:var(--paper-2);border-radius:8px;padding:6px 10px;display:flex;flex-direction:column}
.roi-kpis b{font-family:var(--serif);font-size:20px;font-variant-numeric:tabular-nums}
.roi-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;color:var(--ink-2);margin-top:4px}
.roi-legend i{display:inline-block;width:10px;height:3px;border-radius:2px;vertical-align:middle;margin:0 3px}
`}</style>
    </div>
  );
}
