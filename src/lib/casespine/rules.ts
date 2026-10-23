// OMG SBVR / DMN-FEEL constrained English  ->  decidable clauses  ->  Lean 4,
// Z3 SMT-LIB v2 and Python predicates. Generalises the rule templates of
// casespine_process_compiler.py: any "<metric> <op> <quantity>" phrase becomes a
// typed clause, so business owners can introduce new invariants without code.

import type { Clause, CompiledRule, Modality, Op } from "./types";

interface Alias {
  field: string;
  /** Do not append a unit suffix (the alias already names its unit). */
  fixed?: boolean;
}

// Canonical field names kept compatible with the v3 Python compiler.
const ALIASES: [RegExp, Alias][] = [
  [/^(?:the )?pii(?: data)? (?:is |are )?redacted/, { field: "piiRedacted", fixed: true }],
  [/^(?:chunk )?coherence(?: score)?$/, { field: "coherence" }],
  [/^cross[- ]case confounders?(?: count)?$/, { field: "crossCaseConfoundersCount", fixed: true }],
  [/^citation coverage$/, { field: "citationCoverage" }],
  [/^tokens? consumed$/, { field: "tokensConsumed", fixed: true }],
  [/^sum of subcase budgets$/, { field: "subcaseBudgetSum" }],
  [/^sanctions(?: feed)? staleness$/, { field: "sanctionsStaleness" }],
  [/^debt[- ]to[- ]asset ratio$/, { field: "debtToAsset" }],
  [/^counterfactual jsd$/, { field: "counterfactualJsd" }],
  [/^reviewer 1$/, { field: "reviewer1Id", fixed: true }],
  [/^reviewer 2$/, { field: "reviewer2Id", fixed: true }],
  [/^bank owns(?: the)? underlying asset/, { field: "bankOwnsAsset", fixed: true }],
  [/^(?:p95 latency|latency p95)$/, { field: "p95Latency" }],
  [/^cost per (?:query|request|inquiry)$/, { field: "costPerQuery" }],
  [/^test coverage$/, { field: "testCoverage" }],
];

const WORD_OPS: [RegExp, Op][] = [
  [/\bis at least\b|\bat least\b|\bno less than\b|\bnot less than\b/i, ">="],
  [/\bis at most\b|\bat most\b|\bno more than\b|\bnot more than\b|\bdoes not exceed\b|\bnot exceeding\b/i, "<="],
  [/\bis greater than\b|\bmore than\b|\bexceeds\b|\bgreater than\b/i, ">"],
  [/\bis less than\b|\bless than\b|\bbelow\b/i, "<"],
  [/\bis equal to\b|\bequals\b/i, "="],
  [/\bis different from\b|\bdiffers from\b/i, "!="],
];

const SYMBOL_OPS: Record<string, Op> = {
  ">=": ">=", "≥": ">=", "<=": "<=", "≤": "<=", ">": ">", "<": "<",
  "==": "=", "=": "=", "!=": "!=", "≠": "!=",
};

const FLIP: Record<Op, Op> = { ">=": "<", "<=": ">", ">": "<=", "<": ">=", "=": "!=", "!=": "=" };

export function camel(phrase: string): string {
  const words = phrase
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^(the|a|an)$/i.test(w));
  if (!words.length) return "";
  const s = words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
  return /^[A-Za-z]/.test(s) ? s : "m" + s;
}

interface Quantity {
  value: number;
  suffix: string; // field suffix e.g. "Millipoints"
  unit: string;
  scope?: string;
}

export function parseQuantity(raw: string): Quantity | null {
  const s = raw.trim().replace(/\.$/, "");
  const m = /^(\$|AED\s*)?\s*(-?\d+(?:\.\d+)?)\s*(%|percent\b|tokens?\b|hours?\b|hrs?\b|h\b|minutes?\b|mins?\b|seconds?\b|secs?\b|s\b|ms\b|milliseconds?\b|days?\b|usd\b|aed\b|dirhams?\b|x\b|units?\b)?(.*)$/i.exec(s);
  if (!m) return null;
  const cur = (m[1] ?? "").trim().toUpperCase();
  const num = parseFloat(m[2]);
  const unit = (m[3] ?? "").toLowerCase();
  const scope = m[4].trim() || undefined;
  if (cur === "$" || unit === "usd") return { value: Math.round(num * 100), suffix: "Cents", unit: "cents", scope };
  if (cur === "AED" || unit === "aed" || unit.startsWith("dirham")) return { value: Math.round(num * 100), suffix: "Fils", unit: "fils", scope };
  if (unit === "%" || unit === "percent") return { value: Math.round(num * 10), suffix: "Millipoints", unit: "millipoints", scope };
  if (unit.startsWith("token")) return { value: Math.round(num), suffix: "Tokens", unit: "tokens", scope };
  if (/^(hours?|hrs?|h)$/.test(unit)) return { value: Math.round(num), suffix: "Hours", unit: "hours", scope };
  if (/^(minutes?|mins?)$/.test(unit)) return { value: Math.round(num), suffix: "Minutes", unit: "minutes", scope };
  if (/^(ms|milliseconds?)$/.test(unit)) return { value: Math.round(num), suffix: "Ms", unit: "ms", scope };
  if (/^(seconds?|secs?|s)$/.test(unit)) return { value: Math.round(num * 1000), suffix: "Ms", unit: "ms", scope };
  if (/^days?$/.test(unit)) return { value: Math.round(num), suffix: "Days", unit: "days", scope };
  if (unit === "x") return { value: Math.round(num * 1000), suffix: "Millipoints", unit: "millipoints", scope };
  if (m[2].includes(".")) return { value: Math.round(num * 1000), suffix: "Millipoints", unit: "millipoints", scope };
  return { value: Math.round(num), suffix: "", unit: unit || "count", scope };
}

