// Plain words -> CaseSpine. A deterministic, in-browser drafter: it extracts
// the business slots (who asks, who decides, documents, personal data,
// budget, forbidden topics, value, latency, cloud), drafts the most plausible
// program, lists its assumptions and asks only about what is missing.

import { compileSpec } from "./analyze";
import { hasArabic } from "./arabic";

export interface Question {
  id: SlotId;
  q: string;
  options: string[];
}

export interface Draft {
  spec: string;
  name: string;
  archetype: string;
  assumptions: { label: string; value: string; detected: boolean }[];
  questions: Question[];
  tips: string[];
  completeness: number;
  compiles: boolean;
  rules: number;
}

export type SlotId = "users" | "approver" | "documents" | "budget" | "banned" | "value";

const AED_PER_USD = 3.6725;

const SMALL = new Set(["and", "or", "of", "the", "for", "to", "in", "on", "at", "by", "a", "an"]);
const title = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

const LEADING_VERBS = /^(?:(?:help|let|lets|allow|enable|for|so|ask|keep|make|give|want|need|our|my|the|all|to)\s+)+/i;

const ARCHETYPES: [RegExp, string][] = [
  [/\b(schedul|rout|dispatch|allocat|optimi[sz]|roster|shift plan|inventory|fleet|capacity)\w*/i, "QUANTITATIVE_OPTIMIZATION_AND_MILP"],
  [/\b(code|release|deploy|bug|vulnerab|pull request|repository|refactor)\w*/i, "AUTONOMOUS_CODE_AND_DEVOPS_FORK"],
  [/\b(settle|payment|claim|onboard|straight[- ]through|approval workflow|disburse)\w*/i, "TRANSACTIONAL_SAGA_AND_STRAIGHT_THROUGH_PROCESSING"],
  [/\b(experiment|uplift|a\/b|campaign|pricing fairness|causal)\w*/i, "CONTINUOUS_CAUSAL_AND_COUNTERFACTUAL_EXPERIMENTATION"],
  [/\b(sensor|iot|machine|turbine|plant|scada|telemetry)\w*/i, "PHYSICAL_IOT_DIGITAL_TWIN_AND_CONTROL_LOOP"],
  [/\b(pipeline|etl|data quality|lakehouse|tables?|warehouse|reconcil)\w*/i, "DATA_FOUNDRY_AND_MEDALLION_ETL_CURATION"],
  [/\b(supplier|vendor|negotiat|procure|tender|purchase order)\w*/i, "AGENTIC_B2B_NEGOTIATION_AND_PROCUREMENT"],
];

const ROLE_WORDS = "staff|officers?|agents?|team|teams|managers?|analysts?|employees|advisors?|tellers?|underwriters?|checkers?|clerks?|colleagues|users|customers|clients";

function detectUsers(t: string): string | null {
  const m =
    new RegExp(`\\b((?:[a-z]+[- ]){0,2}(?:${ROLE_WORDS}))\\b`, "i").exec(t.replace(/\b(our|my|the|all)\s+/gi, "")) ??
    /(?:for|let|lets|allow|help)\s+(?:our|my|the)?\s*([a-z][a-z -]{2,30}?)\s+(?:to\s|ask|query|find|check|answer)/i.exec(t);
  if (!m) {
    if (/موظف|الفروع/.test(t)) return "Branch Staff";
    return null;
  }
  const v = m[1].trim().replace(LEADING_VERBS, "");
  if (!v) return null;
  if (/^(users|customers|clients)$/i.test(v)) return "Customer Service Agents";
  return title(v);
}

