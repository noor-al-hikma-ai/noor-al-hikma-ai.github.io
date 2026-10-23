// Smoke test: compile every example, check Lean/IR output and build a .csar.
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { compileSpec, emitAll, buildCsar, deriveGraph, EXAMPLES, PALETTE, bindingsFor, cfg } from "../src/lib/casespine/index";
import type { BindingValue } from "../src/lib/casespine/bindings";
import { suggestContinuation, indentSuggestion } from "../src/lib/casespine/suggest";
import { contextFrom } from "../src/lib/casespine/assist";
import { draftFromDescription, EXAMPLE_DESCRIPTIONS } from "../src/lib/casespine/copilot";
import { sha256Hex } from "../src/lib/sha256";

const out = process.argv[2] ?? "./.test-out";
mkdirSync(out, { recursive: true });
let failures = 0;
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log("  ✗ " + msg); } };

for (const s of ["", "abc", "x".repeat(1000), "CaseSpine ✓ نور الحكمة"]) {
  check(sha256Hex(s) === createHash("sha256").update(s).digest("hex"), `sha256 mismatch for ${JSON.stringify(s.slice(0, 10))}`);
}

for (const ex of EXAMPLES) {
  const r = compileSpec(ex.src);
  console.log(`\n=== ${ex.id} (${r.language}) — ${r.cases.length} case(s), ${r.ms.toFixed(1)} ms`);
  for (const d of r.diagnostics) console.log(`  [${d.severity}] L${d.line}: ${d.message}`);
  check(!!r.root, "root parsed");
  check(!r.diagnostics.some((d) => d.severity === "error"), "no errors");
  for (const c of r.cases) {
    const g = deriveGraph(c);
    console.log(`  ${c.namespacePath}: rules=${c.rules.length} stages=${c.stages.length} sat=${c.satisfiable} graph=${g.nodes.length}n/${g.edges.length}e`);
    for (const rule of c.rules.filter((x) => !x.inherited)) console.log(`    ${rule.id} ${rule.modality} @${rule.milestone}: ${rule.lean}`);
    if (c.stages.length) console.log("    nodes:", g.nodes.map((n) => n.kind).join(" "));
  }
  const targets = emitAll(r);
  for (const t of targets) writeFileSync(`${out}/${ex.id}.${t.id}.txt`, t.code);
  const bundle = buildCsar(r);
  writeFileSync(`${out}/${ex.id}.csar`, bundle.bytes);
  // palette edits must keep the document compiling
  const focus = r.cases.find((c) => c.stages.length) ?? r.root!;
  for (const p of PALETTE) {
    const edited = p.apply(ex.src, focus);
    const r2 = compileSpec(edited);
    check(!!r2.root && !r2.diagnostics.some((d) => d.severity === "error"), `palette ${p.label} on ${ex.id} breaks compile`);
  }
}
// ---- Config section
{
  const en0 = compileSpec(EXAMPLES[0].src).root!;
  check(cfg<number>(en0.config, "Retriever", "Top K") === 3, "EN config Retriever.Top K = 3");
  check(cfg<string>(en0.config, "Escalation", "Channel") === "teams", "EN block-form config Escalation.Channel = teams");
  check(cfg<boolean>(en0.config, "Synthesizer", "Abstain When Unsupported") === true, "EN toggle config parsed");
  const ar0 = compileSpec(EXAMPLES[1].src).root!;
  check(cfg<number>(ar0.config, "Retriever", "Top K") === 3 && cfg<string>(ar0.config, "Synthesizer", "Language") === "ar", "AR config with Arabic component names parsed");
  const bad = compileSpec(EXAMPLES[0].src.replace("Top K: 3", "Top K: 99"));
  check(bad.diagnostics.some((d) => /Top K must be/.test(d.message)), "out-of-range config value is diagnosed");
}

// ---- Every inspector binding round-trips through the text
let roundTrips = 0;
const nextValue = (b: ReturnType<typeof bindingsFor>[number], cur: BindingValue): BindingValue => {
  const f = b.field;
  if (f.type === "number") {
    const step = f.step ?? 1;
    let v = Number(cur) + step;
    if (f.max !== undefined && v > f.max) v = Number(cur) - step;
    return Math.round(v * 1000) / 1000;
  }
  if (f.type === "toggle") return !cur;
  if (f.type === "multi") return (f.options ?? []).filter((o) => !(cur as string[]).includes(o)).slice(0, 1).concat((cur as string[]).slice(0, 1)).filter(Boolean);
  if (f.type === "select" || f.type === "lane") return (f.options ?? []).find((o) => o !== cur) ?? cur;
  return b.id === "cf.source" ? "alpha.pdf, beta.pdf" : "alpha, beta";
};
const norm = (v: BindingValue) => (Array.isArray(v) ? [...v].sort().join("|") : typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v));
for (const ex of EXAMPLES) {
  const r = compileSpec(ex.src);
  for (const c of r.cases.filter((x) => x.stages.length)) {
    for (const n of deriveGraph(c).nodes) {
      for (const b of bindingsFor(n.kind, c, n.stage)) {
        const cur = b.get(c);
        const want = nextValue(b, cur);
        if (norm(want) === norm(cur)) continue;
        const src2 = b.set(ex.src, c, want);
        const r2 = compileSpec(src2);
        const c2 = r2.cases.find((x) => x.namespacePath === c.namespacePath);
        const errs = r2.diagnostics.filter((d) => d.severity === "error");
        const got = c2 ? b.get(c2) : undefined;
        const ok = !!c2 && !errs.length && got !== undefined && norm(got) === norm(want);
        check(ok, `binding ${b.id} on ${n.kind} in ${ex.id}: wanted ${norm(want)}, got ${got === undefined ? "?" : norm(got)}${errs.length ? " (" + errs[0].message + ")" : ""}`);
        roundTrips++;
      }
    }
  }
}
console.log(`\nconfig round-trips: ${roundTrips}`);

