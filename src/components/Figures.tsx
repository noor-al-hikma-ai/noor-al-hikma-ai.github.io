import { useEffect, useState } from "react";

// ---------------------------------------------------------------- archetypes
export const ARCHETYPE_DATA = [
  { id: "KNOWLEDGE_SYNTHESIS_AND_RAG", short: "Knowledge & RAG", engines: ["openspg_kag://", "langgraph://", "langchain_lcel://"], deliverable: "Signed Sharia Murabaha term-sheet package · verified compliance answers", inv: ["citation_coverage ≥ 0.90", "debt_to_asset_ratio ≤ 0.330"], cure: "SQL balance-sheet equity cure" },
  { id: "AUTONOMOUS_CODE_AND_DEVOPS_FORK", short: "Code & DevOps fork", engines: ["git_fork_ast://", "langgraph_swe://", "semgrep_sast://", "argo_rollouts://"], deliverable: "Signed canary release + git-fork PR bundle", inv: ["sast_critical_vulns ≤ 0", "regression_failures ≤ 0", "test_coverage ≥ 0.95"], cure: "Hypothesis test healer synthesises property tests" },
  { id: "QUANTITATIVE_OPTIMIZATION_AND_MILP", short: "Optimisation & MILP", engines: ["ortools_milp://", "sql_duckdb://", "z3_smt_optimizer://"], deliverable: "Verified cold-chain fleet dispatch schedule", inv: ["cold_chain_intact = true", "fleet_utilization ≥ 0.85", "spoilage_risk_ratio ≤ 0.015"], cure: "MILP/SQL cure reallocates to reefer air cargo" },
  { id: "TRANSACTIONAL_SAGA_AND_STRAIGHT_THROUGH_PROCESSING", short: "Saga & STP", engines: ["temporal_saga://", "zeebe_bpmn://", "fhir_hl7_stp://"], deliverable: "Executed prior-auth + ISO 20022 settlement package", inv: ["clinical_evidence_score ≥ 0.90", "double_entry_balanced = true"], cure: "Saga compensation + director escalation" },
  { id: "CONTINUOUS_CAUSAL_AND_COUNTERFACTUAL_EXPERIMENTATION", short: "Causal experiments", engines: ["econml_causal://", "dspy_miprov2://", "vllm_lora_distiller://"], deliverable: "Certified de-biased policy + distilled LoRA weights", inv: ["counterfactual_jsd ≤ 0.020", "uplift_p_value ≤ 0.050"], cure: "Propensity re-weighting, LoRA rank expansion" },
  { id: "PHYSICAL_IOT_DIGITAL_TWIN_AND_CONTROL_LOOP", short: "IoT digital twin", engines: ["opcua_scada://", "onnx_digital_twin://", "ros2_safety_controller://"], deliverable: "Verified turbine set-point + maintenance work order", inv: ["vessel_pressure_bar ≤ 85.0", "bearing_vibration_mm_s ≤ 4.5"], cure: "Set-point derating, preventive work order" },
  { id: "DATA_FOUNDRY_AND_MEDALLION_ETL_CURATION", short: "Data foundry & ETL", engines: ["databricks_dlt://", "apache_iceberg_spark://", "dbt_duckdb://"], deliverable: "Unity Catalog gold table + W3C PROV lineage manifest", inv: ["null_key_rate ≤ 0.0", "schema_drift_unreconciled ≤ 0"], cure: "Quarantine dead-letter rows, evolve Silver schema" },
  { id: "AGENTIC_B2B_NEGOTIATION_AND_PROCUREMENT", short: "B2B negotiation", engines: ["nash_auction_solver://", "langgraph_negotiator://", "opa_vendor_kyc://"], deliverable: "Countersigned master supply agreement + escrow instruction", inv: ["unit_price_usd ≤ 145.0", "vendor_sanctions_hits ≤ 0"], cure: "Counter-offer redlining, General Counsel escalation" },
];

