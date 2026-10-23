// Khatam (eight-pointed star): two squares rotated 45°. Its eight points echo
// the eight CaseSpine solution archetypes; the centre is the "noor" (light).
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true">
      <g fill="var(--emerald-soft)" stroke="var(--emerald)" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="-12.5" y="-12.5" width="25" height="25" />
        <rect x="-12.5" y="-12.5" width="25" height="25" transform="rotate(45)" />
      </g>
      <circle r="7.2" fill="#fffaf0" stroke="var(--gold-2)" strokeWidth="1.3" />
      <circle r="3.4" fill="var(--gold-2)" />
    </svg>
  );
}

/** Decorative octagram used as a faint geometric frame behind hero areas. */
export function Octagram({ size = 420, opacity = 0.12 }: { size?: number; opacity?: number }) {
  const rings = [1, 0.78, 0.56];
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" aria-hidden="true" style={{ opacity }}>
      {rings.map((k, i) => (
        <g key={i} fill="none" stroke="var(--gold)" strokeWidth={0.35}>
          <rect x={-35 * k} y={-35 * k} width={70 * k} height={70 * k} />
          <rect x={-35 * k} y={-35 * k} width={70 * k} height={70 * k} transform="rotate(45)" />
        </g>
      ))}
      <circle r="49" fill="none" stroke="var(--gold)" strokeWidth={0.25} />
      <circle r="20" fill="none" stroke="var(--emerald)" strokeWidth={0.3} />
    </svg>
  );
}
