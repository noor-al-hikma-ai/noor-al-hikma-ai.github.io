// CaseSpine v5 — intermediate representation shared by the compiler, the
// Studio (editor + visual canvas), the emitters and the RAG sandbox runtime.

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  line: number; // 1-based
  severity: Severity;
  message: string;
}

export type Op = ">=" | "<=" | ">" | "<" | "=" | "!=";

/** One atomic, decidable predicate over the runtime case state. */
export interface Clause {
  field: string;
  type: "Nat" | "Bool";
  op: Op;
  value: number | boolean;
  /** Field-to-field comparison, e.g. reviewer1Id != reviewer2Id. */
  rhsField?: string;
  unit?: string;
  source: string;
  scope?: string;
}

export type Modality = "OBLIGATORY" | "PROHIBITED" | "PERMITTED";

export interface CompiledRule {
  id: string;
  raw: string;
  line: number;
  modality: Modality;
  milestone: string;
  clauses: Clause[];
  /** PROHIBITED with several clauses compiles to ¬(c1 ∧ c2 …). */
  negated: boolean;
  recognized: boolean;
  lean: string;
  smt2: string;
  python: string;
  owner: string;
  inherited: boolean;
  entities: string[];
}

export interface Lane {
  name: string;
  line: number;
  sso?: string;
  user?: string;
  roles: string[];
  clearance: string[];
}

export interface CaseFile {
  name: string;
  line: number;
  endLine: number;
  sources: string[];
  namespace?: string;
  converters: string[];
  redact: string[];
  coherence?: number;
  lines: Record<string, number>;
}

export interface Guards {
  budgetTokens: number;
  budgetUsd: number;
  preflight?: { entropy: number; offTopic: boolean; line: number };
  optimizer?: { text: string; line: number };
  rateLimit?: { n: number; per: "second" | "minute" | "hour"; scope: string; line: number };
  allowedTopics: string[];
  bannedTopics: string[];
  modelLadder?: { tiers: string[]; threshold?: number; line: number };
  downscaling?: { text: string; line: number };
  semanticCache?: { similarity: number; line: number };
  valuePerOutcomeUsd?: number;
  targetRoi?: number;
  rollout?: string;
  fallback?: string;
  lines: Record<string, number>;
  sectionLine?: number;
}

export interface Step {
  text: string;
  /** Normalised (English) text used for engine detection. */
  norm: string;
  line: number;
}

export interface Stage {
  idx: number;
  name: string;
  line: number;
  endLine: number;
  when: string;
  steps: Step[];
  escalateTo?: string;
  escalateLine?: number;
  milestone: string;
  milestoneLine?: number;
  gate?: { ifText: string; thenText: string; elseText: string; line: number; endLine: number };
  engine?: string;
  stepsLine?: number;
}

export interface Suggestion {
  kind: string;
  text: string;
  moderator: string;
  line: number;
}

export interface CaseAST {
  kind: "Case" | "Subcase";
  name: string;
  line: number;
  endLine: number;
  version: string;
  standards: string[];
  archetype?: string;
  deliverable?: string;
  engines: string[];
  population: string;
  namespacePath: string;
  isolationHash: string;
  lanes: Lane[];
  caseFiles: CaseFile[];
  theoremPacks: string[];
  rules: CompiledRule[];
  rulesLine?: number;
  contractLine?: number;
  suggestions: Suggestion[];
  guards: Guards;
  stages: Stage[];
  processFlowLine?: number;
  actuators: Record<string, string>;
  deployment: Record<string, string>;
  constraints: { facet: string; text: string; line: number }[];
  subcases: CaseAST[];
  depth: number;
  parentPath?: string;
  /** Satisfiability witness for the full (inherited + local) contract. */
  witness?: Record<string, number | boolean>;
  satisfiable: boolean;
}

export interface CompileResult {
  root: CaseAST | null;
  cases: CaseAST[];
  diagnostics: Diagnostic[];
  language: "en" | "ar";
  normalized: string;
  fields: Map<string, "Nat" | "Bool">;
  ms: number;
}