function detectApprover(t: string): string | null {
  const pats = [
    /(?:escalat\w*|send\w*|rout\w*|go(?:es)?|forward\w*|hand\w* (?:it )?over)\s+(?:it\s+|them\s+)?to\s+(?:the\s+|our\s+|a\s+)?([a-z][a-z &-]{2,40}?)(?=[.,;!]|$|\s+(?:if|when|who|for|before|and)\b)/i,
    /(?:approved|checked|reviewed|signed off|validated|decided)\s+by\s+(?:the\s+|our\s+|a\s+)?([a-z][a-z &-]{2,40}?)(?=[.,;!]|$|\s+(?:if|when|before|and)\b)/i,
    /\b(head of [a-z ]{3,30}?|chief [a-z]+ officer|[a-z]+ manager|compliance officer|risk officer|team lead)\b/i,
  ];
  for (const p of pats) {
    const m = p.exec(t);
    if (m) return title(m[1].replace(/\s+(team)$/i, " $1"));
  }
  return null;
}

function detectDocuments(t: string): { name: string; files: string[] } | null {
  const files = [...t.matchAll(/\b[\w-]+\.(?:pdf|docx|xlsx|csv|txt|md)\b/gi)].map((m) => m[0]);
  const m = /(?:our|the|from|in|using|about)\s+((?:[a-z]+[- ]){0,3}?)(policies|policy|manuals?|procedures?|contracts?|circulars?|guidelines|documents|docs|faqs?|handbooks?|terms|rules|playbooks?|regulations)\b/i.exec(t);
  if (!m && !files.length) return null;
  const topic = m ? title(`${m[1] ?? ""}${m[2]}`) : "Documents";
  const slug = (m ? `${m[1] ?? ""}${m[2]}` : "documents").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return { name: topic, files: files.length ? files : [`${slug}.pdf`] };
}

function detectPII(t: string): string[] {
  const out = new Set<string>();
  if (/\biban|account number/i.test(t)) out.add("UAE_IBAN");
  if (/emirates id|national id|\beid\b|هوية/i.test(t)) out.add("EMIRATES_ID");
  if (/passport/i.test(t)) out.add("PASSPORT");
  if (/e-?mail/i.test(t)) out.add("EMAIL");
  if (/phone|mobile/i.test(t)) out.add("PHONE_UAE");
  if (/card number|\bpan\b|credit card/i.test(t)) out.add("CARD_PAN");
  if (/\btrn\b|tax (?:registration )?number/i.test(t)) out.add("TRN");
  if (!out.size && /personal|private|customer data|\bpii\b|confidential|sensitive|بيانات/i.test(t)) ["UAE_IBAN", "EMIRATES_ID", "EMAIL", "PHONE_UAE"].forEach((x) => out.add(x));
  return [...out];
}

function detectBudgetUsd(t: string): number | null {
  const m = /(\$|usd\s*|aed\s*)?(\d+(?:\.\d+)?)\s*(cents?|fils|dirhams?|aed|usd|\$)?\s*(?:per|a|an|each|for (?:each|one|every))\s*(?:single\s+)?(answer|question|query|request|case|inquiry|enquiry|reply|response|call|run|job|batch|schedule|transaction|document)/i.exec(t);
  if (!m) return null;
  const n = parseFloat(m[2]);
  const unit = ((m[3] ?? m[1]) || "$").trim().toLowerCase();
  if (unit.startsWith("cent")) return n / 100;
  if (unit === "fils") return n / 100 / AED_PER_USD;
  if (unit.startsWith("dirham") || unit === "aed") return n / AED_PER_USD;
  return n;
}

