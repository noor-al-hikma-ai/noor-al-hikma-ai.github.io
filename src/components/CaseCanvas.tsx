import { useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import "d3-transition";
import { CATEGORY_COLOR, KIND_META, deriveGraph, layoutGraph, type Category, type GNode } from "../lib/casespine/graph";
import { PALETTE, type PaletteItem } from "../lib/casespine/edits";
import type { CaseAST } from "../lib/casespine/types";
import { ConfigInspector } from "./ConfigInspector";
import "./canvas.css";


export interface CanvasRun {
  /** Node ids lit so far, in execution order. */
  lit: string[];
  outcome?: "VERIFIED" | "BREACH" | "FAIL_CLOSED" | "BLOCKED";
  blockedAt?: string;
}

interface Props {
  ast: CaseAST;
  editable?: boolean;
  highlightLines?: number[];
  onSelectLines?: (lines: number[]) => void;
  onEdit?: (fn: (src: string, c: CaseAST) => string) => void;
  /** Palette insertions (label for feedback); falls back to onEdit. */
  onPalette?: (label: string, fn: (src: string, c: CaseAST) => string) => void;
  onRemove?: (range: [number, number]) => void;
  run?: CanvasRun | null;
  height?: number | string;
  compact?: boolean;
}

const R = 23;

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x1 = a.x + R + 3, x2 = b.x - R - 3;
  if (x2 < x1 + 10) {
    if (b.y > a.y + R * 2) {
      // wrapped to the next row: carriage-return curve
      return `M${a.x},${a.y + R + 3} C${a.x},${a.y + 90} ${b.x},${b.y - 90} ${b.x},${b.y - R - 3}`;
    }
    const my = Math.max(a.y, b.y) + 60;
    return `M${a.x},${a.y + R} C${a.x},${my} ${b.x},${my} ${b.x},${b.y + R}`;
  }
  const dx = Math.max(30, (x2 - x1) / 2);
  return `M${x1},${a.y} C${x1 + dx},${a.y} ${x2 - dx},${b.y} ${x2},${b.y}`;
}

