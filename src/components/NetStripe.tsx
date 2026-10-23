import { useMemo, type ReactElement } from "react";

// Watermark stripe for the header: a seamless tile of AI / network / IT motifs
// that drifts slowly from left to right. Generated deterministically.

const TILE = 960;
const H = 58;

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function buildTile(suffix: string) {
  const r = rng(20261023);
  const out: ReactElement[] = [];
  let k = 0;
  const C = ["var(--gold-2)", "var(--emerald)", "var(--cobalt)", "var(--turquoise)"];
  // circuit buses with right-angle branches and pads
  [16, 30, 44].forEach((y, bi) => {
    let x = 0;
    let d = `M0,${y}`;
    while (x < TILE) {
      const run = 40 + r() * 90;
      x = Math.min(TILE, x + run);
      d += ` H${x.toFixed(0)}`;
      if (x < TILE - 30 && r() > 0.55) {
        const up = y + (r() > 0.5 ? -7 : 7);
        d += ` L${(x + 7).toFixed(0)},${up} H${(x + 30).toFixed(0)} L${(x + 37).toFixed(0)},${y}`;
        out.push(<circle key={k++} cx={x + 18} cy={up} r={1.6} fill={C[bi % 4]} opacity={0.7} />);
        x += 37;
      }
    }
    out.push(<path key={k++} id={`bus${bi}${suffix}`} d={d} fill="none" stroke={C[(bi + 1) % 4]} strokeWidth={0.9} opacity={0.5} />);
  });
  // neural-net layers
  for (let g = 0; g < 3; g++) {
    const gx = 90 + g * 320 + r() * 40;
    const layers = [3, 4, 4, 2];
    const pts = layers.map((n, li) => Array.from({ length: n }, (_, i) => ({ x: gx + li * 26, y: 10 + ((i + 0.5) * (H - 20)) / n })));
    for (let li = 0; li < pts.length - 1; li++)
      for (const a of pts[li])
        for (const b of pts[li + 1])
          if (r() > 0.35) out.push(<line key={k++} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--emerald)" strokeWidth={0.5} opacity={0.35} />);
    pts.flat().forEach((p) => out.push(<circle key={k++} cx={p.x} cy={p.y} r={2.2} fill="var(--card)" stroke="var(--emerald)" strokeWidth={0.9} opacity={0.8} />));
  }
  // chips, databases, clouds, glyphs
  const glyphs = ["</>", "{ }", "λ", "⊢", "∑", "01", "١٠", "∧", "AI", "SQL"];
  for (let i = 0; i < 9; i++) {
    const x = 40 + i * 104 + r() * 30;
    const y = 12 + r() * 30;
    const kind = i % 4;
    if (kind === 0) {
      out.push(
        <g key={k++} transform={`translate(${x},${y})`} opacity={0.55} stroke="var(--cobalt)" fill="none" strokeWidth={0.9}>
          <rect x={-6} y={-6} width={12} height={12} rx={2} fill="var(--card)" />
          {[-3, 0, 3].map((d) => (
            <g key={d}>
              <line x1={d} y1={-6} x2={d} y2={-9} />
              <line x1={d} y1={6} x2={d} y2={9} />
              <line x1={-6} y1={d} x2={-9} y2={d} />
              <line x1={6} y1={d} x2={9} y2={d} />
            </g>
          ))}
        </g>,
      );
    } else if (kind === 1) {
      out.push(
        <g key={k++} transform={`translate(${x},${y})`} opacity={0.55} stroke="var(--gold)" fill="var(--card)" strokeWidth={0.9}>
          <path d="M-6,-5 v10 a6,2.2 0 0 0 12,0 v-10" />
          <ellipse cx={0} cy={-5} rx={6} ry={2.2} />
          <path d="M-6,0 a6,2.2 0 0 0 12,0" fill="none" />
        </g>,
      );
    } else if (kind === 2) {
      out.push(<path key={k++} transform={`translate(${x},${y})`} d="M-8,4 a4,4 0 0 1 1,-7.5 a5,5 0 0 1 9,-1 a4,4 0 0 1 6,4.5 a3.5,3.5 0 0 1 -1,4 z" fill="var(--card)" stroke="var(--turquoise)" strokeWidth={0.9} opacity={0.6} />);
    } else {
      out.push(
        <text key={k++} x={x} y={y + 4} fontFamily="var(--mono)" fontSize={9} fill="var(--gold)" opacity={0.6}>
          {glyphs[Math.floor(r() * glyphs.length)]}
        </text>,
      );
    }
  }
  // data packets travelling along the buses
  [0, 1, 2].forEach((bi) => {
    for (let j = 0; j < 3; j++) {
      out.push(
        <circle key={k++} r={1.8} fill={C[(bi + j) % 4]} opacity={0.85}>
          <animateMotion dur={`${7 + bi * 2 + j}s`} repeatCount="indefinite" begin={`${j * 2.3}s`}>
            <mpath href={`#bus${bi}${suffix}`} />
          </animateMotion>
        </circle>,
      );
    }
  });
  return out;
}

export function NetStripe() {
  const tiles = useMemo(() => [buildTile("a"), buildTile("b")], []);
  return (
    <div className="netstripe" aria-hidden="true">
      <div className="netstripe-track">
        {tiles.map((t, i) => (
          <svg key={i} width={TILE} height={H} viewBox={`0 0 ${TILE} ${H}`}>
            {t}
          </svg>
        ))}
      </div>
    </div>
  );
}
