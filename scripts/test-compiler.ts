// Smoke test: compile every example, check Lean/IR output and build a .csar.
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { compileSpec, emitAll, buildCsar, deriveGraph, EXAMPLES, PALETTE } from "../src/lib/casespine/index";
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
const ar = compileSpec(EXAMPLES[1].src), en = compileSpec(EXAMPLES[0].src);
check(JSON.stringify(ar.root!.rules.map((r) => r.lean)) === JSON.stringify(en.root!.rules.map((r) => r.lean)), "Arabic and English rules compile to identical Lean");
console.log("\nAR rules:", ar.root!.rules.map((r) => r.lean));
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
