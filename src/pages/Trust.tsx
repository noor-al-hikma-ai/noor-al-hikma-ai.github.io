import { useState } from "react";
import { LedgerChain, SovereignStack } from "../components/Figures";
import { contactHref } from "../config";

const MAPPING = [
  {
    reg: "CBUAE — Guidance Note on consumer protection and responsible adoption of AI/ML (Feb 2026)",
    tag: "AI",
    asks: "Governance and accountability, fairness and non-discrimination, transparency and explainability, effective human oversight, data management and privacy.",
    control: "Named Lanes with approvers; counterfactual fairness probes as Lean rules; citation-grounded answers; Exit Gateway with human escalation; PII contract before indexing.",
    evidence: "Compiled contract per case, citations per answer, escalation decisions with approver identity, hash-chained ledger.",
  },
  {
    reg: "CBUAE — Model Management Standards and Guidance",
    tag: "Model risk",
    asks: "Model inventory, development standards, independent validation, ongoing monitoring and challenge.",
    control: "Every model call goes through the Model Ladder with registry identifiers (MLflow); contract metrics are monitored at each milestone; four-eyes rules for approvals.",
    evidence: "IR manifest with model tiers, gate pass/fail statistics, lineage to MLflow runs.",
  },
  {
    reg: "CBUAE — Outsourcing Regulation for Banks (2021)",
    tag: "Outsourcing",
    asks: "Materiality assessment and non-objection, protection of customer data (no sharing outside the UAE without approvals), audit access, exit strategy.",
    control: "Residency pin in the Deployment section; self-contained .csar that runs in the bank's own tenancy or on-premises; no hidden SaaS dependency.",
    evidence: "Deployment manifest, SHA-256 digests of every artefact, `extract` for full source escrow.",
  },
  {
    reg: "UAE PDPL — Federal Decree-Law No. 45 of 2021",
    tag: "Privacy",
    asks: "Lawful and minimal processing, security of personal data, restrictions on cross-border transfer.",
    control: "Redaction of UAE IBAN, Emirates ID, passport, e-mail, phone, card and TRN before indexing; strict namespace isolation per case.",
    evidence: "Curation report with redaction counts, isolation hash, `piiRedacted` probe at every gate.",
  },
  {
    reg: "AML/CFT — Federal Decree-Law No. 10 of 2025 and CBUAE AML/CFT guidance",
    tag: "AML/CFT",
    asks: "Sanctions screening, suspicious transaction reporting via goAML, record keeping, no tipping off.",
    control: "Sanctions-feed staleness and four-eyes rules; banned topics for tipping-off language; durable escalation queues.",
    evidence: "Rule evaluations per decision, reviewer identities, PROV-O ledger exports for record keeping.",
  },
  {
    reg: "Higher Sharia Authority (CBUAE) — AAOIFI Sharia standards",
    tag: "Sharia",
    asks: "Sharia compliance of products, e.g. ownership and possession before a Murabaha sale, financial-ratio screens.",
    control: "Sharia theorem packs (e.g. ss08) with Qabd and debt-to-asset rules; escalation to the Sharia committee lane.",
    evidence: "Structuring ruling with the contract it satisfied and the committee decision.",
  },
  {
    reg: "UAE Information Assurance Regulation",
    tag: "Security",
    asks: "Access control, logging and monitoring, incident handling.",
    control: "SSO-bound lanes and clearances; Kubernetes NetworkPolicy non-interference; tamper-evident logs.",
    evidence: "IAM mapping, generated network policies, ledger verification.",
  },
  {
    reg: "DIFC Data Protection Law 2020 & Regulation 10 · ADGM Data Protection Regulations 2021",
    tag: "Free zones",
    asks: "For DIFC/ADGM entities: transparency about autonomous systems, data-subject rights, accountability.",
    control: "Deliverable notices, lane-level disclosure, per-case data inventories.",
    evidence: "Notices and PROV-O lineage per processing activity.",
  },
];

const INTEGRATIONS: { k: string; items: string[] }[] = [
  { k: "Single sign-on", items: ["Microsoft Entra ID", "Active Directory / ADFS", "UAE PASS", "Okta", "Ping Identity", "Auth0", "Google Cloud Identity", "AWS IAM Identity Center", "Keycloak", "Authentik", "ZITADEL", "Ory", "SAML 2.0", "OpenID Connect", "SCIM 2.0", "LDAP", "Kerberos / SPNEGO", "CyberArk (PAM)", "HashiCorp Vault"] },
  { k: "Data governance & lineage", items: ["Collibra", "Databricks Unity Catalog", "Microsoft Purview", "Google Dataplex", "AWS DataZone / Lake Formation", "Alation", "Atlan", "Informatica CDGC", "OpenMetadata", "DataHub", "Apache Atlas", "Apache Ranger", "Immuta", "OpenLineage / Marquez"] },
  { k: "Compute & residency", items: ["Azure UAE North / UAE Central", "AWS Middle East (UAE) me-central-1", "Core42 sovereign cloud", "Oracle Cloud Abu Dhabi / Dubai", "Databricks on Azure UAE", "Google Cloud (via approved region / Distributed Cloud)", "Red Hat OpenShift", "Kubernetes on-prem", "Air-gapped"] },
  { k: "Models", items: ["Azure OpenAI", "Amazon Bedrock", "Vertex AI", "Databricks Mosaic AI", "Falcon (TII)", "Jais", "Open-weight models on vLLM", "Local LoRA adapters"] },
  { k: "Orchestration & tools", items: ["LangGraph", "LangChain LCEL", "Temporal", "Camunda Zeebe", "Apache Airflow", "AWS Step Functions", "Google Cloud Workflows", "Lakeflow Jobs", "Ray", "KServe", "KEDA", "Argo Rollouts", "MLflow", "dbt", "DuckDB", "OR-Tools", "Lean 4", "Z3"] },
];