function resolveField(subject: string, suffix: string): { field: string; fixed: boolean } {
  const s = subject.toLowerCase().replace(/\s+/g, " ").trim();
  for (const [re, a] of ALIASES) {
    if (re.test(s)) {
      const fixed = !!a.fixed;
      const field = fixed || !suffix || a.field.toLowerCase().endsWith(suffix.toLowerCase()) ? a.field : a.field + suffix;
      return { field, fixed };
    }
  }
  const base = camel(subject);
  if (!base) return { field: "", fixed: false };
  if (suffix && !base.toLowerCase().endsWith(suffix.toLowerCase())) return { field: base + suffix, fixed: false };
  return { field: base, fixed: false };
}

function splitConjuncts(body: string): string[] {
  // Protect commas/and inside [...] entity lists.
  const protectedBody = body.replace(/\[[^\]]*\]/g, (m) => m.replace(/ and /gi, " & "));
  return protectedBody
    .split(/\s+and\s+|\s*;\s*|\s+∧\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseClause(part: string, prev: Clause | null): Clause | null {
  let p = part.replace(/\.$/, "").trim();
  for (const [re, op] of WORD_OPS) {
    if (re.test(p)) {
      p = p.replace(re, ` ${op} `);
      break;
    }
  }
  const cm = /^(.*?)\s*(>=|<=|!=|==|≥|≤|≠|=|>|<)\s*(.+)$/.exec(p);
  if (cm) {
    const subject = cm[1].trim();
    const op = SYMBOL_OPS[cm[2]];
    const rhs = cm[3].trim();
    const q = parseQuantity(rhs);
    if (!subject && prev && q) {
      return { ...prev, op, value: q.value, source: part, unit: q.unit, scope: q.scope };
    }
    if (q) {
      const { field } = resolveField(subject, q.suffix);
      if (!field) return null;
      return { field, type: "Nat", op, value: q.value, unit: q.unit, source: part, scope: q.scope };
    }
    if (/^(true|false|yes|no)$/i.test(rhs)) {
      const { field } = resolveField(subject, "");
      return { field, type: "Bool", op: op === "!=" ? "!=" : "=", value: /^(true|yes)$/i.test(rhs), source: part };
    }
    // field-to-field comparison
    const l = resolveField(subject, "");
    const r = resolveField(rhs, "");
    if (l.field && r.field) return { field: l.field, type: "Nat", op, value: 0, rhsField: r.field, source: part };
    return null;
  }
  // Dangling quantity: "... <= 25000 tokens and $2.50"
  const dq = parseQuantity(p);
  if (dq && prev && dq.scope === undefined) {
    const baseSubject = prev.field.replace(/(Tokens|Cents|Fils|Millipoints|Hours|Minutes|Ms|Days)$/, "");
    return { ...prev, field: baseSubject + dq.suffix, value: dq.value, unit: dq.unit, source: part };
  }
  // Boolean predicate: "PII is redacted for [...]", "bank owns underlying asset (Qabd Hukmi)"
  const neg = /\b(?:is|are) not\b|\bnot\b/i.test(p);
  const cleaned = p.replace(/\bfor\s*\[[^\]]*\]/i, "").replace(/\b(is|are|has been|have been|not)\b/gi, " ");
  const words = cleaned.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 1 && words.length <= 7 && !/\d/.test(cleaned.replace(/\(.*?\)/g, ""))) {
    const { field } = resolveField(p.replace(/\bnot\b/gi, "").replace(/\s+/g, " "), "");
    const fieldName = field || camel(cleaned);
    if (!fieldName) return null;
    return { field: fieldName, type: "Bool", op: "=", value: !neg, source: part };
  }
  return null;
}

function leanClause(c: Clause): string {
  const opMap: Record<Op, string> = { ">=": "≥", "<=": "≤", ">": ">", "<": "<", "=": "=", "!=": "≠" };
  if (c.rhsField) return `s.${c.field} ${opMap[c.op]} s.${c.rhsField}`;
  if (c.type === "Bool") return `s.${c.field} ${c.op === "!=" ? "≠" : "="} ${c.value}`;
  return `s.${c.field} ${opMap[c.op]} ${c.value}`;
}

