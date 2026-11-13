// Smoke test: compile every example, check Lean/IR output and build a .csar.
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { compileSpec, emitAll, buildCsar, deriveGraph, EXAMPLES, PALETTE, bindingsFor, cfg } from "../src/lib/casespine/index";
import type { BindingValue } from "../src/lib/casespine/bindings";
import { suggestContinuation, indentSuggestion } from "../src/lib/casespine/suggest";
import { contextFrom } from "../src/lib/casespine/assist";
import { draftFromDescription, EXAMPLE_DESCRIPTIONS } from "../src/lib/casespine/copilot";
import { draftIntent } from "../src/lib/casespine/intent";
import { authoringSlot, upsertKey } from "../src/lib/casespine/edits";
import { checkedRepair, keywordHelp } from "../src/lib/casespine/repairs";
import { sha256Hex } from "../src/lib/sha256";

const out = process.argv[2] ?? "./.test-out";
mkdirSync(out, { recursive: true });
let failures = 0;
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log("  ✗ " + msg); } };

{
  let src = "Case: Authoring test";
  for (const [command, expected] of [
    ["Hey, add the lane with the requirements X, Y, Z", /Roles: \[X, Y, Z\]/],
    ["Add a lane called Review Board with SSO UAE PASS, roles REVIEW, clearance AML", /Review Board:\n    SSO Provider: UAE PASS\n    Roles: \[REVIEW\]\n    Clearance: \[AML\]/],
    ["Add a case file called Wire policy from wire.pdf", /Source: pdf\("wire\.pdf"\)/],
    ["Add a stage called Assess the transfer with a step Read the policy", /Stage 1 \(Assess the transfer\)/],
    ["Add a step Check the evidence", /- Check the evidence/],
    ["Add a second stage called Sign off", /When: Milestone EvidenceReady is achieved/],
    ["Add a rule citation coverage >= 95%", /citation coverage >= 95% before Milestone ReviewComplete/],
    ["Escalate to Review Board", /Escalate To: Review Board/],
    ["Add a gateway", /Exit Gateway:\n        If: all Binding Lean Contract rules hold/],
    ["Add a constraint Residency: Keep case data in the UAE", /Residency: Keep case data in the UAE/],
    ["Set budget ceiling to 9000 tokens or $0.20", /Budget Ceiling: 9000 tokens or \$0.20/],
    ["Add a component Retriever", /Retriever: \{ Mode: hybrid/],
    ["Set Retriever Top K to 4", /Top K: 4/],
    ["Add a proposal Check policy changes reviewed by Review Board", /Moderated by: Review Board/],
    ["Add a subcase called Exceptions", /Subcase: Exceptions/],
  ] as const) {
    const candidate = draftIntent(src + "\n" + command, src.split("\n").length + 1);
    check(!!candidate && expected.test(candidate.source), `plain-language draft: ${command}`);
    if (candidate) src = candidate.source;
  }
  check(!!draftIntent("Please add a lane called Approvers", 1)?.compiled.root?.lanes.length, "plain-language lane from blank");
  check(!draftIntent(src + "\nfluffy unicorn on a trampoline", src.split("\n").length + 1), "unrelated text stays unresolved");
  check(!draftIntent(src + "\nNeed independent reviewers", src.split("\n").length + 1, "add rule invented metric >= 2"), "unknown model-invented rule probes are rejected");
}

{
  // Build each repeated section from the editor's default repair and keep the original below it.
  const sections = [
    ["Lanes:", "  Case Owner:\n    Clearance: [REVIEW]", "Head of Compliance:", "lanes"],
    ["Case File:", '  Documents:\n    Source: pdf("original.pdf")', "Policy Documents:", "caseFiles"],
    ["Binding Lean Contract:", "  Rules:\n    - It is obligatory that reviewer 1 != reviewer 2 before Milestone StageExit.", "citation coverage", "rules"],
    ["Process Flow:", "  - Stage 1 (Intake):\n      Steps:\n        - Receive the request\n      Reach Milestone: IntakeComplete", "Stage 2 (Review):", "stages"],
    ["Business & Product Constraints:", "  Compliance: Document each release.", "Risk:", "constraints"],
    ["Subcases:", "  - Subcase: Additional Review\n    Budget Ceiling: 1000 tokens or $0.05", "Additional Review 2", "subcases"],
    ["AI Smart Suggestions:", '  - Suggest first_review: "Review current policies"', "Suggest policy_review:", "suggestions"],
  ] as const;
  for (const [header, existing, expected, collection] of sections) {
    const original = `${header}\n${existing}`;
    const source = `Case: Multiple sections\n${header}\n${original}`;
    const compiled = compileSpec(source);
    const lines = source.split("\n");
    const [insert, go] = keywordHelp(lines, 2, contextFrom(compiled, 2, lines));
    const accepted = insert?.repair && checkedRepair(source, compiled, insert.repair);
    check(!!accepted && accepted.source.endsWith(original) && accepted.source.includes(expected), `insert ${header} above an existing block`);
    check(!!accepted && accepted.compiled.root?.[collection].length === 2, `both ${header} entries reach the compiled case`);
    check(go?.targetLine === 3 && !go.repair, `navigation for ${header} preserves source`);
    check(!compiled.diagnostics.some((d) => d.severity === "error"), `empty second ${header} can be edited manually`);
  }

  const source = `Case: Multiple sections
Lanes:
  Intake:
    Roles: [INTAKE]
Lanes:
  Reviewer:
    Roles: [HITM_APPROVER]
Case File:
  Wire Policy:
    Source: pdf("wire.pdf")
Case File:
  Review Policy:
    Source: pdf("review.pdf")
Process Flow:
  - Stage 1 (Intake):
      Steps:
        - Screen inbound transfer
      Steps:
        - Record the risk score
      Reach Milestone: IntakeComplete
Process Flow:
  - Stage 2 (Review):
      When: Milestone IntakeComplete is achieved
      Steps:
        - Synthesize grounded answer with citations
      On Breach:
        Escalate To: Reviewer
      Reach Milestone: ReviewComplete
Binding Lean Contract:
  Rules:
    - It is obligatory that reviewer 1 != reviewer 2 before Milestone ReviewComplete.
  Rules:
    - It is obligatory that citation coverage >= 90% before Milestone ReviewComplete.
Binding Lean Contract:
  Rules:
    - It is obligatory that p95 latency <= 2500 ms before Milestone ReviewComplete.
Subcases:
  - Subcase: Exceptions
    Budget Ceiling: 1000 tokens or $0.05
    Lanes:
      Intake:
        Roles: [EXCEPTION_INTAKE]
    Lanes:
      Exceptions Lead:
Subcases:
  - Subcase: Complaints
    Budget Ceiling: 1000 tokens or $0.05
Business & Product Constraints:
  Compliance: Document each release.
Business & Product Constraints:
  Risk: Send exceptions to human review.
`;
  const result = compileSpec(source);
  const root = result.root!;
  check(!result.diagnostics.some((d) => d.severity === "error"), "repeatable blocks compile together");
  check(root.lanes.map((l) => l.name).join() === "Intake,Reviewer" && root.stages[1].escalateTo === "Reviewer", "lanes from both blocks support escalation");
  check(root.caseFiles.map((f) => f.sources[0]).join() === "wire.pdf,review.pdf", "case files from both blocks retain their sources");
  check(root.stages.map((s) => s.idx).join() === "1,2" && root.stages[0].steps.length === 2, "process flow and steps preserve source order");
  check(root.rules.length === 3 && root.constraints.length === 2, "contracts, rules and constraints keep all entries");
  check(root.subcases.length === 2 && root.subcases[0].lanes.find((l) => l.name === "Intake")?.roles[0] === "EXCEPTION_INTAKE", "subcases retain local lane overrides");
  check(root.subcases[1].lanes.every((l) => l.name !== "Exceptions Lead"), "the second subcase keeps separate lanes");
  const edited = upsertKey(source, root, ["Case File", "Review Policy"], "Source", 'pdf("updated.pdf")');
  check(compileSpec(edited).root?.caseFiles.map((f) => f.sources[0]).join() === "wire.pdf,updated.pdf", "field edit finds a collection in the second block");
  const firstLane = root.lanes[0].line;
  check(authoringSlot(source, root, "lane", firstLane)?.line === firstLane + 1, "toolbar adds entries in the focused block");
  check(authoringSlot(source, root, "lane")?.line === root.lanes[1].line + 1, "toolbar otherwise appends to the last block");
  const section = authoringSlot(source, root, "section", firstLane);
  check(section?.line === firstLane + 1 && section.lines?.[0] === "", "Add section inserts after the focused block at case indentation");
  for (const header of ["Steps:", "Rules:"]) {
    const draft = source.replace(header, header + "\n" + (header === "Steps:" ? "      " : "  ") + header);
    const lines = draft.split("\n");
    const line = lines.findIndex((text) => text.trim() === header) + 1;
    const compiled = compileSpec(draft);
    const [insert] = keywordHelp(lines, line, contextFrom(compiled, line, lines));
    const accepted = insert?.repair && checkedRepair(draft, compiled, insert.repair);
    check(!!accepted && !accepted.compiled.diagnostics.some((d) => d.severity === "error"), `completing a second nested ${header} resolves the draft`);
  }

  for (const [before, after, expected] of [
    ["  Reviewer:", "  intake:", /Lane "intake" already exists/],
    ["  Review Policy:", "  Wire Policy:", /Case File "Wire Policy" already exists/],
    ["Stage 2 (Review)", "Stage 1 (Review)", /Stage 1 already exists/],
    ["Subcase: Complaints", "Subcase: Exception s", /shares an existing namespace/],
    ["      Reach Milestone: ReviewComplete", "      On Breach:\n        Escalate To: Intake\n      Reach Milestone: ReviewComplete", /one breach escalation per stage/],
    ["\nLanes:\n", "\nDeployment:\nDeployment:\nLanes:\n", /one `Deployment:` per case/],
  ] as const) {
    const duplicate = compileSpec(source.replace(before, after));
    check(duplicate.diagnostics.some((d) => d.severity === "error" && expected.test(d.message)), `reject ambiguous duplicate ${after}`);
  }
  const arabic = "الحالة: مراجعة التحويل\nالمسارات:\nالمسارات:\n  مراجع الفرع:\n    الأدوار: [HITM_APPROVER]";
  const ar = compileSpec(arabic);
  const arLines = arabic.split("\n");
  const [insert] = keywordHelp(arLines, 2, contextFrom(ar, 2, arLines));
  const accepted = insert?.repair && checkedRepair(arabic, ar, insert.repair);
  check(!!accepted && accepted.compiled.root?.lanes.map((l) => l.name).join() === "Case Owner,مراجع الفرع", "Arabic repeated heading keeps both lanes");
}

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
    const result = compileSpec(ex.src);
    let pos = 0, broken = 0;
    for (const [i, l] of lines.entries()) {
      pos += l.length;
      const sug = suggestContinuation(ex.src, pos, contextFrom(result, i + 1, lines));
      if (sug) {
        const ind = l.length - l.trimStart().length;
        const next = ex.src.slice(0, pos) + indentSuggestion(sug, ind) + ex.src.slice(pos);
        const errors = compileSpec(next).diagnostics.filter((d) => d.severity === "error");
        if (errors.length) {
          broken++;
          console.log(`  L${i + 1} ${JSON.stringify(l)} → ${JSON.stringify(sug)}: ${errors.map((d) => d.message).join(", ")}`);
        }
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
