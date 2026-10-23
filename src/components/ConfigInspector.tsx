import { useEffect, useState } from "react";
import { bindingsFor, type Binding, type BindingValue } from "../lib/casespine/bindings";
import { CATEGORY_COLOR, KIND_META, type GNode } from "../lib/casespine/graph";
import type { CaseAST } from "../lib/casespine/types";

const CLOUD_MAP: Record<string, string> = {
  data: "S3 · ADLS Gen2 · GCS · Unity Catalog Volumes · SharePoint",
  curate: "Lambda / Azure Functions / Cloud Run · Presidio · Purview & Collibra classification",
  govern: "Bedrock Guardrails · API Gateway usage plans · Azure APIM · KEDA",
  retrieve: "OpenSearch · Azure AI Search · Vertex Vector Search · Databricks Vector Search",
  reason: "Bedrock AgentCore · Azure AI Foundry · Vertex Agent Engine · Mosaic AI · vLLM on-prem",
  verify: "Lean 4 reference monitor on Lambda / Cloud Run / Model Serving",
  act: "Step Functions · Cloud Workflows · Lakeflow Jobs · Temporal",
  human: "waitForTaskToken · Workflows callbacks · Teams / Slack / e-mail approvals",
};

function Field({ b, ast, editable, onSet }: { b: Binding; ast: CaseAST; editable: boolean; onSet: (b: Binding, v: BindingValue) => void }) {
  const f = b.field;
  const val = b.get(ast);
  const [text, setText] = useState(String(val));
  useEffect(() => setText(String(Array.isArray(val) ? val.join(", ") : val)), [val]);
  const id = `cfg-${b.id}`;
  if (f.type === "number") {
    const n = Number(val);
    return (
      <div className="ci-field">
        <label htmlFor={id}>{b.label}</label>
        <div className="ci-num">
          <input id={id} type="range" min={f.min} max={f.max} step={f.step} value={Number.isFinite(n) ? n : Number(f.default)} disabled={!editable} onChange={(e) => onSet(b, +e.target.value)} />
          <input
            type="number"
            min={f.min}
            max={f.max}
            step={f.step}
            value={text}
            disabled={!editable}
            aria-label={`${b.label} value`}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => Number.isFinite(parseFloat(text)) && parseFloat(text) !== n && onSet(b, parseFloat(text))}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <small>{f.doc}</small>
      </div>
    );
  }
  if (f.type === "toggle") {
    return (
      <div className="ci-field ci-row">
        <label htmlFor={id}>{b.label}</label>
        <button id={id} type="button" role="switch" aria-checked={!!val} className={`ci-switch${val ? " on" : ""}`} disabled={!editable} onClick={() => onSet(b, !val)}>
          <i />
        </button>
        <small>{f.doc}</small>
      </div>
    );
  }
  if (f.type === "multi") {
    const cur = (val as string[]) ?? [];
    return (
      <div className="ci-field">
        <label>{b.label}</label>
        <div className="ci-chips">
          {(f.options ?? []).map((o) => (
            <button key={o} type="button" className={cur.includes(o) ? "on" : ""} disabled={!editable} onClick={() => onSet(b, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])}>
              {o}
            </button>
          ))}
        </div>
        <small>{f.doc}</small>
      </div>
    );
  }
  if (f.type === "select" || f.type === "lane") {
    const opts = [...new Set([...(f.options ?? []), ...(String(val) ? [String(val)] : [])])];
    return (
      <div className="ci-field">
        <label htmlFor={id}>{b.label}</label>
        <select id={id} value={String(val)} disabled={!editable} onChange={(e) => onSet(b, e.target.value)}>
          {!String(val) && <option value="">—</option>}
          {opts.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <small>{f.doc}</small>
      </div>
    );
  }
  return (
    <div className="ci-field">
      <label htmlFor={id}>{b.label}</label>
      <input
        id={id}
        type="text"
        value={text}
        disabled={!editable}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== String(val) && onSet(b, text)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <small>{f.doc}</small>
    </div>
  );
}

interface Props {
  node: GNode;
  ast: CaseAST;
  editable: boolean;
  onEdit?: (fn: (src: string, c: CaseAST) => string) => void;
  onRemove?: (range: [number, number]) => void;
  onClose: () => void;
}

export function ConfigInspector({ node, ast, editable, onEdit, onRemove, onClose }: Props) {
  const meta = KIND_META[node.kind];
  const color = CATEGORY_COLOR[meta.category];
  const bindings = bindingsFor(node.kind, ast, node.stage);
  const sections = [...new Set(bindings.map((b) => b.section))];
  const onSet = (b: Binding, v: BindingValue) => onEdit?.((src, c) => b.set(src, c, v));
  return (
    <aside className="ci fade-up" aria-label={`${node.label} configuration`}>
      <div className="ci-head">
        <span className="cv-pdot" style={{ borderColor: color, color }}>{meta.glyph}</span>
        <div style={{ minWidth: 0 }}>
          <b>{node.label}</b>
          {node.sub && <div className="mono ci-sub">{node.sub}</div>}
        </div>
        <button className="cv-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p className="ci-doc">{meta.doc}</p>
      {sections.map((sec) => (
        <div key={sec} className="ci-sec">
          <div className="label">{sec}</div>
          {bindings.filter((b) => b.section === sec).map((b) => (
            <Field key={b.id} b={b} ast={ast} editable={editable} onSet={onSet} />
          ))}
        </div>
      ))}
      {!bindings.length && <div className="muted" style={{ fontSize: 12.5 }}>No settings for this widget.</div>}
      {!editable && bindings.length > 0 && <div className="muted" style={{ fontSize: 12 }}>Open the Studio to change these settings.</div>}
      <div className="ci-meta">
        <div className="cv-kv"><span>Engine</span><code>{meta.engine}</code></div>
        <div className="cv-kv"><span>Cloud</span><span>{CLOUD_MAP[meta.category]}</span></div>
        {node.lines.length > 0 && <div className="cv-kv"><span>Source</span><span>line {[...new Set(node.lines)].sort((a, b) => a - b).join(", ")}</span></div>}
      </div>
      {editable && node.removeRange && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, color: "var(--danger)" }} onClick={() => onRemove?.(node.removeRange!)}>
          Remove from case (line{node.removeRange[0] === node.removeRange[1] ? "" : "s"} {node.removeRange[0]}
          {node.removeRange[0] === node.removeRange[1] ? "" : "–" + node.removeRange[1]})
        </button>
      )}
    </aside>
  );
}