function smtClause(c: Clause): string {
  if (c.rhsField) {
    if (c.op === "!=") return `(distinct ${c.field} ${c.rhsField})`;
    return `(${c.op} ${c.field} ${c.rhsField})`;
  }
  if (c.type === "Bool") {
    const positive = (c.op === "=") === (c.value === true);
    return positive ? c.field : `(not ${c.field})`;
  }
  if (c.op === "!=") return `(not (= ${c.field} ${c.value}))`;
  return `(${c.op} ${c.field} ${c.value})`;
}

function pyClause(c: Clause): string {
  const op = c.op === "=" ? "==" : c.op;
  if (c.rhsField) return `s["${c.field}"] ${op} s["${c.rhsField}"]`;
  if (c.type === "Bool") return `s["${c.field}"] ${op} ${c.value ? "True" : "False"}`;
  return `s["${c.field}"] ${op} ${c.value}`;
}

export function compileRule(raw: string, line: number, idx: number, owner: string): CompiledRule {
  const clean = raw.trim().replace(/^-\s*/, "").trim();
  let modality: Modality = "OBLIGATORY";
  let body = clean;
  const mm = /^it is (obligatory|prohibited|permitted|necessary|forbidden|required) that\s+/i.exec(clean);
  if (mm) {
    const w = mm[1].toLowerCase();
    modality = w === "prohibited" || w === "forbidden" ? "PROHIBITED" : w === "permitted" ? "PERMITTED" : "OBLIGATORY";
    body = clean.slice(mm[0].length);
  }
  const ms = /\s*before\s+milestone\s+(\w+)\.?\s*$/i.exec(body);
  const milestone = ms ? ms[1] : "StageExit";
  if (ms) body = body.slice(0, ms.index);
  body = body.replace(/\.$/, "");

  const entities = (/\[([^\]]+)\]/.exec(body)?.[1] ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[A-Z0-9_]+$/.test(x));

  const clauses: Clause[] = [];
  let recognized = true;
  let prev: Clause | null = null;
  for (const part of splitConjuncts(body)) {
    const c = parseClause(part, prev);
    if (!c) {
      recognized = false;
      continue;
    }
    clauses.push(c);
    prev = c;
  }
  if (!clauses.length) recognized = false;

  let negated = false;
  let effective = clauses;
  if (modality === "PROHIBITED") {
    if (clauses.length === 1) {
      const c = clauses[0];
      effective = [c.type === "Bool" && !c.rhsField ? { ...c, value: !(c.value as boolean) } : { ...c, op: FLIP[c.op] }];
    } else if (clauses.length > 1) {
      negated = true;
    }
  }
  if (modality === "PERMITTED") effective = [];

  const conj = (parts: string[], sep: string, empty: string) => (parts.length ? parts.join(sep) : empty);
  let lean = conj(effective.map(leanClause), " ∧ ", "True");
  let smt2 = effective.length > 1 ? `(and ${effective.map(smtClause).join(" ")})` : effective.length ? smtClause(effective[0]) : "true";
  let python = conj(effective.map(pyClause), " and ", "True");
  if (negated) {
    lean = `¬ (${lean})`;
    smt2 = `(not ${smt2})`;
    python = `not (${python})`;
  } else if (effective.length > 1) {
    lean = `(${lean})`;
    python = `(${python})`;
  }

  return {
    id: `R${idx}`,
    raw: clean,
    line,
    modality,
    milestone,
    clauses: effective,
    negated,
    recognized: recognized && (modality !== "PERMITTED" || clauses.length > 0),
    lean,
    smt2,
    python,
    owner,
    inherited: false,
    entities,
  };
}

/** Evaluate a compiled rule against a runtime state. `undefined` = unbound probe. */
export function evalClause(c: Clause, s: Record<string, number | boolean | undefined>): boolean | undefined {
  const l = s[c.field];
  const r = c.rhsField ? s[c.rhsField] : c.value;
  if (l === undefined || r === undefined) return undefined;
  switch (c.op) {
    case ">=": return (l as number) >= (r as number);
    case "<=": return (l as number) <= (r as number);
    case ">": return (l as number) > (r as number);
    case "<": return (l as number) < (r as number);
    case "=": return l === r;
    case "!=": return l !== r;
  }
}

export function evalRule(rule: CompiledRule, s: Record<string, number | boolean | undefined>): boolean | undefined {
  if (!rule.clauses.length) return true;
  const vals = rule.clauses.map((c) => evalClause(c, s));
  if (rule.negated) {
    if (vals.some((v) => v === false)) return true;
    if (vals.some((v) => v === undefined)) return undefined;
    return false;
  }
  if (vals.some((v) => v === false)) return false;
  if (vals.some((v) => v === undefined)) return undefined;
  return true;
}

export function clauseText(c: Clause): string {
  const opMap: Record<Op, string> = { ">=": "≥", "<=": "≤", ">": ">", "<": "<", "=": "=", "!=": "≠" };
  if (c.rhsField) return `${c.field} ${opMap[c.op]} ${c.rhsField}`;
  return `${c.field} ${opMap[c.op]} ${c.value}`;
}