export default function Trust() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <article className="paper wide">
      <div className="label" style={{ color: "var(--gold)" }}>Trust &amp; compliance</div>
      <h1 style={{ maxWidth: 900 }}>Designed for a UAE bank's architecture, risk and audit reviews</h1>
      <p className="lede" style={{ maxWidth: 820 }}>
        CaseSpine turns obligations into executable controls and produces the evidence reviewers ask for. Below is how each control maps to
        the frameworks UAE financial institutions work under.
      </p>
      <div className="abstract" style={{ maxWidth: 900 }}>
        <span className="label">Scope of these mappings</span>
        <p style={{ fontSize: 15.5 }}>
          These are design-time alignments between CaseSpine controls and published regulatory themes. They are not legal advice, an attestation
          or a certification. Each institution remains responsible for its own regulatory assessment; we support that assessment with
          evidence packs generated from the compiled case.
        </p>
      </div>

      <h2><span className="num">1</span>Regulation → control → evidence</h2>
      <div className="trust-map">
        {MAPPING.map((m, i) => (
          <div key={m.reg} className={`trust-row${open === i ? " open" : ""}`}>
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <span className="chip gold">{m.tag}</span>
              <span className="trust-reg">{m.reg}</span>
              <span className="trust-plus">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && (
              <div className="trust-detail fade-up">
                <div><span className="label">What it asks</span><p>{m.asks}</p></div>
                <div><span className="label">CaseSpine control</span><p>{m.control}</p></div>
                <div><span className="label">Evidence produced</span><p>{m.evidence}</p></div>
              </div>
            )}
          </div>
        ))}
      </div>

      <h2><span className="num">2</span>Deployment and residency</h2>
      <div className="figure-body"><SovereignStack /></div>

      <h2><span className="num">3</span>Integrations</h2>
      <p>Bring your own identity provider, catalog, cloud and models. Lanes, case files and deployments bind to them declaratively.</p>
      <div className="grid-2">
        {INTEGRATIONS.map((g) => (
          <div key={g.k} className="card">
            <h4>{g.k}</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {g.items.map((x) => <span key={x} className="chip">{x}</span>)}
            </div>
          </div>
        ))}
      </div>

      <h2><span className="num">4</span>Security posture</h2>
      <div className="grid-3">
        {[
          { h: "Your tenancy, your keys", p: "Assemblies run inside the bank's cloud account or data centre with customer-managed keys (KMS / HSM) and private endpoints." },
          { h: "Fail-closed by default", p: "Unbound probes, missing approvals or unknown topics stop the stage and escalate — the runtime never guesses." },
          { h: "Signed, inspectable artefacts", p: "Every .csar carries SHA-256 digests for each file; `verify` and `extract` give reviewers the full source." },
          { h: "Non-interference", p: "Each case gets an isolation hash, its own namespace, network policy and catalog schema — no cross-case retrieval." },
          { h: "Human authority", p: "Escalations route to named lanes resolved from SSO groups; approvals are logged with identity and the rules involved." },
          { h: "This website", p: "No cookies, no analytics, fonts self-hosted. Sandbox documents are parsed in your browser and never uploaded." },
        ].map((c) => (
          <div key={c.h} className="card"><h4>{c.h}</h4><p>{c.p}</p></div>
        ))}
      </div>

      <h2><span className="num">5</span>Tamper-evident audit</h2>
      <div className="figure-body"><LedgerChain /></div>
      <p className="muted sans" style={{ fontSize: 14.5, marginTop: 10 }}>
        Try it in the <a href="#/sandbox">RAG sandbox</a>: ask a few questions, then press “Try tampering” to watch verification fail.
      </p>

      <div className="cta-row" style={{ marginTop: 34 }}>
        <a className="btn btn-emerald" href={contactHref("CaseSpine evidence pack")}>Request an evidence pack</a>
        <a className="btn btn-ghost" href="#/walkthrough">Watch the walkthrough</a>
      </div>
      <style>{`
.trust-map{border-top:2px solid var(--gold-2);border-bottom:2px solid var(--gold-2);font-family:var(--sans)}
.trust-row{border-bottom:1px solid var(--rule)}
.trust-row:last-child{border-bottom:0}
.trust-row>button{display:grid;grid-template-columns:110px 1fr 24px;gap:12px;align-items:center;width:100%;background:none;border:0;text-align:left;padding:12px 6px;cursor:pointer}
.trust-row>button:hover{background:var(--paper-2)}
.trust-row .chip{justify-self:start}
.trust-reg{font-weight:600;font-size:15px}
.trust-plus{font-size:20px;color:var(--gold);text-align:center}
.trust-detail{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:4px 6px 16px 128px}
.trust-detail p{font-size:14.5px;color:var(--ink-2);margin:4px 0 0}
@media(max-width:820px){.trust-detail{grid-template-columns:1fr;padding-left:6px}.trust-row>button{grid-template-columns:1fr 24px}.trust-row .chip{display:none}}
`}</style>
    </article>
  );
}
