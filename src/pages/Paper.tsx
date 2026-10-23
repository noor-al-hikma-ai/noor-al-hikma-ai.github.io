import { useMemo, useState } from "react";
import { Octagram } from "../components/Logo";
import { PipelineFigure } from "../components/PipelineFigure";
import { RoiSim } from "../components/RoiSim";
import { ArchetypeStar, LedgerChain, RolesFigure, SovereignStack } from "../components/Figures";
import { compileRule, clauseText } from "../lib/casespine/rules";
import { normalizeArabicLine } from "../lib/casespine/arabic";
import { contactHref, SITE } from "../config";

function Figure({ n, caption, children, bleed }: { n: number; caption: React.ReactNode; children: React.ReactNode; bleed?: boolean }) {
  return (
    <figure className={`figure${bleed ? " bleed" : ""}`} id={`fig${n}`} style={{ marginInline: bleed ? undefined : 0 }}>
      <div className="figure-body">{children}</div>
      <figcaption>
        <b>Figure {n}:</b> {caption}
      </figcaption>
    </figure>
  );
}

const RULE_PRESETS = [
  "It is obligatory that citation coverage >= 90% and tokens consumed <= 4000 before Milestone InquiryResolved.",
  "It is prohibited that cross-case confounders > 0 in Case File.",
  "It is obligatory that sanctions feed staleness <= 4 hours and Reviewer 1 != Reviewer 2 before Milestone WireCleared.",
  "It is obligatory that cost per query is at most $0.05 and p95 latency <= 2.5 seconds.",
  "يجب أن تكون تغطية الاستشهادات >= 90% والرموز المستهلكة <= 4000 قبل المعلم InquiryResolved.",
];

function RulePlayground() {
  const [text, setText] = useState(RULE_PRESETS[0]);
  const rule = useMemo(() => compileRule(normalizeArabicLine(text), 1, 1, "Demo"), [text]);
  const ar = /[؀-ۿ]/.test(text);
  return (
    <div className="rp">
      <label className="label" htmlFor="rp-in">Type a business rule (English or Arabic)</label>
      <textarea id="rp-in" value={text} onChange={(e) => setText(e.target.value)} rows={2} dir={ar ? "rtl" : "ltr"} spellCheck={false} />
      <div className="rp-presets">
        {RULE_PRESETS.map((p, i) => (
          <button key={i} className="chip" onClick={() => setText(p)} dir={/[؀-ۿ]/.test(p) ? "rtl" : "ltr"}>
            {p.length > 46 ? p.slice(0, 44) + "…" : p}
          </button>
        ))}
      </div>
      <div className="rp-out">
        <div>
          <span className="label">Modality</span>
          <b>{rule.modality}</b>
        </div>
        <div>
          <span className="label">Gate</span>
          <b>before {rule.milestone}</b>
        </div>
        <div>
          <span className="label">Runtime probes</span>
          <b className="mono" style={{ fontSize: 12.5 }}>{rule.clauses.map(clauseText).join("  ·  ") || "—"}</b>
        </div>
      </div>
      <pre className="rp-code"><span className="muted">-- Lean 4</span>{"\n"}{rule.lean}{"\n\n"}<span className="muted">; Z3 SMT-LIB v2</span>{"\n"}{rule.smt2}{"\n\n"}<span className="muted"># Python runtime predicate</span>{"\n"}{rule.python}</pre>
      {!rule.recognized && <div style={{ color: "var(--warn)", fontSize: 13.5 }}>Not formalised yet — phrase it as “It is obligatory that &lt;metric&gt; &gt;= &lt;value&gt; …”.</div>}
      <style>{`
.rp{padding:16px 18px;font-family:var(--sans)}
.rp textarea{width:100%;font-family:var(--mono);font-size:13.5px;line-height:1.5;resize:vertical;margin-top:6px}
.rp-presets{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 12px}
.rp-presets .chip{cursor:pointer;font-size:11.5px}
.rp-out{display:grid;grid-template-columns:auto auto 1fr;gap:10px;margin-bottom:10px}
.rp-out>div{background:var(--paper-2);border-radius:8px;padding:6px 10px;display:flex;flex-direction:column;min-width:0}
.rp-out b{font-size:14px;overflow-wrap:anywhere}
@media(max-width:640px){.rp-out{grid-template-columns:1fr}}
.rp-code{margin:0;background:var(--paper-2);border-radius:8px;padding:12px 14px;font-size:12.5px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--cat-verify)}
`}</style>
    </div>
  );
}

