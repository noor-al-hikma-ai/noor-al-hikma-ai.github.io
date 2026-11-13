import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

interface Point { x: number; y: number }
interface Box { x: number; y: number; width: number; height: number; name: string }

function findBoxes(strokes: Point[][]): Box[] {
  return strokes.flatMap((stroke) => {
    if (stroke.length < 5) return [];
    const x = Math.min(...stroke.map((p) => p.x)), y = Math.min(...stroke.map((p) => p.y));
    const width = Math.max(...stroke.map((p) => p.x)) - x, height = Math.max(...stroke.map((p) => p.y)) - y;
    const first = stroke[0], last = stroke[stroke.length - 1];
    if (width < 24 || height < 24 || Math.hypot(first.x - last.x, first.y - last.y) > Math.min(width, height) * 0.36) return [];
    const distance = Math.max(7, Math.min(width, height) * 0.26);
    const corners = [{ x, y }, { x: x + width, y }, { x, y: y + height }, { x: x + width, y: y + height }];
    return corners.every((corner) => stroke.some((p) => Math.hypot(p.x - corner.x, p.y - corner.y) < distance))
      ? [{ x, y, width, height, name: "" }] : [];
  }).sort((a, b) => Math.abs(a.y - b.y) > Math.min(a.height, b.height) * 0.7 ? a.y - b.y : a.x - b.x);
}

export function SketchWorkflow({ onClose, onPreview }: { onClose: () => void; onPreview: (stages: string[]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const active = useRef<number | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [hasInk, setHasInk] = useState(false);
  const [read, setRead] = useState(false);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  function redraw() {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#126b55";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const stroke of strokes.current) {
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  }

  function point(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * event.currentTarget.width / bounds.width,
      y: (event.clientY - bounds.top) * event.currentTarget.height / bounds.height };
  }

  return <div className="cp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="cp sketch-workflow" role="dialog" aria-modal="true" aria-label="Sketch workflow">
      <div className="cp-head">
        <div>
          <h2>Sketch workflow</h2>
          <p className="muted">Draw one closed box per stage. Draw boxes left to right or top to bottom, then name the stages.</p>
        </div>
        <button className="cv-x" onClick={onClose} aria-label="Close" autoFocus>×</button>
      </div>
      <div className="sketch-body">
        <canvas ref={ref} aria-label="Draw stage boxes" width={560} height={320}
          onPointerDown={(event) => {
            if (active.current !== null || strokes.current.length >= 40) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            active.current = event.pointerId;
            strokes.current.push([point(event)]);
            setHasInk(true);
            setRead(false);
            setBoxes([]);
          }}
          onPointerMove={(event) => {
            const stroke = strokes.current.at(-1);
            if (active.current !== event.pointerId || !stroke || stroke.length >= 2000) return;
            stroke.push(point(event));
            redraw();
          }}
          onPointerUp={() => { active.current = null; }}
          onPointerCancel={() => { active.current = null; }} />
        <div className="cta-row">
          <button className="btn btn-ghost btn-sm" disabled={!hasInk} onClick={() => {
            strokes.current.pop();
            setHasInk(strokes.current.length > 0);
            setBoxes([]);
            setRead(false);
            redraw();
          }}>Undo stroke</button>
          <button className="btn btn-ghost btn-sm" disabled={!hasInk} onClick={() => {
            setBoxes(findBoxes(strokes.current).slice(0, 8));
            setRead(true);
          }}>Read sketch</button>
        </div>
        {read && boxes.length === 0 && <p role="status">Close the outline of each box and try again.</p>}
        {boxes.map((box, i) => <label key={i} className="sketch-stage">
          Stage {i + 1}
          <input maxLength={76} placeholder={i === 0 ? "Gather evidence" : "Review"} value={box.name}
            onChange={(event) => setBoxes((current) => current.map((item, index) => index === i ? { ...item, name: event.target.value } : item))} />
        </label>)}
      </div>
      <div className="cp-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-emerald" disabled={!boxes.length} onClick={() => onPreview(boxes.map((box) => box.name))}>Preview stages</button>
      </div>
    </section>
  </div>;
}
