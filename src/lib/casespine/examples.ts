// Reference CaseSpine v5 programs. All organisations, people and identifiers
// below are fictional demo data.

export const RETAIL_WIRE_EN = `# CaseSpine v5 — write the business case; the compiler writes the system.
Case: Retail Wire Policy Inquiry
Version: "5.0"
Solution Archetype: KNOWLEDGE_SYNTHESIS_AND_RAG
Business Deliverable: Verified_Retail_Wire_Compliance_Answer
Standards: [ISO-IEC-19510-BPMN2, OMG-CMMN-1.1, OMG-DMN-FEEL, OMG-SBVR-1.5]

Lanes:
  Branch Compliance Officer:
    SSO Provider: Microsoft Entra ID
    Clearance: [RETAIL_WIRE_INQUIRY]
  Head of Retail Compliance:
    SSO Provider: Microsoft Entra ID
    Roles: [HITM_APPROVER]

Case File:
  Wire Transfer Policies:
    Source: pdf("retail_wire_policy.pdf", "aml_cft_procedures.pdf")
    Namespace Isolation: strict ("RetailWirePolicyInquiry")
    Converters: [pdfplumber_layout, booktabs_table_extractor]
    Curation: redact [UAE_IBAN, EMIRATES_ID, EMAIL, PHONE_UAE] and require coherence >= 0.85

Binding Lean Contract:
  Import Theorem Packs: [core.rag.grounding, isolation.non_interference, uae.pdpl.minimisation]
  Rules (SBVR & FEEL Constrained English):
    - It is obligatory that PII is redacted for [UAE_IBAN, EMIRATES_ID] and chunk coherence >= 0.85 before Milestone IndexReady.
    - It is prohibited that cross-case confounders > 0 in Case File.
    - It is obligatory that citation coverage >= 90% and tokens consumed <= 4000 before Milestone InquiryResolved.

Cost & Traffic Guards:
  Budget Ceiling: 4000 tokens or $0.10
  Pre-Flight Gate: Loudly block stupid queries (lexical entropy < 0.65) and off-topic queries at 0 tokens.
  Rate Limit: 30 requests/minute per Lane
  Banned Topics: [investment advice, cryptocurrency speculation, lottery]
  Model Ladder: [large, medium, small] when budget remaining < 40%
  Adaptive Optimizer: Solve over (model tier, thinking effort, context compression, token appetite) to stay within budget and quality >= 0.78.
  Value Per Outcome: $3.50 per resolved inquiry
  Target ROI: 4.0x

Process Flow:
  - Stage 1 (Curate Case File via LangGraph):
      When: Case File "Wire Transfer Policies" is loaded
      Steps:
        - Discover PDF documents and verify W3C PROV-O source hashes
        - Extract prose sections and reconstruct booktabs tables
        - Scrub [UAE_IBAN, EMIRATES_ID] and strip any foreign namespace confounders
      On Breach:
        Escalate To: Branch Data Steward Quarantine Queue
      Reach Milestone: IndexReady

  - Stage 2 (Resolve Officer Inquiry via Hybrid RAG):
      When: Milestone IndexReady is achieved and Branch Compliance Officer submits Inquiry
      Steps:
        - Evaluate Cost & Traffic Guards on Inquiry
        - Retrieve top 3 chunks using Okapi BM25 and 12D SVD Dense Indexer with RRF Reranker
        - Synthesize grounded answer with inline page and chunk citations
      On Breach:
        Escalate To: Head of Retail Compliance
      Exit Gateway (Lean 4 Spine Reference Monitor):
        If: all Binding Lean Contract rules hold
        Then: Emit Verified Answer and reach Milestone InquiryResolved
        Else: Halt loudly and Compensate via "Quarantine Unverified Output"

Deployment:
  Cloud: aws://me-central-1
  Residency: UAE
  Identity: [Microsoft Entra ID, UAE PASS]
  Data Governance: [Collibra, Unity Catalog]
  Audit: Immutable SHA-256 W3C PROV-O Ledger
`;

