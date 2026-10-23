import { useEffect, useMemo, useState, type ReactElement } from "react";
import "./scenes.css";

// Animated stand-ins for the landing-page films. Pure SVG + CSS (transform and
// opacity only), so they stay crisp at any resolution and cheap to render.
// Real footage replaces them through <VideoScene> once clips exist.

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function Skyline({ seed, base, maxH, color, opacity, needle }: { seed: number; base: number; maxH: number; color: string; opacity: number; needle?: number }) {
  const shapes = useMemo(() => {
    const r = rng(seed);
    const out: ReactElement[] = [];
    let x = -40;
    let k = 0;
    while (x < 1700) {
      const w = 34 + r() * 70;
      const h = maxH * (0.3 + r() * 0.7);
      const taper = r() > 0.7;
      out.push(
        taper ? (
          <path key={k++} d={`M${x},${base} L${x + w * 0.15},${base - h} L${x + w * 0.5},${base - h - 18} L${x + w * 0.85},${base - h} L${x + w},${base} Z`} />
        ) : (
          <rect key={k++} x={x} y={base - h} width={w} height={h} rx={2} />
        ),
      );
      x += w + 6 + r() * 14;
    }
    if (needle !== undefined) {
      const nx = needle;
      out.push(<path key={k++} d={`M${nx - 34},${base} L${nx - 12},${base - maxH * 1.6} L${nx - 4},${base - maxH * 2.4} L${nx},${base - maxH * 2.9} L${nx + 4},${base - maxH * 2.4} L${nx + 12},${base - maxH * 1.6} L${nx + 34},${base} Z`} />);
    }
    return out;
  }, [seed, base, maxH, needle]);
  return (
    <g fill={color} opacity={opacity}>
      {shapes}
    </g>
  );
}