// ---- Palette items change the text and keep it compiling
for (const ex of EXAMPLES) {
  const r = compileSpec(ex.src);
  const focus = r.cases.find((c) => c.stages.length) ?? r.root!;
  for (const p of PALETTE) {
    if (p.present?.(focus)) continue;
    const edited = p.apply(ex.src, focus);
    check(edited !== ex.src, `palette ${p.label} on ${ex.id} changed nothing`);
    const r2 = compileSpec(edited);
    const f2 = r2.cases.find((c) => c.namespacePath === focus.namespacePath);
    check(!!f2 && deriveGraph(f2).nodes.length >= deriveGraph(focus).nodes.length, `palette ${p.label} on ${ex.id} lost nodes`);
    if (p.component) check(!!f2 && !!f2.config[p.component.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()], `palette ${p.label} on ${ex.id} did not add ${p.component} config`);
  }
}

// ---- Suggestion engine (ghost text)
{
  const at = (doc: string) => suggestContinuation(doc, doc.length, contextFrom(compileSpec(doc)));
  check(at("") === "Case: My Business Case", "ghost: empty doc suggests Case");
  check((at("Case: X\n") ?? "").startsWith("Lanes:"), "ghost: next section after Case is Lanes");
  check(at("Case: X\nLanes:\n  A:\n    SSO Provider: Ok") === "ta", "ghost: value completion Ok→Okta");
  check((at("Case: X\nCost & Traffic Guards:\n  Sem") ?? "").startsWith("antic Cache: reuse"), "ghost: partial guard key");
  check((at("Case: X\nBinding Lean Contract:\n  Rules:\n    - It is ob") ?? "").startsWith("ligatory that"), "ghost: rule template");
  check((at("Case: X\nConfig:\n  Retr") ?? "").startsWith("iever: { Mode: hybrid"), "ghost: config component with defaults");
  check((at("Case: X\nConfig:\n  Retriever:\n    Top") ?? "").startsWith(" K: 3"), "ghost: config field with default");
  // Unprepared user: press Tab + Enter only.
  let doc = "";
  for (let i = 0; i < 12; i++) {
    const sug = suggestContinuation(doc, doc.length, contextFrom(compileSpec(doc)));
    if (!sug) break;
    doc += indentSuggestion(sug, 0) + "\n";
  }
  const built = compileSpec(doc);
  const g = built.root ? deriveGraph(built.root) : { nodes: [] };
  check(!!built.root && !built.diagnostics.some((d) => d.severity === "error"), "Tab-only document compiles without errors");
  check(["lanes", "case file", "binding lean contract", "cost & traffic guards", "config", "process flow", "deployment"].every((k) => doc.toLowerCase().includes(k + ":")), "Tab-only document has every core section");
  check(g.nodes.length >= 8 && (built.root?.rules.length ?? 0) >= 1, `Tab-only document has a real graph (${g.nodes.length} nodes) and rules`);
  // Tab inside every example line end must never produce text that breaks compilation.
  for (const ex of EXAMPLES) {
    const lines = ex.src.split("\n");
    let pos = 0, broken = 0;
    for (const l of lines) {
      pos += l.length;
      const sug = suggestContinuation(ex.src, pos, contextFrom(compileSpec(ex.src)));
      if (sug) {
        const ind = l.length - l.trimStart().length;
        const next = ex.src.slice(0, pos) + indentSuggestion(sug, ind) + ex.src.slice(pos);
        if (compileSpec(next).diagnostics.some((d) => d.severity === "error")) broken++;
      }
      pos += 1;
    }
    check(broken === 0, `ghost suggestions in ${ex.id} never introduce errors (${broken} did)`);
  }
}

// ---- Copilot (plain words -> CaseSpine)
{
  for (const d of [...EXAMPLE_DESCRIPTIONS, "I want AI for my bank", "نريد مساعدًا لموظفي الفروع", "x"]) {
    const r = draftFromDescription(d);
    check(r.compiles && r.rules >= 3, `copilot draft compiles for: ${d.slice(0, 40)}`);
  }
  const d1 = draftFromDescription(EXAMPLE_DESCRIPTIONS[0]);
  check(d1.completeness === 1 && d1.questions.length === 0, "copilot: complete description needs no questions");
  check(d1.assumptions.some((a) => a.value === "Head of Card Operations"), "copilot: approver detected");
  const vague = draftFromDescription("I want AI for my bank");
  check(vague.tips.length >= 4 && vague.questions.length === 6, "copilot: vague description gets tips and questions");
  const answered = draftFromDescription("I want AI for my bank", { users: "Relationship Managers", budget: "$0.05" });
  check(answered.spec.includes("Relationship Managers:") && answered.spec.includes("$0.05"), "copilot: answers to questions flow into the draft");
}

const ar = compileSpec(EXAMPLES[1].src), en = compileSpec(EXAMPLES[0].src);
check(JSON.stringify(ar.root!.rules.map((r) => r.lean)) === JSON.stringify(en.root!.rules.map((r) => r.lean)), "Arabic and English rules compile to identical Lean");
console.log("\nAR rules:", ar.root!.rules.map((r) => r.lean));
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