export const RETAIL_WIRE_AR = `# CaseSpine v5 — نفس البرنامج بالعربية، ويُترجم إلى نفس عقد Lean 4
الحالة: Retail Wire Policy Inquiry
الإصدار: "5.0"
نموذج الحل: KNOWLEDGE_SYNTHESIS_AND_RAG
مخرج الأعمال: Verified_Retail_Wire_Compliance_Answer
المعايير: [ISO-IEC-19510-BPMN2, OMG-CMMN-1.1, OMG-SBVR-1.5]

المسارات:
  مسؤول الامتثال في الفرع:
    مزود الدخول الموحد: UAE PASS
    التصريح: [RETAIL_WIRE_INQUIRY]
  رئيس امتثال الأفراد:
    مزود الدخول الموحد: Microsoft Entra ID
    الأدوار: [HITM_APPROVER]

ملف الحالة:
  سياسات التحويلات:
    المصدر: pdf("retail_wire_policy.pdf")
    عزل النطاق: صارم ("RetailWirePolicyInquiry")
    التنقيح: حجب [UAE_IBAN, EMIRATES_ID, EMAIL, PHONE_UAE] مع اتساق >= 0.85

العقد الملزم:
  حزم المبرهنات: [core.rag.grounding, isolation.non_interference]
  القواعد:
    - يجب أن تكون البيانات الشخصية محجوبة و اتساق المقاطع >= 0.85 قبل المعلم IndexReady.
    - يحظر أن تكون المتداخلات بين الحالات > 0.
    - يجب أن تكون تغطية الاستشهادات >= 90% والرموز المستهلكة <= 4000 قبل المعلم InquiryResolved.

ضوابط التكلفة والحركة:
  سقف الميزانية: 4000 رمز أو $0.10
  حد المعدل: 30 طلب/دقيقة لكل مسار
  المواضيع المحظورة: [investment advice, cryptocurrency speculation]
  سلم النماذج: [large, medium, small] عند بقاء الميزانية < 40%

مسار العملية:
  - المرحلة 1 (تنقيح ملف الحالة):
      عندما: يتم تحميل ملف الحالة
      الخطوات:
        - استخراج النصوص والجداول
        - حجب [UAE_IBAN, EMIRATES_ID]
      عند الخرق:
        التصعيد إلى: مسؤول الامتثال في الفرع
      بلوغ المعلم: IndexReady

  - المرحلة 2 (الإجابة على استفسار الموظف):
      عندما: بلوغ المعلم IndexReady
      الخطوات:
        - تقييم ضوابط التكلفة والحركة
        - استرجاع أفضل 3 مقاطع باستخدام BM25 و SVD مع RRF
        - توليف إجابة موثقة مع استشهادات
      عند الخرق:
        التصعيد إلى: رئيس امتثال الأفراد
      بوابة الخروج:
        إذا: تحققت جميع قواعد العقد الملزم
        فإن: إصدار إجابة موثقة وبلوغ المعلم InquiryResolved
        وإلا: إيقاف وتصعيد إلى رئيس امتثال الأفراد

النشر:
  السحابة: azure://uaenorth
  إقامة البيانات: UAE
  الهوية: [UAE PASS, Microsoft Entra ID]
`;

