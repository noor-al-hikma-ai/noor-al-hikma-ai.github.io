// Semantic pass: indentation tree -> hierarchical CaseAST with inherited
// contracts, guards, lanes, stages and a satisfiability witness per case.

import { sha256Hex } from "../sha256";
import { hasArabic, normalizeArabic } from "./arabic";
import { compileRule } from "./rules";
import { componentSpec, fieldSpec, normName, parseInlineMap, validateField } from "./configSchema";
import { buildTree, normKey, parseList, unquote, type SpecNode } from "./tree";
import type { CaseAST, CaseFile, Clause, CompileResult, CompiledRule, Diagnostic, Guards, Lane, Stage } from "./types";

const KNOWN_KEYS = new Set([
  "case", "subcase", "version", "standards", "solution archetype", "business deliverable", "engine", "engines",
  "population segment", "lanes", "case file", "binding lean contract", "cost & traffic guards", "budget ceiling",
  "process flow", "subcases", "actuators", "deployment", "business & product constraints", "ai smart suggestions",
  "rollout strategy", "degradation fallback", "config",
]);

export const ARCHETYPES = [
  "KNOWLEDGE_SYNTHESIS_AND_RAG",
  "AUTONOMOUS_CODE_AND_DEVOPS_FORK",
  "QUANTITATIVE_OPTIMIZATION_AND_MILP",
  "TRANSACTIONAL_SAGA_AND_STRAIGHT_THROUGH_PROCESSING",
  "CONTINUOUS_CAUSAL_AND_COUNTERFACTUAL_EXPERIMENTATION",
  "PHYSICAL_IOT_DIGITAL_TWIN_AND_CONTROL_LOOP",
  "DATA_FOUNDRY_AND_MEDALLION_ETL_CURATION",
  "AGENTIC_B2B_NEGOTIATION_AND_PROCUREMENT",
];

function slugify(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, "") || "Case" + sha256Hex(name).slice(0, 6);
}

function emptyGuards(): Guards {
  return { budgetTokens: 10000, budgetUsd: 1, allowedTopics: [], bannedTopics: [], lines: {} };
}

function parseBudget(v: string, g: Guards, line: number, diags: Diagnostic[]) {
  const m = /(\d[\d,]*)\s*tokens?(?:\s*(?:or|and|\/)\s*\$\s*([0-9.]+))?/i.exec(v);
  if (m) {
    g.budgetTokens = parseInt(m[1].replace(/,/g, ""), 10);
    if (m[2]) g.budgetUsd = parseFloat(m[2]);
  } else {
    diags.push({ line, severity: "warning", message: "Budget Ceiling not understood. Use e.g. `4000 tokens or $0.10`." });
  }
  g.lines.budget = line;
}