export function ArchetypeStar() {
  const [sel, setSel] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setSel((s) => (s + 1) % 8), 3200);
    return () => clearInterval(id);
  }, [auto]);
  const R = 150;
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    return { x: Math.cos(a) * R, y: Math.sin(a) * R, a };
  });
  const a = ARCHETYPE_DATA[sel];
  return (
    <div className="arch">
      <svg viewBox="-335 -215 670 430" className="arch-svg" role="img" aria-label="Eight solution archetypes arranged on an eight-pointed star">
        <g fill="none" stroke="var(--gold)" strokeWidth={1.3}>
          <rect x={-106} y={-106} width={212} height={212} />
          <rect x={-106} y={-106} width={212} height={212} transform="rotate(45)" />
          <circle r={62} stroke="var(--emerald)" />
        </g>
        <g>
          {pts.map((p, i) => (
            <line key={i} x1={0} y1={0} x2={p.x} y2={p.y} stroke={i === sel ? "var(--emerald)" : "var(--rule)"} strokeWidth={i === sel ? 2 : 1} style={{ transition: "stroke .3s" }} />
          ))}
        </g>
        <circle r={36} fill="var(--emerald-soft)" stroke="var(--emerald)" strokeWidth={1.4} />
        <text textAnchor="middle" y={-4} fill="var(--emerald)" fontFamily="var(--serif)" fontSize={13} fontWeight={650}>CaseSpine</text>
        <text textAnchor="middle" y={12} fill="var(--emerald)" fontFamily="var(--sans)" fontSize={9.5} opacity={0.85}>one language</text>
        {pts.map((p, i) => {
          const on = i === sel;
          const lx = Math.cos(p.a) * (R + 26);
          const ly = Math.sin(p.a) * (R + 26);
          const anchor = Math.abs(lx) < 20 ? "middle" : lx > 0 ? "start" : "end";
          return (
            <g
              key={i}
              style={{ cursor: "pointer" }}
              onClick={() => {
                setSel(i);
                setAuto(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSel(i);
                  setAuto(false);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={ARCHETYPE_DATA[i].short}
            >
              <circle cx={p.x} cy={p.y} r={on ? 15 : 11} fill={on ? "var(--gold-soft)" : "var(--card)"} stroke="var(--gold)" strokeWidth={1.6} style={{ transition: "all .3s" }} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontFamily="var(--sans)" fontSize={11} fontWeight={700} fill={on ? "var(--ink)" : "var(--gold)"}>{i + 1}</text>
              <text x={lx} y={ly + 4} textAnchor={anchor} fontFamily="var(--sans)" fontSize={12.5} fontWeight={on ? 650 : 500} fill={on ? "var(--ink)" : "var(--ink-2)"}>
                {ARCHETYPE_DATA[i].short}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="arch-card fade-up" key={sel}>
        <div className="label" style={{ color: "var(--gold)" }}>Archetype {sel + 1}</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--emerald)", wordBreak: "break-all", margin: "4px 0 8px" }}>{a.id}</div>
        <div style={{ fontSize: 15, marginBottom: 10 }}>{a.deliverable}</div>
        <div className="label">Engines</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "4px 0 10px" }}>
          {a.engines.map((e) => <span key={e} className="chip cobalt mono" style={{ fontSize: 11 }}>{e}</span>)}
        </div>
        <div className="label">Lean invariants</div>
        <ul style={{ margin: "4px 0 10px", paddingLeft: 18, fontFamily: "var(--mono)", fontSize: 12 }}>
          {a.inv.map((x) => <li key={x}>{x}</li>)}
        </ul>
        <div className="label">On breach</div>
        <div style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{a.cure}</div>
      </div>
      <style>{`
.arch{display:grid;grid-template-columns:1.25fr 1fr;gap:12px;align-items:center;padding:12px 16px;font-family:var(--sans)}
.arch-svg{width:100%;height:auto;display:block}
.arch-card{background:var(--paper-2);border-radius:10px;padding:14px 16px}
@media(max-width:720px){.arch{grid-template-columns:1fr}}
`}</style>
    </div>
  );
}

// ---------------------------------------------------------------- roles
const ROLE_SPEC: { t: string; roles: string[] }[] = [
  { t: "Case: Retail Wire Policy Inquiry", roles: ["owner"] },
  { t: "Business Deliverable: Verified_Compliance_Answer", roles: ["owner"] },
  { t: "Lanes:", roles: ["iam"] },
  { t: "  Branch Compliance Officer: { SSO: Entra ID }", roles: ["iam", "owner"] },
  { t: "Case File: { Source: s3://…, uc://… }", roles: ["de"] },
  { t: "  Curation: redact [UAE_IBAN, EMIRATES_ID]", roles: ["de", "risk"] },
  { t: "Binding Lean Contract:", roles: ["risk"] },
  { t: "  - It is obligatory that citation coverage >= 90% …", roles: ["risk", "audit"] },
  { t: "  - It is obligatory that counterfactual JSD <= 0.020", roles: ["ds", "risk"] },
  { t: "Cost & Traffic Guards:", roles: ["owner", "mlops"] },
  { t: "  Value Per Outcome: $3.50 · Target ROI: 4.0x", roles: ["owner"] },
  { t: "  Model Ladder: [large, medium, small]", roles: ["ds", "mlops"] },
  { t: "  Rate Limit: 30 requests/minute per Lane", roles: ["mlops"] },
  { t: "Process Flow:", roles: ["owner"] },
  { t: "  - Retrieve … BM25 + SVD + RRF", roles: ["ds"] },
  { t: "  - Run existing script fx_normalise.py", roles: ["dev"] },
  { t: "  On Breach: Escalate To: Head of Compliance", roles: ["risk", "owner"] },
  { t: "Deployment: { Cloud: aws://me-central-1, Residency: UAE }", roles: ["mlops", "iam"] },
  { t: "  Data Governance: [Collibra, Unity Catalog]", roles: ["de", "audit"] },
  { t: "  Audit: SHA-256 W3C PROV-O ledger", roles: ["audit"] },
];

export const ROLES: { id: string; label: string; does: string; color: string }[] = [
  { id: "owner", label: "Business owner", does: "States the case, value per outcome, target ROI and who gets escalations. Never sees LangGraph.", color: "var(--gold)" },
  { id: "risk", label: "Risk & compliance", does: "Writes obligations and prohibitions in SBVR English; they compile to Lean 4 gates.", color: "var(--cat-verify)" },
  { id: "de", label: "Data engineering", does: "Binds sources, converters and governance catalogs (Unity Catalog, Collibra, Purview).", color: "var(--cat-data)" },
  { id: "ds", label: "AI / data science", does: "Chooses retrieval, model ladders and fairness probes; tunes with evidence, not opinions.", color: "var(--cat-reason)" },
  { id: "mlops", label: "MLOps / platform", does: "Owns rate limits, scaling, regions and rollout; the .csar runs on their stack.", color: "var(--cat-govern)" },
  { id: "dev", label: "Developers", does: "Wrap existing scripts, APIs and notebooks as typed tools — no rewrite.", color: "var(--cobalt)" },
  { id: "iam", label: "Security / IAM", does: "Maps lanes to SSO groups and clearances; residency pins.", color: "var(--cat-curate)" },
  { id: "audit", label: "Internal audit", does: "Reads one document and one hash-chained ledger instead of ten systems.", color: "var(--cat-act)" },
];

export function RolesFigure() {
  const [role, setRole] = useState<string | null>(null);
  const r = ROLES.find((x) => x.id === role);
  return (
    <div className="roles">
      <div className="roles-list">
        {ROLES.map((x) => (
          <button key={x.id} className={role === x.id ? "on" : ""} onMouseEnter={() => setRole(x.id)} onFocus={() => setRole(x.id)} onClick={() => setRole(x.id)} style={{ ["--rc" as string]: x.color }}>
            <i />
            {x.label}
          </button>
        ))}
      </div>
      <div className="roles-spec">
        {ROLE_SPEC.map((l, i) => {
          const on = role && l.roles.includes(role);
          return (
            <div key={i} className={on ? "on" : role ? "dim" : ""} style={on ? { ["--rc" as string]: r!.color } : undefined}>
              {l.t}
            </div>
          );
        })}
        <div className="roles-note">{r ? r.does : "Hover a role to see which lines of one shared CaseSpine document it owns."}</div>
      </div>
      <style>{`
.roles{display:grid;grid-template-columns:200px 1fr;gap:14px;padding:14px 16px;font-family:var(--sans)}
@media(max-width:720px){.roles{grid-template-columns:1fr}.roles-list{flex-direction:row!important;flex-wrap:wrap}}
.roles-list{display:flex;flex-direction:column;gap:3px}
.roles-list button{display:flex;align-items:center;gap:8px;background:none;border:1px solid transparent;border-radius:8px;padding:6px 8px;font-size:13.5px;cursor:pointer;text-align:left;color:var(--ink-2)}
.roles-list button i{width:10px;height:10px;border-radius:50%;background:var(--rc)}
.roles-list button.on{background:var(--paper-2);border-color:var(--rule);color:var(--ink);font-weight:600}
.roles-spec{font-family:var(--mono);font-size:12px;background:var(--paper-2);border-radius:10px;padding:10px 12px;overflow-x:auto}
.roles-spec>div{padding:1.5px 6px;border-left:3px solid transparent;white-space:pre;transition:all .2s;border-radius:0 4px 4px 0}
.roles-spec>div.on{border-left-color:var(--rc);background:color-mix(in oklab,var(--rc) 14%,transparent);color:var(--ink)}
.roles-spec>div.dim{opacity:.38}
.roles-spec .roles-note{font-family:var(--sans);font-size:13.5px;white-space:normal;border:0;margin-top:8px;color:var(--ink-2);padding:6px}
`}</style>
    </div>
  );
}

// ---------------------------------------------------------------- sovereign stack
export const STACK = [
  { k: "Business applications", items: ["Compliance Q&A", "Murabaha structuring", "Dispute triage", "Dashboards"], c: "var(--gold)" },
  { k: "CaseSpine orchestrator (.csar)", items: ["Lean 4 gates", "ROI governor", "LangGraph · Temporal · Airflow", "Audit ledger"], c: "var(--emerald)" },
  { k: "Identity & access", items: ["Microsoft Entra ID", "UAE PASS", "Okta · Ping", "Keycloak · ZITADEL", "SAML 2.0 · OIDC · SCIM"], c: "var(--cat-curate)" },
  { k: "Data governance", items: ["Collibra", "Unity Catalog", "Microsoft Purview", "Dataplex", "Atlan · Alation · OpenMetadata"], c: "var(--cat-data)" },
  { k: "Sovereign compute (UAE)", items: ["Azure UAE North / Central", "AWS me-central-1", "Core42 sovereign cloud", "Oracle Abu Dhabi · Dubai", "On-prem / air-gapped"], c: "var(--cobalt)" },
];

export function SovereignStack() {
  return (
    <div className="stack">
      {STACK.map((l, i) => (
        <div key={l.k} className="stack-l fade-up" style={{ animationDelay: `${i * 0.08}s`, ["--sc" as string]: l.c }}>
          <div className="stack-k">{l.k}</div>
          <div className="stack-items">{l.items.map((x) => <span key={x}>{x}</span>)}</div>
        </div>
      ))}
      <style>{`
.stack{display:flex;flex-direction:column;gap:6px;padding:16px;font-family:var(--sans)}
.stack-l{display:grid;grid-template-columns:220px 1fr;gap:12px;align-items:center;border:1px solid var(--rule);border-left:4px solid var(--sc);border-radius:8px;padding:9px 12px;background:var(--card)}
.stack-k{font-weight:650;font-size:14px}
.stack-items{display:flex;flex-wrap:wrap;gap:5px}
.stack-items span{font-size:12px;padding:2px 9px;border-radius:99px;background:color-mix(in oklab,var(--sc) 12%,transparent);color:var(--ink-2)}
@media(max-width:640px){.stack-l{grid-template-columns:1fr}}
`}</style>
    </div>
  );
}

// ---------------------------------------------------------------- ledger chain
export function LedgerChain() {
  const events = ["case.compiled", "casefile.ingested", "curation.completed", "query.received", "gate.evaluated", "deliverable.emitted", "hitm.approved"];
  const [n, setN] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x >= events.length ? 3 : x + 1)), 1600);
    return () => clearInterval(id);
  }, []);
  const hex = (i: number) => ((i * 2654435761) >>> 0).toString(16).padStart(8, "0");
  return (
    <div className="ledger-fig">
      {events.slice(0, n).map((e, i) => (
        <div key={i} className="lf-block fade-up">
          <div className="lf-seq">#{i}</div>
          <div className="lf-e">{e}</div>
          <div className="lf-h">prev {i ? hex(i - 1) : "00000000"}…</div>
          <div className="lf-h" style={{ color: "var(--emerald)" }}>hash {hex(i)}…</div>
        </div>
      ))}
      <style>{`
.ledger-fig{display:flex;gap:18px;padding:18px;overflow-x:auto;font-family:var(--sans);min-height:122px}
.lf-block{flex:none;width:150px;border:1px solid var(--rule-2);border-top:3px solid var(--gold);border-radius:8px;padding:8px 10px;background:var(--card);position:relative}
.lf-block+.lf-block::before{content:"";position:absolute;left:-19px;top:44px;width:18px;border-top:2px dashed var(--gold)}
.lf-seq{font-size:11px;color:var(--ink-3)}
.lf-e{font-weight:600;font-size:13px;margin:2px 0 6px}
.lf-h{font-family:var(--mono);font-size:10.5px;color:var(--ink-3)}
`}</style>
    </div>
  );
}