export const SOVEREIGN_GROUP = `# Three-level hierarchy: rules and theorem packs are inherited downwards.
Case: Demo Sovereign Financial Group
Version: "5.0"
Solution Archetype: KNOWLEDGE_SYNTHESIS_AND_RAG
Standards: [ISO-IEC-19510-BPMN2, OMG-CMMN-1.1, OMG-DMN-FEEL, OMG-SBVR-1.5, W3C-PROV-O, OpenLineage]

Lanes:
  Chief Risk & Sharia Architect:
    User: "Chief Risk Architect (demo)" <cra@demo-bank.example>
    SSO Provider: auto (Microsoft Entra ID on Windows, Keycloak OIDC on Linux/macOS)
    Roles: [CHIEF_RISK_ARCHITECT, SHARIA_BOARD_AUDITOR, HITM_APPROVER]
    Clearance: [GROUP_ROOT, CBUAE_TIER_3, AAOIFI_SS08]

Binding Lean Contract:
  Import Theorem Packs: [core.rag.grounding, isolation.non_interference]
  Rules (SBVR & FEEL Constrained English):
    - It is obligatory that PII is redacted for [UAE_IBAN, EMIRATES_ID, PASSPORT, EMAIL] and chunk coherence >= 0.85 before Milestone IndexReady.
    - It is prohibited that cross-case confounders > 0 across any Subcase.
    - It is obligatory that sum of Subcase budgets <= 25000 tokens and $2.50.

Cost & Traffic Guards:
  Budget Ceiling: 25000 tokens or $2.50
  Pre-Flight Gate: Loudly block stupid queries (lexical entropy < 0.65) and off-topic queries at 0 tokens.
  Adaptive Optimizer: Dynamically optimize (model tier, thinking effort, context compression, token appetite) under subcase budget constraints.

Actuators:
  Orchestrator: Apache Airflow (with OpenLineage facets and BPMN 2.0 XML export)
  Experiment & Lineage Tracker: MLflow Model Registry + Immutable SHA-256 W3C PROV-O Ledger
  Deployment Target: Kubernetes (KServe + Pod NetworkPolicy Isolation + Argo Rollouts)

Subcases:
  - Subcase: Islamic Corporate Treasury Division
    Population Segment: corporate_sharia_structuring
    Budget Ceiling: 15000 tokens or $1.50
    Binding Lean Contract:
      Import Theorem Packs: [cbuae.aml.v2, aaoifi.sharia.ss08]
      Rules (SBVR & FEEL Constrained English):
        - It is obligatory that sanctions feed staleness <= 4 hours and Reviewer 1 != Reviewer 2 before Milestone WireCleared.
        - It is obligatory that bank owns underlying asset (Qabd Hukmi) and debt to asset ratio <= 33.0% and counterfactual JSD <= 0.020 before Milestone MurabahaApproved.

    Subcases:
      - Subcase: VIP Commodity Murabaha & Sukuk Desk
        Population Segment: hnwi_vip_corporates
        Budget Ceiling: 6000 tokens or $0.60
        Rollout Strategy: canary_10pct_argo_rollouts
        Degradation Fallback: compress_context_50pct_then_local_sharia_lora

        Case File:
          Sharia & Supervisory Manuals:
            Source: pdf("sharia_murabaha_manual.pdf", "model_risk_guidelines.pdf")
            Namespace Isolation: strict ("DemoSovereignFinancialGroup/IslamicCorporateTreasuryDivision")
            Converters: [pdfplumber_layout, booktabs_table_extractor, openspg_kag_triple_extractor]
            Curation: redact [UAE_IBAN, EMIRATES_ID, PASSPORT, EMAIL] and require coherence >= 0.85

        AI Smart Suggestions (Local-First Discovery + Human-in-the-Middle):
          - Suggest vector_db: "Select high-assurance hybrid vector and graph store for Sharia Murabaha & AML PDFs; reuse healthy local deployment in namespace first" (Moderated by: Chief Risk & Sharia Architect)
          - Suggest domain_compliance_advice: "Assess whether Demo Industrial Holdings 36.4% debt-to-asset ratio is permissible under Policy SS-08" (Moderated by: Chief Risk & Sharia Architect)

        Process Flow:
          - Stage 1 (Curate & Isolate Multi-PDF Case File via LangGraph):
              When: Case File "Sharia & Supervisory Manuals" is loaded
              Steps:
                - Discover PDFs and verify W3C PROV-O source hashes
                - Reconstruct booktabs regulatory tables and OpenSPG triples via pdfplumber
                - Scrub [UAE_IBAN, EMIRATES_ID, PASSPORT, EMAIL] and strip any foreign confounders from Conventional Retail
              On Breach:
                Escalate To: Sharia & AML Steward Quarantine Queue
              Reach Milestone: IndexReady

          - Stage 2 (VIP Murabaha & Counterfactual Structuring via Hybrid RAG/KAG):
              When: Milestone IndexReady is achieved and Chief Risk & Sharia Architect submits Structuring Case
              Steps:
                - Execute Pre-Flight Cost & Traffic Guards and solve Constrained Optimizer for VIP SLA
                - Apply Moderated AI Smart Suggestions from Chief Risk & Sharia Architect
                - Retrieve top 4 chunks and tables via Hybrid BM25 + 12D SVD + RRF Reranker
                - Personalize output for population "hnwi_vip_corporates"
                - Run 4x Shadow Counterfactual Perturbations across [applicant_nationality, branch_emirate, signatory_gender]
              On Breach:
                Escalate To: Chief Risk & Sharia Architect
              Exit Gateway (Lean 4 Spine Reference Monitor):
                If: all inherited and local Binding Lean Contract rules hold
                Then: Emit Verified Structuring Ruling and reach Milestone MurabahaApproved
                Else: Halt loudly, block term-sheet issuance, and Compensate via "Log Immutable Audit Breach & Escalate to HSA Board"

  - Subcase: Conventional Retail Cards Division
    Population Segment: mass_retail_cards
    Budget Ceiling: 8000 tokens or $0.80
    Case File:
      Retail Card Disclosures:
        Source: pdf("card_disclosures.pdf")
        Namespace Isolation: strict ("DemoSovereignFinancialGroup/ConventionalRetailCardsDivision")
`;