function readGuards(nodes: SpecNode[], g: Guards, diags: Diagnostic[]) {
  for (const n of nodes) {
    const k = normKey(n.key);
    const v = n.value ?? "";
    switch (k) {
      case "budget ceiling":
        parseBudget(v, g, n.line, diags);
        break;
      case "pre-flight gate": {
        const em = /entropy\s*<\s*([0-9.]+)/i.exec(v);
        g.preflight = { entropy: em ? parseFloat(em[1]) : 0.65, offTopic: /off-topic|off topic/i.test(v), line: n.line };
        break;
      }
      case "adaptive optimizer":
        g.optimizer = { text: v, line: n.line };
        break;
      case "rate limit": {
        const rm = /(\d+)\s*(?:requests?|queries|calls)?\s*\/\s*(second|sec|s|minute|min|m|hour|h)\b(.*)/i.exec(v);
        if (rm) {
          const u = rm[2].toLowerCase();
          const per = u.startsWith("s") ? "second" : u.startsWith("h") ? "hour" : "minute";
          g.rateLimit = { n: parseInt(rm[1], 10), per, scope: rm[3].replace(/^\s*per\s*/i, "").trim() || "Lane", line: n.line };
        } else diags.push({ line: n.line, severity: "warning", message: "Rate Limit not understood. Use e.g. `30 requests/minute per Lane`." });
        break;
      }
      case "allowed topics":
        g.allowedTopics = parseList(v);
        g.lines.allowed = n.line;
        break;
      case "banned topics":
        g.bannedTopics = parseList(v);
        g.lines.banned = n.line;
        break;
      case "model ladder": {
        const th = /remaining\s*<\s*(\d+)\s*%/i.exec(v);
        g.modelLadder = { tiers: parseList(v.replace(/\s+when.*$/i, "")), threshold: th ? parseInt(th[1], 10) : undefined, line: n.line };
        break;
      }
      case "downscaling":
        g.downscaling = { text: v, line: n.line };
        break;
      case "semantic cache": {
        const sm = /([0-9.]+)/.exec(v);
        g.semanticCache = { similarity: sm ? parseFloat(sm[1]) : 0.92, line: n.line };
        break;
      }
      case "value per outcome": {
        const vm = /\$?\s*([0-9.]+)/.exec(v);
        if (vm) g.valuePerOutcomeUsd = parseFloat(vm[1]);
        g.lines.value = n.line;
        break;
      }
      case "target roi": {
        const tm = /([0-9.]+)/.exec(v);
        if (tm) g.targetRoi = parseFloat(tm[1]);
        g.lines.roi = n.line;
        break;
      }
      default:
        if (n.key) g.lines[k] = n.line;
    }
  }
}

function readLanes(n: SpecNode): Lane[] {
  return n.children
    .filter((c) => c.key)
    .map((c) => {
      const lane: Lane = { name: c.key!, line: c.line, roles: [], clearance: [] };
      for (const f of c.children) {
        const k = normKey(f.key);
        if (k === "sso provider" || k === "identity") lane.sso = f.value;
        else if (k === "user") lane.user = f.value;
        else if (k === "roles") lane.roles = parseList(f.value);
        else if (k === "clearance") lane.clearance = parseList(f.value);
      }
      return lane;
    });
}

function readCaseFiles(n: SpecNode, diags: Diagnostic[]): CaseFile[] {
  return n.children
    .filter((c) => c.key)
    .map((c) => {
      const cf: CaseFile = { name: c.key!, line: c.line, endLine: c.endLine, sources: [], converters: [], redact: [], lines: {} };
      for (const f of c.children) {
        const k = normKey(f.key);
        const v = f.value ?? "";
        cf.lines[k] = f.line;
        if (k === "source" || k === "sources") {
          const quoted = [...v.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
          cf.sources = quoted.length ? quoted : parseList(v);
        } else if (k === "namespace isolation") {
          cf.namespace = /"([^"]+)"/.exec(v)?.[1] ?? v;
        } else if (k === "converters") cf.converters = parseList(v);
        else if (k === "curation") {
          const rm = /redact\s*\[([^\]]+)\]/i.exec(v);
          if (rm) cf.redact = rm[1].split(",").map((x) => x.trim()).filter(Boolean);
          const cm = /coherence\s*>=?\s*([0-9.]+)/i.exec(v);
          if (cm) cf.coherence = parseFloat(cm[1]);
        }
      }
      if (!cf.sources.length) diags.push({ line: c.line, severity: "info", message: `Case File "${cf.name}" has no Source. Upload documents in the Sandbox or add \`Source: pdf("file.pdf")\`.` });
      return cf;
    });
}

