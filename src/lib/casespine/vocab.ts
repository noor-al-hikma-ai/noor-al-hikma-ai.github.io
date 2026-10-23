// Vocabulary for autocompletion and hover hints. Each keyword says which
// international standard it maps to, so non-programmers learn the semantics
// while typing.

export interface KeywordDoc {
  key: string;
  ar?: string;
  doc: string;
  std?: string;
  snippet?: string;
  level: "top" | "case-file" | "lane" | "guards" | "stage" | "gateway" | "contract" | "deployment";
}

export const KEYWORDS: KeywordDoc[] = [
  { key: "Case", ar: "الحالة", level: "top", std: "OMG CMMN 1.1 · CasePlanModel", doc: "Names the business case. Everything below compiles into one isolated namespace with its own SHA-256 isolation hash." },
  { key: "Version", ar: "الإصدار", level: "top", doc: "Language version of this document." },
  { key: "Solution Archetype", ar: "نموذج الحل", level: "top", std: "CaseSpine v5", doc: "One of eight universal archetypes (RAG, code fork, MILP, saga/STP, causal, IoT twin, data foundry, B2B negotiation). Selects default engines and theorem packs." },
  { key: "Business Deliverable", ar: "مخرج الأعمال", level: "top", doc: "The signed artefact the case must produce (term sheet, schedule, release bundle …)." },
  { key: "Engine", ar: "المحرك", level: "top", doc: "Optional explicit engines, e.g. [langgraph://, ortools_milp://]. Usually inferred from your steps." },
  { key: "Standards", ar: "المعايير", level: "top", doc: "Standards the compiler must honour when emitting artefacts (BPMN 2.0, CMMN, DMN, SBVR, PROV-O …)." },
  { key: "Population Segment", ar: "شريحة العملاء", level: "top", doc: "Customer segment for personalisation and fairness checks." },
  { key: "Lanes", ar: "المسارات", level: "top", std: "ISO/IEC 19510 BPMN 2.0 · Lane", doc: "Who takes part: each lane is a role with SSO identity, clearance and approval rights. Escalations route to lanes." },
  { key: "Case File", ar: "ملف الحالة", level: "top", std: "OMG CMMN 1.1 · CaseFileItem", doc: "Documents and data the case may read. Curation, PII redaction and namespace isolation are declared here." },
  { key: "Binding Lean Contract", ar: "العقد الملزم", level: "top", std: "OMG SBVR 1.5 → Lean 4 / Z3", doc: "Business rules in constrained English. Each rule compiles to a decidable Lean 4 proposition checked at milestone gates." },
  { key: "Cost & Traffic Guards", ar: "ضوابط التكلفة والحركة", level: "top", std: "CaseSpine ROI Governor", doc: "ROI levers: budget ceiling, pre-flight gate, rate limits, topic limits, model ladder, caching, downscaling, value per outcome." },
  { key: "Process Flow", ar: "مسار العملية", level: "top", std: "BPMN 2.0 · SubProcess / CMMN · Stage", doc: "Ordered stages with sentries (When), steps, escalations and an exit gateway." },
  { key: "Subcases", ar: "الحالات الفرعية", level: "top", doc: "Nested cases inherit rules and theorem packs; their budgets must fit inside the parent's." },
  { key: "AI Smart Suggestions", level: "top", std: "CMMN DiscretionaryItem", doc: "AI proposals that a named lane must moderate before they take effect (human-in-the-middle)." },
  { key: "Actuators", level: "top", doc: "Downstream orchestrators and trackers (Airflow, MLflow, Kubernetes …)." },
  { key: "Deployment", ar: "النشر", level: "top", doc: "Cloud, residency, identity and data-governance bindings for the compiled assembly." },
  { key: "Business & Product Constraints", level: "top", doc: "Free-form facets (value, cost, latency, quality, risk, compliance, residency, availability, scale) kept in the IR for planners." },
  { key: "SSO Provider", ar: "مزود الدخول الموحد", level: "lane", doc: "Microsoft Entra ID, Okta, Ping, Keycloak, Google, AWS IAM Identity Center, UAE PASS, ADFS, any SAML 2.0 / OIDC IdP." },
  { key: "User", level: "lane", doc: "Named person for this lane (optional; usually resolved from SSO groups)." },
  { key: "Roles", ar: "الأدوار", level: "lane", doc: "Role claims, e.g. [HITM_APPROVER]. Approvers receive escalations." },
  { key: "Clearance", ar: "التصريح", level: "lane", doc: "Data clearances checked against Case File classification." },
  { key: "Source", ar: "المصدر", level: "case-file", doc: 'pdf("a.pdf"), s3://…, abfss://…, gs://…, uc://catalog.schema.volume, sharepoint://…' },
  { key: "Namespace Isolation", ar: "عزل النطاق", level: "case-file", std: "Non-interference", doc: 'strict ("Namespace") — chunks can never be retrieved by another case.' },
  { key: "Converters", ar: "المحولات", level: "case-file", doc: "Document converters: pdfplumber_layout, booktabs_table_extractor, openspg_kag_triple_extractor, docx, ocr_arabic." },
  { key: "Curation", ar: "التنقيح", level: "case-file", std: "UAE PDPL · data minimisation", doc: "redact [UAE_IBAN, EMIRATES_ID, PASSPORT, EMAIL, PHONE_UAE, CARD_PAN, TRN] and require coherence >= 0.85" },
  { key: "Import Theorem Packs", ar: "حزم المبرهنات", level: "contract", doc: "Reusable proof libraries, e.g. core.rag.grounding, isolation.non_interference, cbuae.aml.v2, aaoifi.sharia.ss08." },
  { key: "Rules (SBVR & FEEL Constrained English)", ar: "القواعد", level: "contract", std: "OMG SBVR 1.5 · DMN FEEL", doc: "One rule per line: `It is obligatory that <metric> >= <value> before Milestone <Name>.` or `It is prohibited that …`" },
  { key: "Budget Ceiling", ar: "سقف الميزانية", level: "guards", doc: "Hard ceiling, e.g. `4000 tokens or $0.10`. Subcase budgets must sum below the parent." },
  { key: "Pre-Flight Gate", ar: "بوابة الفحص المسبق", level: "guards", doc: "Blocks low-entropy and off-topic queries before any model is called (0 tokens spent)." },
  { key: "Rate Limit", ar: "حد المعدل", level: "guards", doc: "`30 requests/minute per Lane` — token bucket with AIMD admission under load." },
  { key: "Allowed Topics", ar: "المواضيع المسموحة", level: "guards", doc: "Whitelist of topics; compiled to guardrails on every cloud." },
  { key: "Banned Topics", ar: "المواضيع المحظورة", level: "guards", doc: "Blacklist of topics (e.g. investment advice) — blocked at 0 tokens, logged to the audit ledger." },
  { key: "Model Ladder", ar: "سلم النماذج", level: "guards", doc: "`[large, medium, small] when budget remaining < 40%` — automatic model downsizing." },
  { key: "Adaptive Optimizer", ar: "المحسن التكيفي", level: "guards", doc: "Constrained optimisation over model tier, thinking effort, context compression and token appetite." },
  { key: "Semantic Cache", ar: "الذاكرة الدلالية", level: "guards", doc: "Reuse verified answers for near-duplicate questions." },
  { key: "Downscaling", ar: "خفض السعة", level: "guards", doc: "Scale workers to zero when idle (KEDA)." },
  { key: "Value Per Outcome", ar: "قيمة كل نتيجة", level: "guards", doc: "Business value of one successful outcome; used by the ROI governor." },
  { key: "Target ROI", ar: "العائد المستهدف", level: "guards", doc: "Minimum value/cost ratio; breaches trigger levers and escalation." },
  { key: "When", ar: "عندما", level: "stage", std: "CMMN Sentry (event-condition)", doc: "Entry criterion for the stage." },
  { key: "Steps", ar: "الخطوات", level: "stage", doc: "Plain-English steps. The compiler maps them to engines (BM25, LangGraph, SQL, OR-Tools, tests, dashboards …)." },
  { key: "On Breach", ar: "عند الخرق", level: "stage", std: "BPMN Boundary Escalation Event", doc: "What happens when a guard or rule is breached in this stage." },
  { key: "Escalate To", ar: "التصعيد إلى", level: "stage", doc: "A Lane (or queue) of eligible personnel; durable wait for human decision." },
  { key: "Reach Milestone", ar: "بلوغ المعلم", level: "stage", std: "CMMN Milestone", doc: "Milestone reached when the stage completes; rules gated `before Milestone X` are checked here." },
  { key: "Exit Gateway (Lean 4 Spine Reference Monitor)", ar: "بوابة الخروج", level: "stage", std: "BPMN Exclusive Gateway + Lean 4", doc: "Output leaves the stage only if every inherited and local rule holds." },
  { key: "If", ar: "إذا", level: "gateway", doc: "Gateway condition, usually `all Binding Lean Contract rules hold`." },
  { key: "Then", ar: "فإن", level: "gateway", doc: "Success path: emit the deliverable and reach a milestone." },
  { key: "Else", ar: "وإلا", level: "gateway", std: "BPMN Compensation", doc: "Failure path: halt loudly and compensate / escalate." },
  { key: "Cloud", ar: "السحابة", level: "deployment", doc: "aws://me-central-1, azure://uaenorth, azure://uaecentral, gcp://…, databricks://…, core42://…, k8s://onprem" },
  { key: "Residency", ar: "إقامة البيانات", level: "deployment", doc: "Data residency pin, e.g. UAE. Compiler rejects targets outside the jurisdiction." },
  { key: "Identity", ar: "الهوية", level: "deployment", doc: "SSO providers for all lanes." },
  { key: "Data Governance", ar: "حوكمة البيانات", level: "deployment", doc: "Collibra, Unity Catalog, Microsoft Purview, Dataplex, Atlan, Alation, OpenMetadata, DataHub." },
  { key: "Audit", level: "deployment", doc: "Audit sink; default is the hash-chained W3C PROV-O ledger." },
];