export function CaseCanvas({ ast, editable, highlightLines, onSelectLines, onEdit, onPalette, onRemove, run, height = 460, compact }: Props) {
  const graph = useMemo(() => deriveGraph(ast), [ast]);
  const [width, setWidth] = useState(800);
  const colW = compact ? 118 : 132;
  const cols = Math.max(4, Math.min(10, Math.floor(width / (colW * 0.8))));
  const base = useMemo(() => layoutGraph(graph, colW, compact ? 92 : 100, cols), [graph, compact, colW, cols]);
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [dropHover, setDropHover] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const prevIds = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const caseKey = ast.namespacePath;

  useEffect(() => {
    setOverrides({});
    setSelected(null);
  }, [caseKey]);

  useEffect(() => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    const added = [...ids].filter((id) => !prevIds.current.has(id));
    if (prevIds.current.size && added.length) {
      setFresh(new Set(added));
      const tm = setTimeout(() => setFresh(new Set()), 900);
      prevIds.current = ids;
      return () => clearTimeout(tm);
    }
    prevIds.current = ids;
  }, [graph]);

  const pos = (id: string) => overrides[id] ?? base.get(id) ?? { x: 0, y: 0 };
  // Latest layout for callbacks created in earlier renders (ResizeObserver, rAF).
  const latest = useRef({ pos, nodes: graph.nodes });
  latest.current = { pos, nodes: graph.nodes };

  const fit = () => {
    const svg = svgRef.current;
    const { pos: p, nodes } = latest.current;
    if (!svg || !zoomRef.current || !nodes.length || !svg.clientWidth) return;
    const xs = nodes.map((n) => p(n.id).x);
    const ys = nodes.map((n) => p(n.id).y);
    const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60;
    const minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + (compact ? 64 : 96);
    const w = svg.clientWidth, h = svg.clientHeight;
    const k = Math.min(1.25, Math.max(0.35, Math.min(w / (maxX - minX), h / (maxY - minY))));
    const tx = (w - (maxX - minX) * k) / 2 - minX * k;
    const ty = (h - (maxY - minY) * k) / 2 - minY * k;
    select(svg).transition().duration(450).call(zoomRef.current.transform, zoomIdentity.translate(tx, ty).scale(k));
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 2.5])
      .filter((ev: Event) => {
        if ((ev as MouseEvent).button) return false;
        if ((ev.target as Element).closest?.(".cv-node")) return false;
        // In compact (embedded) mode, plain wheel scrolls the page; ctrl/⌘ + wheel zooms.
        if (ev.type === "wheel" && compact && !(ev as WheelEvent).ctrlKey && !(ev as WheelEvent).metaKey) return false;
        return true;
      })
      .on("zoom", (ev) => setT(ev.transform));
    zoomRef.current = z;
    select(svg).call(z).on("dblclick.zoom", null);
    return () => {
      select(svg).on(".zoom", null);
    };
  }, [compact]);

  // Fit when the structure changes size (not on every keystroke).
  const sizeKey = `${caseKey}:${graph.nodes.length}:${cols}`;
  useEffect(() => {
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
  }, [sizeKey]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sizeKey]);

  const hl = new Set(highlightLines ?? []);
  const isHl = (n: GNode) => n.lines.some((l) => hl.has(l));

  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent, n: GNode) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = pos(n.id);
    drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / t.k, dy = (e.clientY - d.sy) / t.k;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setOverrides((o) => ({ ...o, [d.id]: { x: d.ox + dx, y: d.oy + dy } }));
  };
  const onUp = (n: GNode) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      setSelected(n.id === selected ? null : n.id);
      onSelectLines?.(n.lines);
    }
  };

  const lit = new Set(run?.lit ?? []);
  const runDone = !!run?.outcome;
  const failPath = run?.outcome && run.outcome !== "VERIFIED";
  const nodeState = (n: GNode): string => {
    if (!run) return "";
    if (run.blockedAt === n.id) return "cv-blocked";
    if (!lit.has(n.id)) return runDone ? "cv-dim" : "";
    if (runDone && failPath && (n.kind === "compensate" || n.kind === "escalate")) return "cv-fail";
    if (runDone && !failPath && (n.kind === "emit" || n.kind === "milestone")) return "cv-ok";
    return "cv-lit";
  };

  const sel = graph.nodes.find((n) => n.id === selected) ?? null;
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const m = new Map<string, PaletteItem[]>();
    const ql = q.trim().toLowerCase();
    for (const p of PALETTE) {
      if (p.present?.(ast)) continue;
      if (ql && !`${p.label} ${p.hint} ${p.group}`.toLowerCase().includes(ql)) continue;
      if (!m.has(p.group)) m.set(p.group, []);
      m.get(p.group)!.push(p);
    }
    return [...m.entries()];
  }, [ast, q]);

  const applyPalette = (p: PaletteItem) => (onPalette ? onPalette(p.label, p.apply) : onEdit?.(p.apply));

  return (
    <div className={`cv-wrap${editable ? " cv-editable" : ""}`} style={{ height }}>
      {editable && (
        <aside className="cv-palette" aria-label="Widget palette">
          <input
            className="cv-search"
            type="search"
            placeholder="Find a widget…"
            value={q}
            aria-label="Find a widget"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && groups[0]?.[1][0]) {
                applyPalette(groups[0][1][0]);
                setQ("");
              }
            }}
          />
          {groups.map(([g, items]) => (
            <div key={g} className="cv-pgroup">
              <div className="cv-pgroup-title">{g}</div>
              {items.map((p) => {
                const meta = KIND_META[p.kind];
                return (
                  <button
                    key={p.label}
                    className="cv-pitem"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/casespine-widget", p.label)}
                    onClick={() => applyPalette(p)}
                    title={`${p.hint} — click or drag onto the canvas`}
                  >
                    <span className="cv-pdot" style={{ borderColor: CATEGORY_COLOR[meta.category], color: CATEGORY_COLOR[meta.category] }}>
                      {meta.glyph}
                    </span>
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {!groups.length && <div className="muted" style={{ fontSize: 12, padding: 4 }}>{q ? "No widget matches." : "Every widget is already in this case."}</div>}
        </aside>
      )}
      <div
        className={`cv-stage${dropHover ? " cv-drop" : ""}`}
        onDragOver={(e) => {
          if (!editable) return;
          e.preventDefault();
          setDropHover(true);
        }}
        onDragLeave={() => setDropHover(false)}
        onDrop={(e) => {
          setDropHover(false);
          const label = e.dataTransfer.getData("text/casespine-widget");
          const p = PALETTE.find((x) => x.label === label);
          if (p) applyPalette(p);
        }}
      >
        <svg ref={svgRef} className="cv-svg" role="img" aria-label={`Process graph for ${ast.name}`}>
          <defs>
            <marker id="cv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,1 L9,5 L0,9" fill="none" stroke="var(--rule-2)" strokeWidth="1.5" />
            </marker>
            <pattern id="cv-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.9" fill="var(--rule)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cv-grid)" />
          <g transform={t.toString()}>
            {graph.edges.map((e, i) => {
              const a = pos(e.from), b = pos(e.to);
              const flowing = run && lit.has(e.from) && lit.has(e.to);
              const fail = runDone && failPath && flowing && (e.dashed ?? false);
              return (
                <g key={i}>
                  <path
                    d={edgePath(a, b)}
                    className={`cv-edge${e.dashed ? " dashed" : ""}${flowing ? " flowing" : ""}${fail ? " fail" : ""}`}
                    markerEnd="url(#cv-arrow)"
                  />
                  {e.label && !compact && (
                    <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 7} className="cv-elabel" textAnchor="middle">
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {graph.nodes.map((n) => {
              const p = pos(n.id);
              const meta = KIND_META[n.kind];
              const color = CATEGORY_COLOR[meta.category];
              const cls = ["cv-node", selected === n.id ? "sel" : "", isHl(n) ? "hl" : "", fresh.has(n.id) ? "fresh" : "", nodeState(n)].join(" ");
              return (
                <g
                  key={n.id}
                  className={cls}
                  transform={`translate(${p.x},${p.y})`}
                  onPointerDown={(e) => onDown(e, n)}
                  onPointerMove={onMove}
                  onPointerUp={() => onUp(n)}
                  style={{ ["--c" as string]: color }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${n.label}: ${meta.doc}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSelected(n.id);
                      onSelectLines?.(n.lines);
                    }
                  }}
                >
                  <g className="cv-inner">
                    {n.kind === "milestone" ? (
                      <rect x={-13} y={-13} width={26} height={26} transform="rotate(45)" className="cv-shape" />
                    ) : (
                      <>
                        <circle r={R + 7} className="cv-halo" />
                        <circle r={R} className="cv-shape" />
                        <path d={`M${-R - 4},-9 A 10 10 0 0 0 ${-R - 4},9`} className="cv-port" />
                        <path d={`M${R + 4},-9 A 10 10 0 0 1 ${R + 4},9`} className="cv-port" />
                      </>
                    )}
                    <text className="cv-glyph" textAnchor="middle" dy="0.36em">
                      {n.kind === "milestone" ? "" : meta.glyph}
                    </text>
                  </g>
                  <text className="cv-label" y={n.kind === "milestone" ? 30 : R + 17} textAnchor="middle">
                    {n.label.length > 24 ? n.label.slice(0, 23) + "…" : n.label}
                  </text>
                  {n.sub && !compact && (
                    <text className="cv-sub" y={R + 31} textAnchor="middle">
                      {n.sub.length > 28 ? n.sub.slice(0, 27) + "…" : n.sub}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="cv-tools">
          <button className="btn btn-ghost btn-sm" onClick={fit} title="Fit graph to view">Fit</button>
          {Object.keys(overrides).length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setOverrides({})} title="Reset to automatic layout">Auto-layout</button>
          )}
        </div>
        {!compact && (
          <div className="cv-legend">
            {(Object.keys(CATEGORY_COLOR) as Category[]).map((c) => (
              <span key={c}>
                <i style={{ background: CATEGORY_COLOR[c] }} />
                {c}
              </span>
            ))}
          </div>
        )}
        {sel && (
          <ConfigInspector
            node={sel}
            ast={ast}
            editable={!!editable}
            onEdit={onEdit}
            onRemove={(range) => {
              onRemove?.(range);
              setSelected(null);
            }}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}