function readStages(n: SpecNode, diags: Diagnostic[]): Stage[] {
  const stages: Stage[] = [];
  for (const item of n.children) {
    const sm = /^Stage\s+(\d+)\s*(?:\((.*)\))?/i.exec(item.key ?? item.text);
    if (!sm) {
      diags.push({ line: item.line, severity: "warning", message: "Process Flow items should look like `- Stage 1 (Name):`." });
      continue;
    }
    const st: Stage = {
      idx: parseInt(sm[1], 10),
      name: (sm[2] ?? `Stage ${sm[1]}`).trim(),
      line: item.line,
      endLine: item.endLine,
      when: "Immediate",
      steps: [],
      milestone: "StageCompleted",
    };
    for (const f of item.children) {
      const k = normKey(f.key);
      if (k === "when") st.when = f.value ?? "";
      else if (k === "engine") st.engine = f.value;
      else if (k === "steps") {
        st.stepsLine = f.line;
        st.steps = f.children.map((s) => ({ text: s.text, norm: s.text, line: s.line }));
      } else if (k === "on breach") {
        const esc = f.children.find((c) => normKey(c.key) === "escalate to");
        st.escalateTo = esc?.value ?? f.value;
        st.escalateLine = esc?.line ?? f.line;
      } else if (k === "escalate to") {
        st.escalateTo = f.value;
        st.escalateLine = f.line;
      } else if (k === "reach milestone") {
        st.milestone = (f.value ?? "").split(/\s+/)[0] || st.milestone;
        st.milestoneLine = f.line;
      } else if (k === "exit gateway") {
        const g = { ifText: "", thenText: "", elseText: "", line: f.line, endLine: f.endLine };
        for (const c of f.children) {
          const ck = normKey(c.key);
          if (ck === "if") g.ifText = c.value ?? "";
          else if (ck === "then") g.thenText = c.value ?? "";
          else if (ck === "else") g.elseText = c.value ?? "";
        }
        st.gate = g;
        const rm = /reach Milestone\s+(\w+)/i.exec(g.thenText);
        if (rm && st.milestone === "StageCompleted") st.milestone = rm[1];
      }
    }
    stages.push(st);
  }
  return stages;
}

interface Ctx {
  diags: Diagnostic[];
  all: CaseAST[];
}