export const RULE_TEMPLATES: { label: string; text: string; detail: string }[] = [
  { label: "citation coverage", text: "It is obligatory that citation coverage >= 90% and tokens consumed <= 4000 before Milestone ${Milestone}.", detail: "Grounding + budget" },
  { label: "PII redacted", text: "It is obligatory that PII is redacted for [UAE_IBAN, EMIRATES_ID] and chunk coherence >= 0.85 before Milestone ${Milestone}.", detail: "UAE PDPL minimisation" },
  { label: "no confounders", text: "It is prohibited that cross-case confounders > 0 in Case File.", detail: "Non-interference" },
  { label: "four-eyes", text: "It is obligatory that reviewer 1 != reviewer 2 before Milestone ${Milestone}.", detail: "Segregation of duties" },
  { label: "sanctions freshness", text: "It is obligatory that sanctions feed staleness <= 4 hours before Milestone ${Milestone}.", detail: "AML/CFT screening" },
  { label: "latency SLA", text: "It is obligatory that p95 latency <= 2500 ms before Milestone ${Milestone}.", detail: "Service level" },
  { label: "cost per query", text: "It is obligatory that cost per query <= $0.05 before Milestone ${Milestone}.", detail: "Unit economics" },
  { label: "fairness", text: "It is obligatory that counterfactual JSD <= 0.020 before Milestone ${Milestone}.", detail: "Model risk · fairness" },
  { label: "Sharia Murabaha", text: "It is obligatory that bank owns underlying asset (Qabd Hukmi) and debt to asset ratio <= 33.0% before Milestone ${Milestone}.", detail: "AAOIFI SS-08" },
];