const NEG = /(?:never|don't|do not|must not|mustn't|shouldn't|should not)\s+/i;
const VERB = /^(?:ever\s+)?(?:give|provide|talk about|discuss|mention|answer|offer|share|reveal|make|promise|disclose|show)\s+/i;
const PII_WORDS = /iban|emirates id|passport|e-?mail|phone|mobile|card number|personal|account number|\bids?\b/i;

function detectBanned(t: string): string[] {
  const out: string[] = [];
  // Split into clauses at punctuation and at every new negation, so
  // "never reveal IBANs, never give legal advice" yields two clauses.
  for (const clause of t.split(/[.;!?]|,?\s*(?=\b(?:never|don't|do not|must not|mustn't|shouldn't|should not)\b)/i)) {
    const m = NEG.exec(clause);
    if (!m || m.index > 2) continue;
    const body = clause.slice(m.index + m[0].length).replace(/,?\s*\b(?:and\s+)?(?:keep|escalate|send|route|answers?|it must|but)\b.*$/i, "");
    for (const part of body.split(/\s*,\s*|\s+or\s+|\s+and\s+/i)) {
      const p = part.trim().toLowerCase().replace(VERB, "").replace(/^(any|about|on|questions about|answers? about)\s+/, "").trim();
      if (p && p.split(" ").length <= 4 && !/\d/.test(p) && !PII_WORDS.test(p) && !/^(more than|over|above|exceed|wait)/.test(p)) out.push(p);
    }
  }
  return [...new Set(out)].slice(0, 5);
}

function detectValueUsd(t: string): { usd: number; note: string } | null {
  const m = /(?:saves?|worth|value of|valued at|each (?:answer|case) saves?)\s+(?:about\s+|roughly\s+|around\s+)?(\$|aed\s*)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|dirhams?|aed|usd|\$)?/i.exec(t);
  if (!m) return null;
  const n = parseFloat(m[2]);
  const unit = ((m[3] ?? m[1]) || "$").trim().toLowerCase();
  if (unit.startsWith("min")) return { usd: +(n * 0.5).toFixed(2), note: `${n} minutes of staff time at ~$30/hour` };
  if (unit.startsWith("h")) return { usd: n * 30, note: `${n} hours of staff time at ~$30/hour` };
  if (unit.startsWith("dirham") || unit === "aed") return { usd: +(n / AED_PER_USD).toFixed(2), note: `AED ${n}` };
  return { usd: n, note: `$${n}` };
}

function detectLatencyMs(t: string): number | null {
  const m = /(?:within|under|in less than|faster than|below)\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|s\b|ms|milliseconds?)/i.exec(t);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return /^ms|milli/i.test(m[2]) ? Math.round(n) : Math.round(n * 1000);
}

function detectRate(t: string): string | null {
  const m = /(\d+)\s*(?:questions|requests|queries|calls)\s*(?:per|a|an|each)\s*(second|minute|hour|day)/i.exec(t);
  if (!m) return null;
  if (m[2].toLowerCase() === "day") return `${Math.max(1, Math.ceil(parseInt(m[1], 10) / 24))} requests/hour per Lane`;
  return `${m[1]} requests/${m[2].toLowerCase()} per Lane`;
}

function detectCloud(t: string): string | null {
  if (/azure|microsoft cloud/i.test(t)) return "azure://uaenorth";
  if (/\baws\b|amazon/i.test(t)) return "aws://me-central-1";
  if (/databricks/i.test(t)) return "databricks://uaenorth";
  if (/google|gcp|vertex/i.test(t)) return "gcp://me-central2";
  if (/core42|g42/i.test(t)) return "core42://sovereign";
  if (/on[- ]?prem|our (?:own )?data ?cent(?:er|re)|air[- ]?gapped/i.test(t)) return "k8s://onprem-openshift";
  return null;
}

const QUESTIONS: Record<SlotId, Question> = {
  users: { id: "users", q: "Who will ask the questions?", options: ["Branch Staff", "Customer Service Agents", "Relationship Managers", "Compliance Officers"] },
  approver: { id: "approver", q: "Who decides when the answer is uncertain?", options: ["Head of Compliance", "Branch Manager", "Risk Officer", "Team Lead"] },
  documents: { id: "documents", q: "Which documents should answers come from?", options: ["Product Policies", "Procedures Manual", "Regulatory Circulars", "Customer Contracts"] },
  budget: { id: "budget", q: "What may one answer cost at most?", options: ["$0.02", "$0.05", "$0.10", "$0.50"] },
  banned: { id: "banned", q: "Anything it must never talk about?", options: ["investment advice", "legal advice", "pricing promises", "nothing specific"] },
  value: { id: "value", q: "Roughly what is one resolved question worth?", options: ["$1", "$3.50", "$10", "$50"] },
};

export const EXAMPLE_DESCRIPTIONS = [
  "Our branch staff keep asking Compliance about card dispute rules. Let them ask an assistant using our card dispute procedures. Never reveal IBANs or Emirates IDs, never give legal advice, keep it under 5 cents per answer, and escalate to the Head of Card Operations when unsure. Each answer saves about 10 minutes.",
  "Help our relationship managers check if a corporate client can get Murabaha financing, based on our Sharia manual and credit policy. Answers must be reviewed by the Chief Risk Officer, cost at most 20 cents per question and come back within 3 seconds. Runs on Azure.",
  "Optimise the daily dispatch schedule for our delivery fleet so vans are at least 85% utilised. Escalate to the Logistics Manager if a schedule breaks a rule, at most 1 dirham per run.",
];

export function draftFromDescription(text: string, answers: Partial<Record<SlotId, string>> = {}): Draft {
  const t = text.trim();
  const ar = hasArabic(t);
  const archetype = ARCHETYPES.find(([re]) => re.test(t))?.[1] ?? "KNOWLEDGE_SYNTHESIS_AND_RAG";
  const rag = archetype === "KNOWLEDGE_SYNTHESIS_AND_RAG";

  const approverD = detectApprover(t);
  const usersD = detectUsers(approverD ? t.replace(new RegExp(approverD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "") : t);
  const docsD = detectDocuments(t);
  const budgetD = detectBudgetUsd(t);
  const bannedD = detectBanned(t);
  const valueD = detectValueUsd(t);
  const pii = detectPII(t);
  const latency = detectLatencyMs(t);
  const rate = detectRate(t);
  const cloud = detectCloud(t);
  const sharia = /sharia|shariah|murabaha|islamic|sukuk|ijara|الشريعة|مرابحة/i.test(t);
  const aml = /\baml\b|sanction|money laundering|kyc|screening/i.test(t);
  const fairness = /fair|bias|discriminat|nationality|gender/i.test(t);

  const defaultUsers = rag ? "Branch Staff" : archetype.startsWith("QUANT") ? "Operations Planners" : archetype.startsWith("AUTONOMOUS") ? "Platform Engineering" : "Operations Team";
  const users = answers.users ?? usersD ?? defaultUsers;
  let approver = answers.approver ?? approverD ?? "Head of Compliance";
  if (approver === users) approver = "Head of Compliance";
  const docs = answers.documents ? { name: answers.documents, files: [answers.documents.toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".pdf"] } : docsD ?? { name: "Policies", files: ["policies.pdf"] };
  const budget = answers.budget ? parseFloat(answers.budget.replace(/[^0-9.]/g, "")) : budgetD ?? 0.1;
  const banned = answers.banned ? (answers.banned === "nothing specific" ? [] : [answers.banned]) : bannedD.length ? bannedD : ["investment advice"];
  const value = answers.value ? { usd: parseFloat(answers.value.replace(/[^0-9.]/g, "")), note: answers.value } : valueD ?? { usd: 3.5, note: "default" };

  const noun = rag ? "Assistant" : archetype.startsWith("QUANT") ? "Optimiser" : archetype.startsWith("AUTONOMOUS") ? "Autofix" : "Process";
  const name = title(`${docs.name.replace(/\b(Policies|Policy|Documents|Docs)\b/i, "").trim() || users} ${noun}`).replace(/\s+/g, " ");
  const tokens = Math.max(1000, Math.round((budget * 40000) / 500) * 500);
  const ms = rag ? "InquiryResolved" : "CaseResolved";
  const piiList = pii.length ? pii : ["UAE_IBAN", "EMIRATES_ID"];

  const rules = [
    `- It is obligatory that PII is redacted for [${piiList.join(", ")}] and chunk coherence >= 0.85 before Milestone IndexReady.`,
    rag ? `- It is obligatory that citation coverage >= 90% and cost per query <= $${budget.toFixed(2)} before Milestone ${ms}.` : `- It is obligatory that cost per query <= $${budget.toFixed(2)} before Milestone ${ms}.`,
    "- It is prohibited that cross-case confounders > 0 in Case File.",
  ];
  if (latency) rules.push(`- It is obligatory that p95 latency <= ${latency} ms before Milestone ${ms}.`);
  if (sharia) rules.push(`- It is obligatory that bank owns underlying asset (Qabd Hukmi) and debt to asset ratio <= 33.0% before Milestone ${ms}.`);
  if (aml) rules.push(`- It is obligatory that sanctions feed staleness <= 4 hours and Reviewer 1 != Reviewer 2 before Milestone ${ms}.`);
  if (fairness) rules.push(`- It is obligatory that counterfactual JSD <= 0.020 before Milestone ${ms}.`);
  if (archetype.startsWith("QUANT")) rules.push(`- It is obligatory that fleet utilization >= 0.85 before Milestone ${ms}.`);

  const steps = rag
    ? [
        "Evaluate Cost & Traffic Guards on Inquiry",
        "Retrieve top 3 chunks using Okapi BM25 and 12D SVD Dense Indexer with RRF Reranker",
        "Synthesize grounded answer with inline page and chunk citations",
      ]
    : archetype.startsWith("QUANT")
      ? ["Load orders and capacity with SQL from DuckDB", "Solve MILP allocation with OR-Tools under capacity constraints", `Publish ROI dashboard to ${users}`]
      : archetype.startsWith("AUTONOMOUS")
        ? ["Fork repository and parse the AST of affected services", "Draft patch with LangGraph software-engineering agent", "Run Semgrep SAST and the full regression suite"]
        : ["Evaluate Cost & Traffic Guards on Inquiry", "Run existing script process_case.py to apply the business rules", `Publish ROI dashboard to ${users}`];
  if (fairness) steps.push("Run 4x Shadow Counterfactual Perturbations across [nationality, gender]");

  const theorem = ["core.rag.grounding", "isolation.non_interference", ...(sharia ? ["aaoifi.sharia.ss08"] : []), ...(aml ? ["cbuae.aml.v2"] : []), "uae.pdpl.minimisation"];
  const spec = `# Drafted by CaseSpine Copilot from your description — review the assumptions, then compile.
Case: ${name}
Version: "5.0"
Solution Archetype: ${archetype}
Business Deliverable: Verified_${name.replace(/[^A-Za-z0-9]+/g, "_")}_Answer

Lanes:
  ${users}:
    SSO Provider: Microsoft Entra ID
  ${approver}:
    SSO Provider: Microsoft Entra ID
    Roles: [HITM_APPROVER]

Case File:
  ${docs.name}:
    Source: pdf(${docs.files.map((f) => `"${f}"`).join(", ")})
    Namespace Isolation: strict ("${name.replace(/[^A-Za-z0-9]+/g, "")}")
    Converters: [pdfplumber_layout, booktabs_table_extractor]
    Curation: redact [${piiList.join(", ")}] and require coherence >= 0.85

Binding Lean Contract:
  Import Theorem Packs: [${theorem.join(", ")}]
  Rules (SBVR & FEEL Constrained English):
${rules.map((r) => "    " + r).join("\n")}

Cost & Traffic Guards:
  Budget Ceiling: ${tokens} tokens or $${budget.toFixed(2)}
  Pre-Flight Gate: Loudly block stupid queries (lexical entropy < 0.65) and off-topic queries at 0 tokens.
${rate ? `  Rate Limit: ${rate}\n` : ""}${banned.length ? `  Banned Topics: [${banned.join(", ")}]\n` : ""}  Model Ladder: [large, medium, small] when budget remaining < 40%
  Value Per Outcome: $${value.usd.toFixed(2)} per resolved inquiry
  Target ROI: 4.0x

Config:
  Retriever: { Mode: hybrid, Top K: 3 }
  Synthesizer: { Model: auto, Max Sentences: 3, Language: ${ar ? "ar" : "auto"} }
  Exit Gateway: { Fail Mode: fail-closed }
  Escalation: { Channel: teams, SLA Hours: 4 }

Process Flow:
  - Stage 1 (Curate ${docs.name}):
      When: Case File "${docs.name}" is loaded
      Steps:
        - Extract prose sections and reconstruct booktabs tables
        - Scrub [${piiList.join(", ")}] and strip any foreign namespace confounders
      Reach Milestone: IndexReady

  - Stage 2 (${rag ? "Answer" : "Decide"}):
      When: Milestone IndexReady is achieved and ${users} submits a request
      Steps:
${steps.map((s) => "        - " + s).join("\n")}
      On Breach:
        Escalate To: ${approver}
      Exit Gateway (Lean 4 Spine Reference Monitor):
        If: all Binding Lean Contract rules hold
        Then: Emit Verified Answer and reach Milestone ${ms}
        Else: Halt loudly and Compensate via "Quarantine Output"

Deployment:
  Cloud: ${cloud ?? "azure://uaenorth"}
  Residency: UAE
  Identity: [Microsoft Entra ID, UAE PASS]
`;

  const detected: Record<SlotId, boolean> = {
    users: !!usersD || !!answers.users,
    approver: !!approverD || !!answers.approver,
    documents: !!docsD || !!answers.documents,
    budget: budgetD !== null || !!answers.budget,
    banned: bannedD.length > 0 || !!answers.banned,
    value: !!valueD || !!answers.value,
  };
  const assumptions = [
    { label: "Type of solution", value: archetype.replace(/_/g, " ").toLowerCase(), detected: archetype !== "KNOWLEDGE_SYNTHESIS_AND_RAG" || /question|ask|answer|policy|document/i.test(t) },
    { label: "Who asks", value: users, detected: detected.users },
    { label: "Who decides when unsure", value: approver, detected: detected.approver },
    { label: "Documents", value: `${docs.name} (${docs.files.join(", ")})`, detected: detected.documents },
    { label: "Personal data redacted", value: piiList.join(", "), detected: pii.length > 0 },
    { label: "Max cost per answer", value: `$${budget.toFixed(3)}${budgetD !== null && !/\$|usd/i.test(t) ? " (converted)" : ""}`, detected: detected.budget },
    { label: "Never discuss", value: banned.join(", ") || "—", detected: detected.banned },
    { label: "Value per resolved case", value: `$${value.usd.toFixed(2)}${valueD ? ` (${valueD.note})` : ""}`, detected: detected.value },
    ...(latency ? [{ label: "Response time", value: `≤ ${latency} ms`, detected: true }] : []),
    ...(cloud ? [{ label: "Cloud", value: cloud, detected: true }] : []),
    ...(sharia ? [{ label: "Sharia rules", value: "ownership before sale, debt ratio ≤ 33%", detected: true }] : []),
    ...(aml ? [{ label: "AML controls", value: "fresh sanctions list, four-eyes review", detected: true }] : []),
  ];
  const questions = (Object.keys(detected) as SlotId[]).filter((k) => !detected[k]).map((k) => QUESTIONS[k]);
  const completeness = Object.values(detected).filter(Boolean).length / Object.keys(detected).length;
  const tips: string[] = [];
  if (t.split(/\s+/).length < 8) tips.push("Your description is very short. Describe the problem as you would to a new colleague.");
  if (!detected.users) tips.push("Say who will use it — e.g. “for our branch staff”.");
  if (!detected.documents) tips.push("Name the documents — e.g. “using our card dispute procedures”.");
  if (!detected.budget) tips.push("Set a hard limit — e.g. “at most 5 cents per answer”.");
  if (!detected.banned) tips.push("Say what must never happen — e.g. “never give investment advice”.");
  if (!detected.approver) tips.push("Say who decides when unsure — e.g. “escalate to the Head of Compliance”.");

  const r = compileSpec(spec);
  return {
    spec,
    name,
    archetype,
    assumptions,
    questions,
    tips: completeness < 0.5 ? tips : tips.slice(0, 2),
    completeness,
    compiles: !!r.root && !r.diagnostics.some((d) => d.severity === "error"),
    rules: r.root?.rules.length ?? 0,
  };
}