function analyzeCase(
  header: SpecNode | null,
  body: SpecNode[],
  kind: "Case" | "Subcase",
  parent: CaseAST | null,
  ctx: Ctx,
): CaseAST {
  const nameRaw = header?.value ? unquote(header.value) : "Unnamed Case";
  const slug = slugify(nameRaw);
  const nsPath = parent ? `${parent.namespacePath}/${slug}` : slug;
  const node: CaseAST = {
    kind,
    name: nameRaw,
    line: header?.line ?? 1,
    endLine: Math.max(header?.endLine ?? 1, ...body.map((b) => b.endLine)),
    version: parent?.version ?? "5.0",
    standards: parent ? [...parent.standards] : [],
    engines: [],
    population: "general_enterprise",
    namespacePath: nsPath,
    isolationHash: sha256Hex(nsPath).slice(0, 12),
    lanes: parent ? [...parent.lanes] : [],
    caseFiles: [],
    theoremPacks: parent ? [...parent.theoremPacks] : [],
    rules: parent ? parent.rules.map((r) => ({ ...r, inherited: true })) : [],
    suggestions: [],
    guards: emptyGuards(),
    stages: [],
    actuators: parent ? { ...parent.actuators } : {},
    deployment: parent ? { ...parent.deployment } : {},
    constraints: [],
    config: parent ? Object.fromEntries(Object.entries(parent.config).map(([k, v]) => [k, { ...v }])) : {},
    configLines: {},
    subcases: [],
    depth: parent ? parent.depth + 1 : 0,
    parentPath: parent?.namespacePath,
    satisfiable: true,
  };
  if (parent) {
    node.guards.allowedTopics = [...parent.guards.allowedTopics];
    node.guards.bannedTopics = [...parent.guards.bannedTopics];
    node.guards.preflight = parent.guards.preflight;
    node.guards.rateLimit = parent.guards.rateLimit;
    node.guards.modelLadder = parent.guards.modelLadder;
  }
  ctx.all.push(node);
  const { diags } = ctx;
  const subNodes: SpecNode[] = [];

  for (const n of body) {
    const k = normKey(n.key);
    const v = n.value ?? "";
    switch (k) {
      case "version":
        node.version = unquote(v);
        break;
      case "standards":
        node.standards = parseList(v);
        break;
      case "solution archetype":
        node.archetype = v.trim();
        if (!ARCHETYPES.includes(node.archetype))
          diags.push({ line: n.line, severity: "warning", message: `Unknown archetype "${node.archetype}". Known: ${ARCHETYPES.join(", ")}.` });
        break;
      case "business deliverable":
        node.deliverable = v.trim();
        break;
      case "engine":
      case "engines":
        node.engines = parseList(v);
        break;
      case "population segment":
        node.population = v.trim();
        break;
      case "lanes":
        node.lanes = [...node.lanes.filter((l) => !n.children.some((c) => c.key === l.name)), ...readLanes(n)];
        break;
      case "case file":
        node.caseFiles = readCaseFiles(n, diags);
        break;
      case "binding lean contract": {
        node.contractLine = n.line;
        for (const c of n.children) {
          const ck = normKey(c.key ?? c.text);
          if (ck === "import theorem packs") {
            for (const p of parseList(c.value)) if (!node.theoremPacks.includes(p)) node.theoremPacks.push(p);
          } else if (ck.startsWith("rules")) {
            node.rulesLine = c.line;
            c.children.forEach((r) => {
              const rule = compileRule(r.text, r.line, node.rules.length + 1, node.namespacePath);
              node.rules.push(rule);
              if (!rule.recognized)
                diags.push({
                  line: r.line,
                  severity: "warning",
                  message: "Rule not formalised (compiled to `True`). Phrase it as `It is obligatory that <metric> >= <value> before Milestone <Name>.`",
                });
            });
          }
        }
        break;
      }
      case "cost & traffic guards":
        node.guards.sectionLine = n.line;
        readGuards(n.children, node.guards, diags);
        break;
      case "budget ceiling":
        parseBudget(v, node.guards, n.line, diags);
        break;
      case "rollout strategy":
        node.guards.rollout = v;
        break;
      case "degradation fallback":
        node.guards.fallback = v;
        break;
      case "ai smart suggestions":
        for (const c of n.children) {
          const m = /^Suggest\s+(\w+):\s*"([^"]+)"\s*(?:\(Moderated by:\s*([^)]+)\))?/i.exec(c.text);
          if (m) node.suggestions.push({ kind: m[1], text: m[2], moderator: (m[3] ?? "").trim(), line: c.line });
        }
        break;
      case "process flow":
        node.processFlowLine = n.line;
        node.stages = readStages(n, diags);
        break;
      case "actuators":
        for (const c of n.children) if (c.key) node.actuators[c.key] = c.value ?? "";
        break;
      case "deployment":
        for (const c of n.children) if (c.key) node.deployment[c.key] = c.value ?? "";
        break;
      case "config":
        node.configLine = n.line;
        for (const comp of n.children) {
          if (!comp.key) continue;
          const cname = normName(comp.key);
          const spec = componentSpec(comp.key);
          const pairs: [string, string][] = (comp.value ?? "").trim().startsWith("{")
            ? parseInlineMap(comp.value ?? "")
            : comp.children.filter((f) => f.key).map((f) => [f.key!, f.value ?? ""] as [string, string]);
          node.config[cname] = { ...(node.config[cname] ?? {}) };
          node.configLines[cname] = comp.line;
          if (!spec)
            diags.push({ line: comp.line, severity: "info", message: `"${comp.key}" is a custom component; its config is kept in the IR for your own tools.` });
          for (const [k, v] of pairs) {
            node.config[cname][normName(k)] = v.trim();
            if (!spec) continue;
            const fs = fieldSpec(comp.key, k);
            if (!fs) diags.push({ line: comp.line, severity: "warning", message: `${spec.name} has no field "${k}". Available: ${spec.fields.map((f) => f.key).join(", ")}.` });
            else {
              const err = validateField(fs, v);
              if (err) diags.push({ line: comp.line, severity: "warning", message: err });
            }
          }
        }
        break;
      case "business & product constraints":
        for (const c of n.children) node.constraints.push({ facet: c.key ?? "Constraint", text: c.value ?? c.text, line: c.line });
        break;
      case "subcases":
        subNodes.push(...n.children);
        break;
      default:
        if (n.key && !KNOWN_KEYS.has(k))
          diags.push({ line: n.line, severity: "info", message: `Section "${n.key}" is not a core keyword; kept as extension metadata in the IR.` });
    }
  }

  for (const s of subNodes) {
    const isSub = /^subcase$/i.test(normKey(s.key));
    if (!isSub) {
      diags.push({ line: s.line, severity: "warning", message: "Subcases entries should start with `- Subcase: <Name>`." });
      continue;
    }
    node.subcases.push(analyzeCase(s, s.children, "Subcase", node, ctx));
  }
  return node;
}