export const VALUE_SUGGESTIONS: Record<string, string[]> = {
  "sso provider": ["Microsoft Entra ID", "UAE PASS", "Okta", "Ping Identity", "Keycloak OIDC", "Google Cloud Identity", "AWS IAM Identity Center", "ADFS (SAML 2.0)", "Authentik", "ZITADEL"],
  identity: ["[Microsoft Entra ID, UAE PASS]", "[Okta]", "[Keycloak OIDC]", "[Ping Identity, ADFS (SAML 2.0)]"],
  "solution archetype": [
    "KNOWLEDGE_SYNTHESIS_AND_RAG", "AUTONOMOUS_CODE_AND_DEVOPS_FORK", "QUANTITATIVE_OPTIMIZATION_AND_MILP",
    "TRANSACTIONAL_SAGA_AND_STRAIGHT_THROUGH_PROCESSING", "CONTINUOUS_CAUSAL_AND_COUNTERFACTUAL_EXPERIMENTATION",
    "PHYSICAL_IOT_DIGITAL_TWIN_AND_CONTROL_LOOP", "DATA_FOUNDRY_AND_MEDALLION_ETL_CURATION", "AGENTIC_B2B_NEGOTIATION_AND_PROCUREMENT",
  ],
  cloud: ["aws://me-central-1", "azure://uaenorth", "azure://uaecentral", "core42://sovereign", "oci://me-abudhabi-1", "databricks://uaenorth", "gcp://me-central2", "k8s://onprem-openshift"],
  residency: ["UAE", "UAE (DIFC)", "UAE (ADGM)", "GCC"],
  "data governance": ["[Collibra, Unity Catalog]", "[Microsoft Purview]", "[Google Dataplex]", "[Atlan]", "[Alation]", "[OpenMetadata]", "[DataHub]"],
  "import theorem packs": ["[core.rag.grounding, isolation.non_interference]", "[cbuae.aml.v2]", "[aaoifi.sharia.ss08]", "[uae.pdpl.minimisation]", "[cbuae.consumer_protection]"],
  "budget ceiling": ["4000 tokens or $0.10", "25000 tokens or $2.50"],
  "rate limit": ["30 requests/minute per Lane", "600 requests/hour per Lane"],
  "model ladder": ["[large, medium, small] when budget remaining < 40%"],
  "banned topics": ["[investment advice, cryptocurrency speculation, lottery]"],
  curation: ["redact [UAE_IBAN, EMIRATES_ID, EMAIL, PHONE_UAE] and require coherence >= 0.85"],
  "pre-flight gate": ["Loudly block stupid queries (lexical entropy < 0.65) and off-topic queries at 0 tokens."],
  converters: ["[pdfplumber_layout, booktabs_table_extractor]", "[pdfplumber_layout, ocr_arabic, openspg_kag_triple_extractor]"],
  engine: ["[langgraph://, openspg_kag://]", "[ortools_milp://, sql_duckdb://]", "[temporal_saga://, zeebe_bpmn://]", "[databricks_dlt://, dbt_duckdb://]"],
};

export const STEP_TEMPLATES = [
  "Retrieve top 3 chunks using Okapi BM25 and 12D SVD Dense Indexer with RRF Reranker",
  "Synthesize grounded answer with inline page and chunk citations",
  "Evaluate Cost & Traffic Guards on Inquiry",
  "Extract prose sections and reconstruct booktabs tables",
  "Scrub [UAE_IBAN, EMIRATES_ID] and strip any foreign namespace confounders",
  "Run 4x Shadow Counterfactual Perturbations across [nationality, branch_emirate, gender]",
  "Route low-confidence answers to Head of Retail Compliance for approval",
  "Query customer limits with parametric SQL from Databricks SQL",
  "Solve MILP dispatch with OR-Tools under capacity constraints",
  "Run existing script fx_normalise.py to convert amounts to AED",
  "Publish ROI dashboard to Branch Compliance Officer",
  "Generate property-based regression tests for every contract rule",
];

export const PII_ENTITIES = ["UAE_IBAN", "EMIRATES_ID", "PASSPORT", "EMAIL", "PHONE_UAE", "CARD_PAN", "TRN"];