export const COLD_CHAIN_MILP = `# Archetype 3 — the same language drives an optimisation workload, not RAG.
Case: Biologics Cold-Chain Fleet Dispatch
Version: "5.0"
Solution Archetype: QUANTITATIVE_OPTIMIZATION_AND_MILP
Business Deliverable: Verified_ColdChain_Fleet_Dispatch_Schedule
Engine: [ortools_milp://, sql_duckdb://, z3_smt_optimizer://]

Lanes:
  Logistics Control Tower:
    SSO Provider: Okta
    Roles: [DISPATCH_PLANNER]
  Pharmacovigilance Lead:
    SSO Provider: Okta
    Roles: [HITM_APPROVER]

Binding Lean Contract:
  Rules (SBVR & FEEL Constrained English):
    - It is obligatory that cold chain intact = true and fleet utilization >= 0.85 before Milestone ScheduleIssued.
    - It is obligatory that spoilage risk ratio <= 0.015 and p95 latency <= 900 ms before Milestone ScheduleIssued.
    - It is prohibited that reefer temperature excursions > 0.

Cost & Traffic Guards:
  Budget Ceiling: 12000 tokens or $1.20
  Rate Limit: 6 requests/minute per Lane
  Downscaling: scale solver pods to zero after 15 minutes idle

Process Flow:
  - Stage 1 (Build Dispatch Model):
      When: Nightly orders snapshot lands in the lakehouse
      Steps:
        - Load orders, reefer fleet and lane temperatures with SQL from DuckDB
        - Solve MILP dispatch with OR-Tools under capacity and temperature constraints
      Reach Milestone: ModelSolved

  - Stage 2 (Certify Schedule):
      When: Milestone ModelSolved is achieved
      Steps:
        - Execute parametric SQL cure solver to reallocate vials to reefer air cargo on breach
        - Publish ROI dashboard to Logistics Control Tower
      On Breach:
        Escalate To: Pharmacovigilance Lead
      Exit Gateway (Lean 4 Spine Reference Monitor):
        If: all Binding Lean Contract rules hold
        Then: Emit Verified Schedule and reach Milestone ScheduleIssued
        Else: Halt loudly and Compensate via "Hold Dispatch & Page Pharmacovigilance"

Deployment:
  Cloud: databricks://uaenorth
  Residency: UAE
  Data Governance: [Unity Catalog, Microsoft Purview]
`;

export const CODE_FORK_DEVOPS = `# Archetype 2 — CaseSpine governs an autonomous code-change pipeline.
Case: Core Banking API Hardening
Version: "5.0"
Solution Archetype: AUTONOMOUS_CODE_AND_DEVOPS_FORK
Business Deliverable: Signed_Canary_Release_And_GitFork_PR_Bundle
Engine: [git_fork_ast://, langgraph_swe://, semgrep_sast://, argo_rollouts://]

Lanes:
  Platform Engineering:
    SSO Provider: Keycloak OIDC
    Roles: [CODE_OWNER]
  Change Advisory Board:
    SSO Provider: Microsoft Entra ID
    Roles: [HITM_APPROVER]

Binding Lean Contract:
  Rules (SBVR & FEEL Constrained English):
    - It is obligatory that sast critical vulns <= 0 and regression failures <= 0 before Milestone ReleaseApproved.
    - It is obligatory that test coverage >= 95% before Milestone ReleaseApproved.
    - It is obligatory that reviewer 1 != reviewer 2 before Milestone ReleaseApproved.

Cost & Traffic Guards:
  Budget Ceiling: 60000 tokens or $6.00
  Model Ladder: [large, medium] when budget remaining < 30%

Process Flow:
  - Stage 1 (Fork & Patch):
      When: Security backlog item is labelled "autofix"
      Steps:
        - Fork repository and parse the AST of affected services
        - Draft patch with LangGraph software-engineering agent
        - Run Semgrep SAST and the full regression suite
        - Generate property-based Hypothesis tests until coverage target holds
      Reach Milestone: PatchReady

  - Stage 2 (Canary Release):
      When: Milestone PatchReady is achieved
      Steps:
        - Open pull request with signed provenance
        - Roll out 10% canary with Argo Rollouts
      On Breach:
        Escalate To: Change Advisory Board
      Exit Gateway (Lean 4 Spine Reference Monitor):
        If: all Binding Lean Contract rules hold
        Then: Promote canary and reach Milestone ReleaseApproved
        Else: Halt loudly and Compensate via "Automatic Rollback"

Deployment:
  Cloud: k8s://onprem-openshift
  Residency: UAE
  Identity: [Keycloak OIDC, Microsoft Entra ID]
`;

export interface ExampleDef {
  id: string;
  label: string;
  labelAr?: string;
  archetype: string;
  src: string;
}

export const EXAMPLES: ExampleDef[] = [
  { id: "retail-en", label: "Retail wire inquiry · RAG", archetype: "KNOWLEDGE_SYNTHESIS_AND_RAG", src: RETAIL_WIRE_EN },
  { id: "retail-ar", label: "استعلام التحويلات · عربي", archetype: "KNOWLEDGE_SYNTHESIS_AND_RAG", src: RETAIL_WIRE_AR },
  { id: "sovereign", label: "Sovereign group · 3-level hierarchy", archetype: "KNOWLEDGE_SYNTHESIS_AND_RAG", src: SOVEREIGN_GROUP },
  { id: "coldchain", label: "Cold-chain dispatch · MILP", archetype: "QUANTITATIVE_OPTIMIZATION_AND_MILP", src: COLD_CHAIN_MILP },
  { id: "devops", label: "API hardening · Code fork", archetype: "AUTONOMOUS_CODE_AND_DEVOPS_FORK", src: CODE_FORK_DEVOPS },
];