/** Interval / disequality reasoning: find a witness or report the conflict. */
function solveWitness(c: CaseAST, fields: Map<string, "Nat" | "Bool">, diags: Diagnostic[]) {
  const lo = new Map<string, number>();
  const hi = new Map<string, number>();
  const ne = new Map<string, Set<number>>();
  const bools = new Map<string, { v: boolean; line: number }>();
  const pairs: Clause[] = [];
  const lineOf = new Map<string, number>();
  for (const r of c.rules) {
    const cls: Clause[] = r.negated ? [] : r.clauses;
    if (r.negated && r.clauses.length) {
      // ¬(a ∧ b): satisfied by violating the first clause.
      const f = r.clauses[0];
      const flip: Record<string, Clause["op"]> = { ">=": "<", "<=": ">", ">": "<=", "<": ">=", "=": "!=", "!=": "=" };
      cls.push(f.type === "Bool" && !f.rhsField ? { ...f, value: !f.value } : { ...f, op: flip[f.op] });
    }
    for (const cl of cls) {
      lineOf.set(cl.field, r.line);
      if (cl.rhsField) {
        pairs.push(cl);
        continue;
      }
      if (cl.type === "Bool") {
        const want = cl.op === "=" ? (cl.value as boolean) : !(cl.value as boolean);
        const prev = bools.get(cl.field);
        if (prev && prev.v !== want) {
          c.satisfiable = false;
          diags.push({ line: r.line, severity: "error", message: `Contract is unsatisfiable: ${cl.field} must be both ${prev.v} (line ${prev.line}) and ${want}.` });
        }
        bools.set(cl.field, { v: want, line: r.line });
        continue;
      }
      const v = cl.value as number;
      const setLo = (x: number) => lo.set(cl.field, Math.max(lo.get(cl.field) ?? 0, x));
      const setHi = (x: number) => hi.set(cl.field, Math.min(hi.get(cl.field) ?? Infinity, x));
      if (cl.op === ">=") setLo(v);
      else if (cl.op === ">") setLo(v + 1);
      else if (cl.op === "<=") setHi(v);
      else if (cl.op === "<") setHi(v - 1);
      else if (cl.op === "=") { setLo(v); setHi(v); }
      else if (cl.op === "!=") {
        if (!ne.has(cl.field)) ne.set(cl.field, new Set());
        ne.get(cl.field)!.add(v);
      }
    }
  }
  const w: Record<string, number | boolean> = {};
  for (const [f, t] of fields) w[f] = t === "Bool" ? false : 0;
  for (const [f, b] of bools) w[f] = b.v;
  const numFields = new Set([...lo.keys(), ...hi.keys(), ...ne.keys()]);
  for (const f of numFields) {
    let x = lo.get(f) ?? 0;
    const h = hi.get(f) ?? Infinity;
    const bad = ne.get(f) ?? new Set();
    while (bad.has(x) && x <= h) x++;
    if (x > h) {
      c.satisfiable = false;
      diags.push({
        line: lineOf.get(f) ?? c.line,
        severity: "error",
        message: `Contract is unsatisfiable: ${f} needs ≥ ${lo.get(f) ?? 0} and ≤ ${h}. No runtime state can ever pass this gate.`,
      });
      x = lo.get(f) ?? 0;
    }
    w[f] = x;
  }
  let next = 1;
  for (const p of pairs) {
    const a = w[p.field] as number;
    const b = w[p.rhsField!] as number;
    if (p.op === "!=" && a === b) {
      w[p.field] = next++;
      w[p.rhsField!] = next++;
    } else if ((p.op === ">" && !(a > b)) || (p.op === ">=" && !(a >= b))) w[p.field] = b + 1;
    else if ((p.op === "<" && !(a < b)) || (p.op === "<=" && !(a <= b))) w[p.rhsField!] = a + 1;
  }
  c.witness = w;
}