/** 1 · Dawn over a calm Gulf city. */
export function DawnScene() {
  return (
    <svg className="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Sunrise over a calm city by the sea">
      <defs>
        <linearGradient id="dw-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="0.45" stopColor="#fff1d6" />
          <stop offset="0.75" stopColor="#ffe0bf" />
          <stop offset="1" stopColor="#fbd3b4" />
        </linearGradient>
        <radialGradient id="dw-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="0.35" stopColor="#ffe3a3" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffd28a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dw-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dcc7" />
          <stop offset="1" stopColor="#e9e2d6" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#dw-sky)" />
      <g className="sc-rays" style={{ transformOrigin: "1050px 560px" }}>
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M1050,560 L${1050 + Math.cos((i / 14) * Math.PI * 2) * 1200},${560 + Math.sin((i / 14) * Math.PI * 2) * 1200} L${1050 + Math.cos(((i + 0.25) / 14) * Math.PI * 2) * 1200},${560 + Math.sin(((i + 0.25) / 14) * Math.PI * 2) * 1200} Z`} fill="#fff4d8" opacity="0.35" />
        ))}
      </g>
      <g className="sc-sunrise">
        <circle cx="1050" cy="560" r="300" fill="url(#dw-sun)" />
        <circle cx="1050" cy="560" r="78" fill="#fff3d1" />
      </g>
      <g className="sc-drift-slow">
        <Skyline seed={7} base={640} maxH={150} color="#c9cde0" opacity={0.55} needle={980} />
      </g>
      <g className="sc-drift">
        <Skyline seed={19} base={660} maxH={110} color="#aeb8d2" opacity={0.6} />
      </g>
      <rect y="655" width="1600" height="245" fill="url(#dw-sea)" />
      <g className="sc-shimmer" stroke="#fff8e8" strokeWidth="3" strokeLinecap="round" opacity="0.8">
        {Array.from({ length: 22 }, (_, i) => (
          <line key={i} x1={980 + ((i * 37) % 180) - 90} x2={1020 + ((i * 37) % 180) - 90 + (i % 3) * 18} y1={680 + i * 9} y2={680 + i * 9} style={{ animationDelay: `${(i % 7) * 0.4}s` }} />
        ))}
      </g>
      <g className="sc-dhow">
        <path d="M0,0 C30,10 90,10 120,0 L110,14 L12,14 Z" fill="#9aa5c4" />
        <path d="M58,0 L58,-70 L100,-8 Z" fill="#f4ebe0" stroke="#9aa5c4" strokeWidth="2" />
        <path d="M55,-4 L55,-52 L22,-6 Z" fill="#f7efe5" stroke="#9aa5c4" strokeWidth="2" />
      </g>
      {[0, 1, 2].map((i) => (
        <path key={i} className="sc-bird" style={{ animationDelay: `${i * 3.5}s` }} d="M0,0 q8,-8 16,0 q8,-8 16,0" fill="none" stroke="#8d94ad" strokeWidth="2.2" strokeLinecap="round" />
      ))}
    </svg>
  );
}

const QUESTION_AR = "هل يمكننا بيع بضائع بقيمة مليوني درهم لمشترٍ جديد بأجل ٩٠ يومًا؟";
const QUESTION_EN = "Can we sell AED 2 million of goods to a new buyer on 90-day terms?";

/** 2 · She asks in her own words. */
export function AskScene() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x > QUESTION_AR.length + 40 ? 0 : x + 1)), 70);
    return () => clearInterval(id);
  }, []);
  const typed = QUESTION_AR.slice(0, Math.min(n, QUESTION_AR.length));
  const done = n >= QUESTION_AR.length;
  return (
    <svg className="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A question typed in Arabic on a phone">
      <defs>
        <linearGradient id="as-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff9ec" />
          <stop offset="1" stopColor="#f3efe6" />
        </linearGradient>
        <filter id="as-blur">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      <rect width="1600" height="900" fill="url(#as-bg)" />
      <g filter="url(#as-blur)">
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} className="sc-bokeh" style={{ animationDelay: `${i * 0.9}s` }} cx={120 + ((i * 137) % 1400)} cy={140 + ((i * 251) % 640)} r={40 + (i % 4) * 26} fill={["#ffe4b8", "#dff1e8", "#e3ebfb", "#fbe6d9"][i % 4]} opacity="0.85" />
        ))}
      </g>
      {/* coffee + notebook */}
      <g transform="translate(260,560)">
        <ellipse cx="90" cy="150" rx="150" ry="22" fill="#e8dfcf" opacity="0.6" />
        <rect x="0" y="40" width="190" height="120" rx="10" fill="#fffdf8" stroke="#e4d8b8" />
        {[0, 1, 2, 3].map((i) => <line key={i} x1="20" x2={150 - i * 18} y1={70 + i * 20} y2={70 + i * 20} stroke="#e4d8b8" strokeWidth="3" strokeLinecap="round" />)}
        <g transform="translate(250,40)">
          <path d="M0,10 h90 v60 a30,30 0 0 1 -30,30 h-30 a30,30 0 0 1 -30,-30 z" fill="#fffdf8" stroke="#d9c79a" strokeWidth="3" />
          <path d="M90,25 a18,18 0 0 1 0,36" fill="none" stroke="#d9c79a" strokeWidth="3" />
          <ellipse cx="45" cy="12" rx="43" ry="6" fill="#c89b68" />
          {[0, 1, 2].map((i) => <path key={i} className="sc-steam" style={{ animationDelay: `${i * 0.8}s` }} d={`M${25 + i * 20},-5 c-10,-20 10,-30 0,-50`} fill="none" stroke="#d8cfc0" strokeWidth="4" strokeLinecap="round" />)}
        </g>
      </g>
      {/* phone */}
      <g className="sc-float" transform="translate(880,90)">
        <rect x="0" y="0" width="400" height="760" rx="56" fill="#fffdf9" stroke="#e2d6b8" strokeWidth="3" />
        <rect x="150" y="18" width="100" height="22" rx="11" fill="#efe7d4" />
        <g transform="translate(32,76)">
          <circle cx="22" cy="22" r="22" fill="#e7f6ef" stroke="#237a60" strokeWidth="2" />
          <path d="M22,10 l3.5,8.5 9,0 -7,5.5 2.6,8.7 -8.1,-5.2 -8.1,5.2 2.6,-8.7 -7,-5.5 9,0 z" fill="#e6c56f" />
          <text x="56" y="18" fontFamily="var(--serif)" fontSize="20" fontWeight="650" fill="#2b2c28">Noor</text>
          <text x="56" y="38" fontFamily="var(--arabic)" fontSize="15" fill="#9c7a24">نور الحكمة</text>
        </g>
        <line x1="24" x2="376" y1="140" y2="140" stroke="#efe6cf" />
        <g transform="translate(36,200)">
          <rect x="0" y="0" width="328" height={typed.length > 34 ? 132 : 92} rx="22" fill="#e9f1fc" />
          <foreignObject x="14" y="10" width="300" height="120">
            <div className="sc-ar">{typed}<span className="sc-caret">|</span></div>
          </foreignObject>
          <text x="6" y={typed.length > 34 ? 160 : 120} fontFamily="var(--sans)" fontSize="14" fill="#8b887a" opacity={done ? 1 : 0} style={{ transition: "opacity .6s" }}>
            {QUESTION_EN}
          </text>
        </g>
        <g transform="translate(36,420)" opacity={done ? 1 : 0} style={{ transition: "opacity .5s .6s" }}>
          <rect x="0" y="0" width="120" height="46" rx="23" fill="#fcf5df" />
          {[0, 1, 2].map((i) => <circle key={i} className="sc-dot" style={{ animationDelay: `${i * 0.18}s` }} cx={36 + i * 24} cy="23" r="6" fill="#c9a046" />)}
        </g>
        <rect x="24" y="680" width="352" height="54" rx="27" fill="#fbf7ee" stroke="#ece2c9" />
        <circle cx="346" cy="707" r="20" fill="#e7f6ef" />
        <path d="M338,707 l16,-8 -5,8 5,8 z" fill="#237a60" />
      </g>
    </svg>
  );
}

const DOCS = ["Credit policy · §3", "Murabaha manual · §2", "Limits table", "Sanctions list", "Buyer file"];
const CHECKS = ["Credit limit fits", "Owned before sale (Sharia)", "Buyer clear on sanctions", "Cost: 3 fils of 10"];

/** 3 · Noor reads every rule that applies. */
export function ChecksScene() {
  return (
    <svg className="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Documents flowing into a lantern of light and checks appearing">
      <defs>
        <radialGradient id="ck-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3cf" />
          <stop offset="0.5" stopColor="#ffe9b0" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="#fffdf6" />
      <circle className="sc-breathe" cx="800" cy="450" r="330" fill="url(#ck-glow)" />
      {DOCS.map((d, i) => (
        <g key={d} className="sc-doc" style={{ animationDelay: `${i * 1.1}s` }}>
          <rect x="-90" y="-56" width="180" height="112" rx="12" fill="#ffffff" stroke="#e4d8b8" strokeWidth="2" />
          {[0, 1, 2].map((j) => <line key={j} x1="-66" x2={50 - j * 20} y1={-18 + j * 18} y2={-18 + j * 18} stroke="#ece2c9" strokeWidth="5" strokeLinecap="round" />)}
          <text x="-66" y="-30" fontFamily="var(--sans)" fontSize="15" fontWeight="600" fill="#56574f">{d}</text>
        </g>
      ))}
      <g transform="translate(800,450)" className="sc-spin-slow">
        <g fill="#e7f6ef" stroke="#237a60" strokeWidth="3" strokeLinejoin="round">
          <rect x="-80" y="-80" width="160" height="160" />
          <rect x="-80" y="-80" width="160" height="160" transform="rotate(45)" />
        </g>
        <circle r="46" fill="#fffaf0" stroke="#e6c56f" strokeWidth="3" />
        <circle r="22" fill="#e6c56f" className="sc-breathe" />
      </g>
      {CHECKS.map((c, i) => (
        <g key={c} className="sc-check" style={{ animationDelay: `${1.2 + i * 1.1}s` }} transform={`translate(1060,${300 + i * 80})`}>
          <rect x="0" y="-28" width="420" height="56" rx="28" fill="#ffffff" stroke="#e4d8b8" />
          <circle cx="30" cy="0" r="16" fill="#e7f6ef" stroke="#237a60" strokeWidth="2" />
          <path d="M22,0 l6,6 11,-12" fill="none" stroke="#237a60" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <text x="60" y="6" fontFamily="var(--sans)" fontSize="19" fill="#2b2c28">{c}</text>
        </g>
      ))}
    </svg>
  );
}

/** 4 · A clear answer, with its proof. */
export function AnswerScene() {
  return (
    <svg className="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A verified answer with citations">
      <defs>
        <linearGradient id="an-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fdf8ea" />
          <stop offset="1" stopColor="#eef4fb" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#an-bg)" />
      <g className="sc-rise" transform="translate(330,170)">
        <rect x="0" y="0" width="940" height="560" rx="28" fill="#ffffff" stroke="#e4d8b8" strokeWidth="2" />
        <rect x="0" y="0" width="940" height="64" rx="28" fill="#fcf5df" />
        <rect x="0" y="36" width="940" height="28" fill="#fcf5df" />
        <text x="40" y="42" fontFamily="var(--sans)" fontSize="18" fontWeight="650" fill="#9c7a24" letterSpacing="2">VERIFIED ANSWER</text>
        <text x="900" y="42" textAnchor="end" fontFamily="var(--mono)" fontSize="16" fill="#8b887a">2.1 s · 3 fils</text>
        <foreignObject x="40" y="96" width="860" height="250">
          <div className="sc-answer">
            <b>Yes — up to AED 2.0 million on 90-day terms,</b> provided the goods are owned by the company before the sale and the buyer passes sanctions screening. Above AED 2.0 million the Chief Risk Officer must approve.
          </div>
        </foreignObject>
        {["Credit policy §3", "Murabaha manual §2", "Limits table p.4"].map((c, i) => (
          <g key={c} className="sc-chip" style={{ animationDelay: `${0.8 + i * 0.35}s` }} transform={`translate(${40 + i * 250},380)`}>
            <rect x="0" y="0" width="230" height="44" rx="22" fill="#edf3fd" stroke="#dbe7fa" />
            <text x="115" y="28" textAnchor="middle" fontFamily="var(--sans)" fontSize="16" fill="#2f5ea9">[{i + 1}] {c}</text>
          </g>
        ))}
        <g transform="translate(40,470)">
          {["All 5 rules hold", "No personal data shown", "Logged to audit"].map((c, i) => (
            <g key={c} transform={`translate(${i * 280},0)`}>
              <circle cx="12" cy="12" r="12" fill="#e7f6ef" />
              <path d="M6,12 l4,4 8,-8" fill="none" stroke="#237a60" strokeWidth="2.6" strokeLinecap="round" />
              <text x="32" y="18" fontFamily="var(--sans)" fontSize="17" fill="#56574f">{c}</text>
            </g>
          ))}
        </g>
      </g>
      <g className="sc-stamp" transform="translate(1220,230)">
        <circle r="92" fill="#fffaf0" stroke="#e6c56f" strokeWidth="5" />
        <circle r="74" fill="none" stroke="#e6c56f" strokeWidth="2" strokeDasharray="4 6" />
        <text y="-8" textAnchor="middle" fontFamily="var(--serif)" fontSize="44" fill="#9c7a24">⊢</text>
        <text y="34" textAnchor="middle" fontFamily="var(--sans)" fontSize="16" fontWeight="700" letterSpacing="3" fill="#9c7a24">PROVEN</text>
      </g>
    </svg>
  );
}

/** 5 · Back to her day. */
export function LifeScene() {
  return (
    <svg className="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A calm terrace at golden hour with coffee and a ready calendar">
      <defs>
        <linearGradient id="lf-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7e3" />
          <stop offset="0.7" stopColor="#ffe2bd" />
          <stop offset="1" stopColor="#f8d0a8" />
        </linearGradient>
        <radialGradient id="lf-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff2cc" />
          <stop offset="1" stopColor="#ffd59a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#lf-sky)" />
      <circle className="sc-breathe" cx="420" cy="520" r="260" fill="url(#lf-sun)" />
      <circle cx="420" cy="520" r="64" fill="#fff4d6" />
      <g className="sc-drift-slow">
        <Skyline seed={41} base={600} maxH={90} color="#d3c7cf" opacity={0.55} />
      </g>
      <rect y="600" width="1600" height="300" fill="#f3e6d2" />
      {/* palm fronds */}
      {[0, 1].map((p) => (
        <g key={p} className="sc-sway" style={{ transformOrigin: `${p ? 1520 : 80}px -40px`, animationDelay: `${p * 1.4}s` }}>
          {Array.from({ length: 7 }, (_, i) => (
            <path key={i} d={`M${p ? 1520 : 80},-40 q${(p ? -1 : 1) * (120 + i * 18)},${80 + i * 34} ${(p ? -1 : 1) * (240 + i * 26)},${200 + i * 50}`} fill="none" stroke="#b9c7b0" strokeWidth={22 - i * 2} strokeLinecap="round" opacity="0.5" />
          ))}
        </g>
      ))}
      {/* table, cups */}
      <ellipse cx="1060" cy="760" rx="380" ry="70" fill="#fffaf0" stroke="#e4d8b8" strokeWidth="3" />
      {[0, 1].map((c) => (
        <g key={c} transform={`translate(${940 + c * 170},640)`}>
          <path d="M0,20 h80 v50 a26,26 0 0 1 -26,26 h-28 a26,26 0 0 1 -26,-26 z" fill="#ffffff" stroke="#d9c79a" strokeWidth="3" />
          <ellipse cx="40" cy="22" rx="38" ry="6" fill="#c89b68" />
          {[0, 1].map((i) => <path key={i} className="sc-steam" style={{ animationDelay: `${c * 0.6 + i * 0.9}s` }} d={`M${28 + i * 22},5 c-10,-20 10,-30 0,-50`} fill="none" stroke="#e1d6c4" strokeWidth="4" strokeLinecap="round" />)}
        </g>
      ))}
      <g className="sc-rise" transform="translate(1110,330)">
        <rect x="0" y="0" width="330" height="200" rx="20" fill="#ffffff" stroke="#e4d8b8" strokeWidth="2" />
        <text x="26" y="44" fontFamily="var(--sans)" fontSize="16" fontWeight="700" letterSpacing="2" fill="#9c7a24">TODAY</text>
        {[["07:12", "Credit question — answered ✓"], ["09:00", "Board meeting — ready ✓"], ["13:00", "Lunch with family"]].map(([t, s], i) => (
          <g key={t} transform={`translate(26,${84 + i * 40})`}>
            <text fontFamily="var(--mono)" fontSize="15" fill="#8b887a">{t}</text>
            <text x="70" fontFamily="var(--sans)" fontSize="16" fill="#2b2c28">{s}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export const SCENES = { dawn: DawnScene, ask: AskScene, checks: ChecksScene, answer: AnswerScene, life: LifeScene };
export type SceneName = keyof typeof SCENES;