export default function Paper() {
  return (
    <article className="paper">
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", right: -120, top: -60, pointerEvents: "none" }} className="hide-sm">
          <Octagram size={380} opacity={0.18} />
        </div>
        <div className="label" style={{ color: "var(--gold)", marginBottom: 14 }}>Technical report · CaseSpine v5 · 2026</div>
        <h1>
          CaseSpine: compiling business cases into verified, ROI&#8209;governed AI applications
        </h1>
        <div lang="ar" style={{ fontFamily: "var(--arabic-display)", fontSize: 26, color: "var(--gold)", margin: "4px 0 16px", textAlign: "left" }}>
          {SITE.nameAr} — {SITE.taglineAr}
        </div>
        <div className="authors">
          <b>{SITE.name}</b> · {SITE.location}
          {SITE.founderLine && <><br />{SITE.founderLine}</>}
        </div>
        <div className="cta-row">
          <a className="btn btn-emerald" href="#/walkthrough">▶ Start the walkthrough</a>
          <a className="btn btn-primary" href="#/studio">Open the Studio</a>
          <a className="btn btn-ghost" href="#/sandbox">Try the RAG sandbox</a>
          <a className="btn btn-gold" href="#/services">Services</a>
        </div>
      </div>

      <div className="abstract">
        <span className="label">Abstract</span>
        <p>
          Enterprise AI rarely fails for lack of models. It fails between the business case and production: costs that nobody bounded,
          outputs that nobody can prove compliant, and six hand-offs between people who do not share a language. We present <b>CaseSpine</b>,
          a constrained English and Arabic language in which a business owner states the case — data, rules, budget, people, escalations — and a
          compiler that turns it into a running, governed application. Rules written in SBVR-style English compile to decidable <b>Lean 4</b> and
          <b> Z3</b> contracts that gate every output; an <b>ROI governor</b> enforces budgets with eight runtime levers; and a portable
          <b> .csar</b> orchestrator drives LangGraph agents, Python tools, tests, dashboards and native AWS, Google Cloud, Azure and Databricks
          pipelines. Identity, data governance and UAE data-residency are first-class, which makes the same document reviewable by the business,
          risk, engineering and audit. Everything on this page is live: edit the rules and the figures recompute in your browser.
        </p>
      </div>

      <h2><span className="num">1</span>The gap between the business case and the running system</h2>
      <p>
        A bank asks for an assistant that answers branch officers' questions about wire-transfer policy. The business case fits on a page:
        whose questions, which documents, what must never be said, what an answer is worth, and who decides when the machine is unsure.
        Turning that page into production typically takes months of translation into tickets, prompts, pipelines and controls — and every
        translation loses intent. CaseSpine removes the translations: <i>the business case is the program</i>.
      </p>
      <p>Our contributions:</p>
      <ul>
        <li>a bilingual (English/Arabic) constrained language grounded in BPMN 2.0, CMMN 1.1, DMN and SBVR, readable by non-programmers;</li>
        <li>a compiler from SBVR rules to typed clauses, Lean 4 propositions with a satisfiability witness, Z3 scripts and runtime predicates;</li>
        <li>an ROI governor — pre-flight gates, topic limits, rate limits, caching, model downsizing, compression, downscaling and escalation;</li>
        <li>a portable <code>.csar</code> assembly that orchestrates the whole toolchest, with native scaffolds for AWS, Google Cloud, Databricks and Kubernetes;</li>
        <li>sovereign deployment patterns for UAE financial institutions: SSO, data governance catalogs, residency and a hash-chained audit ledger.</li>
      </ul>
      <Figure n={1} bleed caption={<>The CaseSpine compiler. A business case written in constrained English (left) is parsed, formalised into typed clauses, proven satisfiable in Lean 4, and assembled into an orchestrator that drives the entire toolchest (right). LangGraph is one tool among many — the business never needs to know it exists.</>}>
        <div style={{ padding: "14px 10px" }}>
          <PipelineFigure />
        </div>
      </Figure>

      <h2><span className="num">2</span>A language the business can sign</h2>
      <p>
        CaseSpine reads like a policy memo and parses like YAML. Each section maps to an international standard: <i>Lanes</i> are BPMN lanes
        bound to SSO groups; a <i>Case File</i> is a CMMN case-file item with its curation and isolation; <i>Rules</i> are SBVR obligations and
        prohibitions; an <i>Exit Gateway</i> is a BPMN gateway whose condition is a Lean 4 proposition. The same program can be written in Arabic —
        keywords and rule phrases normalise to the identical intermediate representation, so an Arabic-speaking risk committee and an
        English-speaking engineering team review one artefact.
      </p>
      <Figure n={2} caption={<>Live rule compiler. Each conjunct becomes a typed runtime probe (percentages become millipoints, currency becomes cents); prohibitions are negated; the milestone decides where the gate sits. Try the Arabic preset — it yields the same Lean proposition.</>}>
        <RulePlayground />
      </Figure>

      <h2><span className="num">3</span>From rules to proofs</h2>
      <p>
        For every case and subcase the compiler emits a Lean 4 module: a state structure with one field per probe, a contract that conjoins
        inherited and local rules, a <code>Decidable</code> instance, and a witness state checked by <code>decide</code>. The witness is not
        decoration — if two rules contradict each other (say, a ratio that must be both ≤ 30% and ≥ 40%), the compiler reports that the exit
        gateway can never open, before anything is deployed. At runtime the <i>Spine Reference Monitor</i> evaluates the same predicates on
        observed state: if all hold, the deliverable ships; if any fails, the stage halts loudly, runs its compensation and escalates to the
        named lane; if a probe is unbound, it fails closed.
      </p>
      <pre className="code-out" style={{ borderRadius: 10, border: "1px solid var(--rule)", height: "auto", fontSize: 12.5 }}>
{`def ProcessContract_RetailWirePolicyInquiry (s : ProcessCaseState) : Prop :=
  (s.piiRedacted = true ∧ s.coherenceMillipoints ≥ 850) ∧
  s.crossCaseConfoundersCount ≤ 0 ∧
  (s.citationCoverageMillipoints ≥ 900 ∧ s.tokensConsumed ≤ 4000)

example : ProcessContract_RetailWirePolicyInquiry witness_RetailWirePolicyInquiry := by decide`}
      </pre>
      <p className="muted sans" style={{ fontSize: 14, marginTop: 8 }}>
        Generated modules for all reference programs type-check with Lean 4 (v4.34), including the <code>decide</code> witness proofs.
      </p>

      <h2><span className="num">4</span>ROI as an invariant, not a hope</h2>
      <p>
        Most AI programmes measure ROI after the fact. CaseSpine makes it part of the contract: a <i>Budget Ceiling</i>, a <i>Value Per
        Outcome</i> and a <i>Target ROI</i> are compiled into the governor, which spends nothing on queries that cannot create value and
        degrades gracefully before it overspends. Toggle the levers below to see how an ungoverned assistant overshoots its budget mid-afternoon
        while a governed one finishes the day inside it — and how the Lean gate turns incidents into cheap human reviews.
      </p>
      <Figure n={3} bleed caption={<>The ROI governor on a simulated day of 6,000 inquiries with a runaway integration at 14:00. Dashed grey: no levers. Blue: with the selected levers. Gold: the compiled Budget Ceiling. Assumed prices, quality and incident costs are illustrative.</>}>
        <RoiSim initial={{ preflight: true, topics: true, rate: false, cache: false, ladder: false, compression: false, downscale: false, gate: false }} />
      </Figure>

      <h2><span className="num">5</span>One language, eight archetypes</h2>
      <p>
        Retrieval-augmented generation is one workload. The same constructs — cases, subcases, inherited contracts, guards and cures — govern
        autonomous code changes, mixed-integer optimisation, transactional sagas, causal experiments, digital twins, data foundries and
        agentic procurement. The archetype selects default engines and theorem packs; the contract stays in the business's words.
      </p>
      <Figure n={4} caption={<>The eight universal solution archetypes on a khatam (eight-pointed star). Select a point to see its engines, typical deliverable, Lean invariants and the cure applied on breach.</>}>
        <ArchetypeStar />
      </Figure>

      <h2><span className="num">6</span>Everyone at one table</h2>
      <p>
        The name is literal: a case has a spine, and every role attaches to it with what they already use. Developers wrap existing scripts and
        APIs as typed tools; data engineers bind lakehouse tables and catalogs; MLOps keeps their clusters; risk writes rules instead of
        reviewing screenshots. Nobody is asked to learn a new framework to contribute.
      </p>
      <Figure n={5} caption={<>Role ownership in a single CaseSpine document. Hover a role to highlight the lines it authors.</>}>
        <RolesFigure />
      </Figure>

      <h2><span className="num">7</span>Sovereign by design</h2>
      <p>
        CaseSpine targets regulated institutions in the UAE. Assemblies run in UAE cloud regions or fully on-premises; lanes bind to Microsoft
        Entra ID, UAE PASS, Okta, Ping or open-source identity providers; case files register with Collibra, Unity Catalog, Purview or Dataplex;
        and personal data is redacted before it is indexed. Controls are mapped to the CBUAE's guidance on responsible AI, model management and
        outsourcing, the UAE PDPL and AML/CFT obligations on the <a href="#/trust">Trust &amp; Compliance</a> page.
      </p>
      <Figure n={6} caption={<>The deployment stack. Each layer is replaceable; the orchestrator is a single portable file with no hidden SaaS dependency.</>}>
        <SovereignStack />
      </Figure>

      <h2><span className="num">8</span>Audit you can verify yourself</h2>
      <p>
        Every compilation, ingestion, query, gate decision and human approval is appended to a SHA-256 hash chain exported as W3C PROV-O. An
        auditor does not need to trust the vendor: recomputing the chain detects any edit to history. The sandbox lets you try to tamper with it.
      </p>
      <Figure n={7} caption={<>Hash-chained audit ledger: each event commits to its predecessor.</>}>
        <LedgerChain />
      </Figure>

      <h2><span className="num">9</span>Limitations</h2>
      <p>
        The browser sandbox synthesises answers extractively to stay fully local; production deployments wrap the LLM tier chosen by the
        optimiser with the same gate. Cloud scaffolds are emitted complete in structure but must be bound to an institution's endpoints and
        reviewed by its engineers. Regulatory mappings describe design intent; they are not legal advice and do not replace an institution's own
        compliance assessment.
      </p>

      <div className="cta-row" style={{ marginTop: 32 }}>
        <a className="btn btn-emerald" href="#/walkthrough">▶ Walk through it step by step</a>
        <a className="btn btn-primary" href={contactHref()}>Request a pilot</a>
      </div>

      <h2 style={{ fontSize: 20 }}>References</h2>
      <ol className="refs">
        <li>Object Management Group. <i>Semantics of Business Vocabulary and Business Rules (SBVR) 1.5</i>, 2019.</li>
        <li>ISO/IEC 19510:2013. <i>Business Process Model and Notation (BPMN) 2.0</i>.</li>
        <li>Object Management Group. <i>Case Management Model and Notation (CMMN) 1.1</i>, 2016; <i>Decision Model and Notation (DMN)</i>.</li>
        <li>L. de Moura, S. Ullrich. The Lean 4 theorem prover and programming language. <i>CADE-28</i>, 2021.</li>
        <li>L. de Moura, N. Bjørner. Z3: an efficient SMT solver. <i>TACAS</i>, 2008.</li>
        <li>S. Robertson, H. Zaragoza. The probabilistic relevance framework: BM25 and beyond. <i>Foundations and Trends in IR</i>, 2009.</li>
        <li>G. Cormack, C. Clarke, S. Büttcher. Reciprocal rank fusion outperforms Condorcet and individual rank learning methods. <i>SIGIR</i>, 2009.</li>
        <li>S. Deerwester et al. Indexing by latent semantic analysis. <i>JASIS</i>, 1990.</li>
        <li>N. Halko, P.-G. Martinsson, J. Tropp. Finding structure with randomness. <i>SIAM Review</i>, 2011.</li>
        <li>W3C. <i>PROV-O: The PROV Ontology</i>, Recommendation, 2013.</li>
        <li>PEP 441 — Improving Python ZIP application support.</li>
        <li>Central Bank of the UAE. Guidance note on consumer protection and the responsible adoption of AI/ML by licensed financial institutions, Feb 2026.</li>
        <li>UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data.</li>
      </ol>
      <style>{`@media(max-width:900px){.hide-sm{display:none}}`}</style>
    </article>
  );
}