function collectFields(rules: CompiledRule[], fields: Map<string, "Nat" | "Bool">) {
  for (const r of rules)
    for (const c of r.clauses) {
      if (!fields.has(c.field)) fields.set(c.field, c.type);
      if (c.rhsField && !fields.has(c.rhsField)) fields.set(c.rhsField, "Nat");
    }
}

export function compileSpec(src: string): CompileResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const language = hasArabic(src) ? "ar" : "en";
  const normalized = language === "ar" ? normalizeArabic(src) : src;
  const diags: Diagnostic[] = [];
  const tree = buildTree(normalized);
  const ctx: Ctx = { diags, all: [] };
  const header = tree.find((n) => /^case$/i.test(normKey(n.key)));
  let root: CaseAST | null = null;
  if (!header) {
    diags.push({ line: 1, severity: "error", message: "A CaseSpine document starts with `Case: <Business case name>`." });
  } else {
    root = analyzeCase(header, tree.filter((n) => n !== header), "Case", null, ctx);
  }

  const fields = new Map<string, "Nat" | "Bool">();
  for (const c of ctx.all) collectFields(c.rules, fields);

  // Original-text steps (for Arabic labels) and cross-reference checks.
  const origLines = src.split("\n");
  for (const c of ctx.all) {
    for (const st of c.stages)
      for (const s of st.steps) s.text = origLines[s.line - 1].replace(/^\s*-\s*/, "").trim();
    solveWitness(c, fields, diags);

    const reached = new Set<string>(["StageExit"]);
    const scopeCases = [c, ...ctx.all.filter((x) => x.namespacePath.startsWith(c.namespacePath + "/"))];
    for (const sc of scopeCases)
      for (const st of sc.stages) {
        reached.add(st.milestone);
        const m = /Milestone\s+(\w+)/i.exec(st.gate?.thenText ?? "");
        if (m) reached.add(m[1]);
      }
    for (const r of c.rules) {
      if (r.inherited) continue;
      if (!reached.has(r.milestone) && scopeCases.some((sc) => sc.stages.length))
        diags.push({ line: r.line, severity: "warning", message: `Milestone "${r.milestone}" is never reached by any stage in this case.` });
    }
    const laneNames = new Set(c.lanes.map((l) => l.name.toLowerCase()));
    for (const st of c.stages) {
      if (st.escalateTo && !laneNames.has(st.escalateTo.toLowerCase()))
        diags.push({ line: st.escalateLine ?? st.line, severity: "info", message: `"${st.escalateTo}" is not a declared Lane; it will be provisioned as a durable escalation queue.` });
      if (!st.gate && st === c.stages[c.stages.length - 1] && c.rules.length)
        diags.push({ line: st.line, severity: "info", message: "Last stage has no Exit Gateway; add one so outputs are checked against the Lean contract." });
    }
    if (c.subcases.length) {
      const sumTok = c.subcases.reduce((a, s) => a + s.guards.budgetTokens, 0);
      if (sumTok > c.guards.budgetTokens)
        diags.push({
          line: c.guards.lines.budget ?? c.line,
          severity: "error",
          message: `Subcase budgets sum to ${sumTok} tokens, above this case's ceiling of ${c.guards.budgetTokens}.`,
        });
    }
  }
  if (root && !ctx.all.some((c) => c.rules.length))
    diags.push({ line: root.line, severity: "info", message: "No Binding Lean Contract yet — add rules so the runtime can prove outputs before they ship." });

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { root, cases: ctx.all, diagnostics: diags.sort((a, b) => a.line - b.line), language, normalized, fields, ms: t1 - t0 };
}
