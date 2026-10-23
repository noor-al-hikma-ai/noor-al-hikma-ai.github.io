// Multi-target emitters. One CaseAST -> Lean 4, Z3, BPMN 2.0 + CMMN, LangGraph,
// AWS Step Functions + Bedrock Guardrails, GCP Cloud Workflows, Databricks
// Asset Bundle, Kubernetes (KEDA + NetworkPolicy) and the portable IR.
// Generated artefacts are scaffolds: structurally complete, ready for the
// engineering lanes to bind real endpoints.

import { classifyStep } from "./graph";
import type { CaseAST, CompileResult, Stage } from "./types";
import { cfg } from "./configSchema";

const ident = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "") || "Case";
const snake = (s: string) =>
  s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "step";
const kebab = (s: string) => snake(s).replace(/_/g, "-");
const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const yq = (s: string) => JSON.stringify(s);

function caseSlug(c: CaseAST) {
  return c.namespacePath.replace(/\//g, "_");
}

// ---------------------------------------------------------------- Lean 4
export function emitLean(r: CompileResult): string {
  const root = r.root;
  if (!root) return "-- nothing to compile";
  const ns = ident(root.name);
  const out: string[] = [
    "-- Auto-compiled by CaseSpine v5 from SBVR & FEEL constrained-English rules.",
    `-- Root case: ${root.name}`,
    `-- Standards: ${root.standards.join(", ") || "—"}`,
    `namespace CaseSpineProcess.${ns}`,
    "",
    "/-- Runtime state observed by the Spine Reference Monitor at each milestone gate. -/",
    "structure ProcessCaseState where",
  ];
  const fields = [...r.fields.entries()];
  if (!fields.length) out.push("  placeholder : Nat");
  for (const [f, t] of fields) out.push(`  ${f} : ${t}`);
  out.push("  deriving Repr, DecidableEq", "");

  for (const c of r.cases) {
    const slug = caseSlug(c);
    out.push(`-- ── ${c.kind}: ${c.name}  (namespace ${c.namespacePath}, isolation ${c.isolationHash})`);
    c.rules.forEach((rule, i) => {
      out.push(`-- Rule ${i + 1}${rule.inherited ? " (inherited)" : ""} · ${rule.modality} before Milestone ${rule.milestone}:`);
      out.push(`--   "${rule.raw}"`);
    });
    const conj = c.rules.length ? c.rules.map((x) => x.lean).join(" ∧\n  ") : "True";
    out.push(`def ProcessContract_${slug} (s : ProcessCaseState) : Prop :=`, `  ${conj}`, "");
    out.push(
      `instance (s : ProcessCaseState) : Decidable (ProcessContract_${slug} s) := by`,
      `  unfold ProcessContract_${slug}; infer_instance`,
      "",
    );
    if (c.witness && c.satisfiable && fields.length) {
      const lit = fields.map(([f, t]) => {
        const v = c.witness![f];
        return t === "Bool" ? String(v === true) : String(typeof v === "number" ? v : 0);
      });
      out.push(
        `/-- Satisfiability witness found by the CaseSpine bound solver; checked by \`decide\`. -/`,
        `def witness_${slug} : ProcessCaseState := ⟨${lit.join(", ")}⟩`,
        `example : ProcessContract_${slug} witness_${slug} := by decide`,
        "",
      );
    } else if (!c.satisfiable) {
      out.push(`-- ⚠ Contract for ${c.name} is UNSATISFIABLE: the exit gateway can never open.`, "");
    }
    // Milestone gates
    const byMs = new Map<string, string[]>();
    for (const rule of c.rules) {
      if (!byMs.has(rule.milestone)) byMs.set(rule.milestone, []);
      byMs.get(rule.milestone)!.push(rule.lean);
    }
    for (const [ms, props] of byMs) {
      out.push(`def Gate_${slug}_${ident(ms)} (s : ProcessCaseState) : Prop :=`, `  ${props.join(" ∧ ")}`, "");
    }
  }
  out.push(`end CaseSpineProcess.${ns}`);
  return out.join("\n");
}

// ---------------------------------------------------------------- Z3 SMT-LIB v2
export function emitSmt2(r: CompileResult): string {
  const out: string[] = [
    "; Auto-compiled by CaseSpine v5 — Z3 SMT-LIB v2 satisfiability & vacuity checks",
    "(set-logic QF_LIA)",
  ];
  for (const [f, t] of r.fields) {
    out.push(`(declare-const ${f} ${t === "Bool" ? "Bool" : "Int"})`);
    if (t === "Nat") out.push(`(assert (>= ${f} 0))`);
  }
  for (const c of r.cases) {
    const slug = caseSlug(c);
    const body = c.rules.length ? (c.rules.length === 1 ? c.rules[0].smt2 : `(and ${c.rules.map((x) => x.smt2).join(" ")})`) : "true";
    out.push("", `; ${c.kind}: ${c.name}`, `(define-fun contract_${slug} () Bool ${body})`);
    out.push("(push)", `(assert contract_${slug})`, "(check-sat) ; expect sat — the gate can open", "(get-model)", "(pop)");
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- BPMN 2.0 + CMMN 1.1
export function emitBpmn(r: CompileResult): string {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"',
    '             xmlns:cmmn="https://www.omg.org/spec/CMMN/20151109/MODEL"',
    '             xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"',
    '             targetNamespace="https://casespine.io/schema/bpmn-cmmn-v5">',
  ];
  for (const c of r.cases) {
    const slug = caseSlug(c);
    out.push(`  <process id="Process_${slug}" name="${xml(c.name)}" isExecutable="true">`);
    if (c.lanes.length) {
      out.push(`    <laneSet id="Lanes_${slug}">`);
      c.lanes.forEach((l, i) => out.push(`      <lane id="Lane_${slug}_${i}" name="${xml(l.name)}"/>`));
      out.push("    </laneSet>");
    }
    if (!c.stages.length) {
      out.push("  </process>");
      continue;
    }
    out.push(`    <startEvent id="Start_${slug}"/>`);
    let prev = `Start_${slug}`;
    let flow = 0;
    const seq = (a: string, b: string, name?: string) =>
      out.push(`    <sequenceFlow id="Flow_${slug}_${++flow}" sourceRef="${a}" targetRef="${b}"${name ? ` name="${xml(name)}"` : ""}/>`);
    c.stages.forEach((st, si) => {
      const sid = `Stage_${slug}_${si + 1}`;
      out.push(`    <subProcess id="${sid}" name="${xml(st.name)}">`);
      out.push(`      <documentation>CMMN sentry When: ${xml(st.when)} | Milestone: ${xml(st.milestone)}</documentation>`);
      st.steps.forEach((s, i) => {
        const kind = classifyStep(s.norm)[0]?.kind ?? "task";
        out.push(`      <serviceTask id="Task_${slug}_${si + 1}_${i + 1}" name="${xml(s.text)}">`);
        out.push(`        <extensionElements><zeebe:taskDefinition type="casespine.${kind}"/></extensionElements>`);
        out.push("      </serviceTask>");
      });
      out.push("    </subProcess>");
      if (st.escalateTo)
        out.push(`    <boundaryEvent id="Breach_${slug}_${si + 1}" attachedToRef="${sid}" name="Escalate: ${xml(st.escalateTo)}"><escalationEventDefinition/></boundaryEvent>`);
      seq(prev, sid);
      prev = sid;
      if (st.gate) {
        const gw = `Gate_${slug}_${si + 1}`;
        out.push(`    <exclusiveGateway id="${gw}" name="Lean 4 Spine Reference Monitor"/>`);
        seq(prev, gw);
        out.push(`    <intermediateThrowEvent id="Milestone_${slug}_${st.milestone}" name="Milestone: ${xml(st.milestone)}"/>`);
        out.push(`    <serviceTask id="Compensate_${slug}_${si + 1}" name="${xml(st.gate.elseText || "Compensate")}" isForCompensation="true"/>`);
        seq(gw, `Milestone_${slug}_${st.milestone}`, "contract holds");
        seq(gw, `Compensate_${slug}_${si + 1}`, "contract breached");
        prev = `Milestone_${slug}_${st.milestone}`;
      } else {
        out.push(`    <intermediateThrowEvent id="Milestone_${slug}_${st.milestone}" name="Milestone: ${xml(st.milestone)}"/>`);
        seq(prev, `Milestone_${slug}_${st.milestone}`);
        prev = `Milestone_${slug}_${st.milestone}`;
      }
    });
    out.push(`    <endEvent id="End_${slug}"/>`);
    seq(prev, `End_${slug}`);
    out.push("  </process>");
  }
  out.push("</definitions>");
  return out.join("\n");
}

// ---------------------------------------------------------------- LangGraph
function pyNodeName(st: Stage, i: number) {
  return `${snake(st.name).slice(0, 40)}_${i + 1}`;
}

export function emitLangGraph(r: CompileResult, c: CaseAST | undefined): string {
  if (!c) return "# nothing to compile";
  const fields = [...r.fields.entries()];
  const out: string[] = [
    '"""',
    `LangGraph scaffold compiled by CaseSpine v5 from case "${c.name}".`,
    "The business owner never wrote this file: every node, edge, budget and gate",
    "below is derived from the constrained-English specification.",
    '"""',
    "from typing import TypedDict, Annotated",
    "import operator",
    "from langgraph.graph import StateGraph, START, END",
    "from langgraph.checkpoint.memory import MemorySaver",
    "from langgraph.types import interrupt",
    "",
    "from casespine.runtime import guards, retrieval, synthesis, ledger, tools",
    "",
    "",
    "class CaseState(TypedDict, total=False):",
    "    inquiry: str",
    "    lane: str",
    "    chunks: list",
    "    answer: str",
    "    citations: list",
    "    audit: Annotated[list, operator.add]",
  ];
  for (const [f, t] of fields) out.push(`    ${f}: ${t === "Bool" ? "bool" : "int"}`);
  out.push(
    "",
    `BUDGET = guards.Budget(tokens=${c.guards.budgetTokens}, usd=${c.guards.budgetUsd.toFixed(2)})`,
  );
  if (c.guards.rateLimit) out.push(`RATE = guards.RateLimit(${c.guards.rateLimit.n}, per="${c.guards.rateLimit.per}", scope="${c.guards.rateLimit.scope}")`);
  if (c.guards.bannedTopics.length) out.push(`BANNED_TOPICS = ${JSON.stringify(c.guards.bannedTopics)}`);
  if (c.guards.modelLadder) out.push(`MODEL_LADDER = ${JSON.stringify(c.guards.modelLadder.tiers)}`);
  out.push("", "", "def contract(s: CaseState) -> bool:", `    """Binding Lean Contract (mirrors ProcessContract_${caseSlug(c)})."""`);
  if (c.rules.length) {
    out.push("    s = {**s}");
    out.push("    return all([");
    for (const rule of c.rules) out.push(`        ${rule.python},  # ${rule.id}: ${rule.raw.slice(0, 70)}`);
    out.push("    ])");
  } else out.push("    return True");
  out.push("");

  const nodes: { name: string; body: string[] }[] = [];
  c.stages.forEach((st, si) => {
    st.steps.forEach((s, i) => {
      const kinds = classifyStep(s.norm).map((k) => k.kind);
      const name = `${pyNodeName(st, si)}_${i + 1}_${kinds[0] ?? "task"}`.slice(0, 60);
      const body: string[] = [];
      if (kinds.includes("preflight")) body.push("    guards.preflight(state, BUDGET, banned=globals().get(\"BANNED_TOPICS\", []))");
      if (kinds.includes("bm25") || kinds.includes("dense") || kinds.includes("rrf"))
        body.push(`    state["chunks"] = retrieval.hybrid(state["inquiry"], k=${cfg<number>(c.config, "Retriever", "Top K")}, mode="${cfg<string>(c.config, "Retriever", "Mode")}", rrf_k=${cfg<number>(c.config, "Retriever", "RRF k")})`);
      if (kinds.includes("synth"))
        body.push(`    state["answer"], state["citations"] = synthesis.grounded(state, model="${cfg<string>(c.config, "Synthesizer", "Model")}", max_sentences=${cfg<number>(c.config, "Synthesizer", "Max Sentences")}, ladder=globals().get("MODEL_LADDER"), budget=BUDGET)`);
      if (kinds.includes("pii")) body.push("    tools.redact(state, entities=" + JSON.stringify(c.caseFiles.flatMap((f) => f.redact)) + ")");
      if (kinds.includes("hitm")) body.push("    state[\"approval\"] = interrupt({\"question\": \"Approve AI suggestion?\", \"lane\": state.get(\"lane\")})");
      if (!body.length) body.push(`    tools.run(${yq(s.text)}, state)`);
      body.push(`    return {"audit": [ledger.event(${yq(name)})]}`);
      nodes.push({ name, body });
    });
  });
  for (const n of nodes) out.push(`def ${n.name}(state: CaseState):`, ...n.body, "");
  out.push(
    "def reference_monitor(state: CaseState):",
    "    verdict = contract(state)",
    '    return {"audit": [ledger.event("lean_gate", verdict=verdict)], "verdict": verdict}',
    "",
    "def emit_deliverable(state: CaseState):",
    `    return {"audit": [ledger.event("emit", deliverable=${yq(c.deliverable ?? "Verified_Output")})]}`,
    "",
    "def compensate_and_escalate(state: CaseState):",
  );
  const esc = c.stages.map((s) => s.escalateTo).filter(Boolean).pop();
  out.push(
    `    decision = interrupt({"escalate_to": ${yq(esc ?? "Case Owner")}, "reason": "contract breached"})`,
    '    return {"audit": [ledger.event("escalated", decision=decision)]}',
    "",
    "",
    "builder = StateGraph(CaseState)",
  );
  for (const n of nodes) out.push(`builder.add_node(${yq(n.name)}, ${n.name})`);
  out.push(
    'builder.add_node("reference_monitor", reference_monitor)',
    'builder.add_node("emit_deliverable", emit_deliverable)',
    'builder.add_node("compensate_and_escalate", compensate_and_escalate)',
  );
  const chain = ["START", ...nodes.map((n) => yq(n.name)), yq("reference_monitor")];
  for (let i = 0; i < chain.length - 1; i++) out.push(`builder.add_edge(${chain[i]}, ${chain[i + 1]})`);
  out.push(
    'builder.add_conditional_edges("reference_monitor", lambda s: "pass" if s["verdict"] else "fail",',
    '                              {"pass": "emit_deliverable", "fail": "compensate_and_escalate"})',
    'builder.add_edge("emit_deliverable", END)',
    'builder.add_edge("compensate_and_escalate", END)',
    "",
    "graph = builder.compile(checkpointer=MemorySaver())",
  );
  return out.join("\n");
}

// ---------------------------------------------------------------- AWS
export function emitAws(c: CaseAST | undefined): string {
  if (!c) return "{}";
  const states: Record<string, unknown> = {};
  const order: string[] = [];
  states.PreFlightGate = {
    Type: "Task",
    Resource: "arn:aws:states:::lambda:invoke",
    Parameters: { FunctionName: "casespine-preflight-gate", "Payload.$": "$" },
    ResultPath: "$.preflight",
    Next: "",
  };
  order.push("PreFlightGate");
  c.stages.forEach((st, si) => {
    const name = `Stage${si + 1}_${ident(st.name).slice(0, 40)}`;
    const usesAgent = st.steps.some((s) => classifyStep(s.norm).some((k) => k.kind === "synth"));
    states[name] = usesAgent
      ? {
          Type: "Task",
          Comment: st.steps.map((s) => s.text).join(" · ").slice(0, 240),
          Resource: "arn:aws:states:::aws-sdk:bedrockagentruntime:invokeAgent",
          Parameters: {
            AgentId: "${BedrockAgentId}",
            AgentAliasId: "${BedrockAgentAliasId}",
            "SessionId.$": "$$.Execution.Name",
            "InputText.$": "$.inquiry",
          },
          ResultPath: `$.stage${si + 1}`,
          Next: "",
        }
      : {
          Type: "Task",
          Comment: st.steps.map((s) => s.text).join(" · ").slice(0, 240),
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: `casespine-${kebab(st.name).slice(0, 40)}`, "Payload.$": "$" },
          ResultPath: `$.stage${si + 1}`,
          Next: "",
        };
    order.push(name);
  });
  states.LeanReferenceMonitor = {
    Type: "Task",
    Resource: "arn:aws:states:::lambda:invoke",
    Parameters: { FunctionName: "casespine-lean-reference-monitor", "Payload.$": "$", },
    ResultSelector: { "verdict.$": "$.Payload.verdict" },
    ResultPath: "$.gate",
    Next: "ContractHolds",
  };
  order.push("LeanReferenceMonitor");
  for (let i = 0; i < order.length - 1; i++) (states[order[i]] as { Next: string }).Next = order[i + 1];
  const esc = c.stages.map((s) => s.escalateTo).filter(Boolean).pop() ?? "Case Owner";
  states.ContractHolds = {
    Type: "Choice",
    Choices: [{ Variable: "$.gate.verdict", BooleanEquals: true, Next: "EmitDeliverable" }],
    Default: "EscalateToHuman",
  };
  states.EmitDeliverable = {
    Type: "Task",
    Resource: "arn:aws:states:::dynamodb:putItem",
    Parameters: { TableName: "casespine-audit-ledger", Item: { pk: { "S.$": "$$.Execution.Id" }, event: { S: "EMIT" }, deliverable: { S: c.deliverable ?? "Verified_Output" } } },
    End: true,
  };
  states.EscalateToHuman = {
    Type: "Task",
    Comment: `Durable escalation to ${esc}`,
    Resource: "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
    Parameters: { QueueUrl: "${EscalationQueueUrl}", MessageBody: { lane: esc, "taskToken.$": "$$.Task.Token", "case.$": "$" } },
    TimeoutSeconds: 14400,
    Next: "EmitDeliverable",
  };
  const asl = {
    Comment: `CaseSpine v5 · ${c.name} · namespace ${c.namespacePath} · isolation ${c.isolationHash}`,
    StartAt: "PreFlightGate",
    States: states,
  };
  const piiMap: Record<string, string> = {
    UAE_IBAN: "INTERNATIONAL_BANK_ACCOUNT_NUMBER",
    EMAIL: "EMAIL",
    PHONE_UAE: "PHONE",
    CARD_PAN: "CREDIT_DEBIT_CARD_NUMBER",
    PASSPORT: "US_PASSPORT_NUMBER",
  };
  const entities = [...new Set(c.caseFiles.flatMap((f) => f.redact))];
  const guardrail = {
    name: `casespine-${kebab(c.name).slice(0, 40)}`,
    blockedInputMessaging: "Blocked by CaseSpine pre-flight gate.",
    blockedOutputsMessaging: "Withheld by the Lean 4 reference monitor.",
    topicPolicyConfig: {
      topicsConfig: c.guards.bannedTopics.map((t) => ({ name: kebab(t).slice(0, 100), definition: `Requests about ${t}.`, type: "DENY" })),
    },
    sensitiveInformationPolicyConfig: {
      piiEntitiesConfig: entities.filter((e) => piiMap[e]).map((e) => ({ type: piiMap[e], action: "ANONYMIZE" })),
      regexesConfig: entities.includes("EMIRATES_ID")
        ? [{ name: "emirates-id", pattern: "784-?\\d{4}-?\\d{7}-?\\d", action: "ANONYMIZE" }]
        : [],
    },
  };
  return (
    `// aws_stepfunctions_bedrock.asl.json\n${JSON.stringify(asl, null, 2)}\n\n` +
    `// aws_bedrock_guardrail.json (compiled from Banned Topics + Case File curation)\n${JSON.stringify(guardrail, null, 2)}`
  );
}

// ---------------------------------------------------------------- GCP
export function emitGcp(c: CaseAST | undefined): string {
  if (!c) return "";
  const out = [
    `# gcp_cloud_workflows.yaml — CaseSpine v5 · ${c.name}`,
    "main:",
    "  params: [input]",
    "  steps:",
    "    - init:",
    "        assign:",
    `          - budget_tokens: ${c.guards.budgetTokens}`,
    `          - namespace: ${yq(c.namespacePath)}`,
    "    - preflight_gate:",
    "        call: http.post",
    "        args:",
    '          url: ${sys.get_env("PREFLIGHT_URL")}',
    "          auth: { type: OIDC }",
    "          body: ${input}",
    "        result: preflight",
  ];
  c.stages.forEach((st, si) => {
    out.push(
      `    - stage_${si + 1}_${snake(st.name).slice(0, 30)}:`,
      "        call: http.post",
      "        args:",
      `          url: \${sys.get_env("STAGE_${si + 1}_URL")}  # Vertex AI Agent Engine (ReasoningEngine) or Cloud Run`,
      "          auth: { type: OIDC }",
      "          body: ${input}",
      `        result: stage_${si + 1}`,
    );
  });
  const esc = c.stages.map((s) => s.escalateTo).filter(Boolean).pop() ?? "Case Owner";
  out.push(
    "    - lean_reference_monitor:",
    "        call: http.post",
    "        args:",
    '          url: ${sys.get_env("LEAN_MONITOR_URL")}',
    "          auth: { type: OIDC }",
    "          body: ${input}",
    "        result: gate",
    "    - route:",
    "        switch:",
    "          - condition: ${gate.body.verdict == true}",
    "            next: emit",
    "        next: escalate",
    "    - escalate:",
    "        call: events.create_callback_endpoint",
    "        args: { http_callback_method: POST }",
    "        result: callback",
    "    - notify_lane:",
    "        call: http.post",
    "        args:",
    '          url: ${sys.get_env("ESCALATION_URL")}',
    `          body: { lane: ${yq(esc)}, callback: \${callback.url} }`,
    "    - await_human:",
    "        call: events.await_callback",
    "        args: { callback: ${callback}, timeout: 14400 }",
    "    - emit:",
    "        call: googleapis.bigquery.v2.jobs.insert",
    "        args:",
    '          projectId: ${sys.get_env("GOOGLE_CLOUD_PROJECT_ID")}',
    "          body:",
    "            configuration:",
    "              query:",
    `                query: ${yq("INSERT INTO casespine.audit_ledger (namespace, event) VALUES ('" + c.namespacePath + "', 'EMIT')")}`,
    "                useLegacySql: false",
    "    - done:",
    "        return: ${gate.body}",
  );
  return out.join("\n");
}

// ---------------------------------------------------------------- Databricks
export function emitDatabricks(c: CaseAST | undefined): string {
  if (!c) return "";
  const job = snake(c.name).slice(0, 40);
  const catalog = "casespine";
  const schema = snake(c.namespacePath.split("/").pop() ?? c.name).slice(0, 40);
  const out = [
    "# databricks.yml — Databricks Asset Bundle compiled by CaseSpine v5",
    "bundle:",
    `  name: ${job}`,
    "",
    "resources:",
    "  jobs:",
    `    ${job}:`,
    `      name: "[CaseSpine] ${c.name}"`,
    "      tags:",
    `        casespine_namespace: ${yq(c.namespacePath)}`,
    `        casespine_isolation: ${yq(c.isolationHash)}`,
    "      tasks:",
  ];
  let prev: string | null = null;
  c.stages.forEach((st, si) => {
    const key = `stage_${si + 1}_${snake(st.name).slice(0, 30)}`;
    out.push(`        - task_key: ${key}`);
    if (prev) out.push("          depends_on:", `            - task_key: ${prev}`);
    out.push(
      "          python_wheel_task:",
      "            package_name: casespine_runtime",
      "            entry_point: run_stage",
      `            parameters: ["--case", ${yq(c.namespacePath)}, "--stage", "${si + 1}"]`,
      "          environment_key: casespine",
    );
    prev = key;
  });
  out.push(
    "        - task_key: lean_reference_monitor",
    ...(prev ? ["          depends_on:", `            - task_key: ${prev}`] : []),
    "          python_wheel_task:",
    "            package_name: casespine_runtime",
    "            entry_point: reference_monitor",
    "          environment_key: casespine",
    "      environments:",
    "        - environment_key: casespine",
    "          spec:",
    '            client: "1"',
    "            dependencies: [casespine-runtime]",
    "",
    "  schemas:",
    `    ${schema}:`,
    `      catalog_name: ${catalog}`,
    `      name: ${schema}`,
    `      comment: "Unity Catalog isolation for ${c.namespacePath}"`,
    "",
    "targets:",
    "  dev:",
    "    mode: development",
    "    default: true",
    "  prod:",
    "    mode: production",
  );
  return out.join("\n");
}

// ---------------------------------------------------------------- Kubernetes
export function emitK8s(c: CaseAST | undefined): string {
  if (!c) return "";
  const ns = `cs-${c.isolationHash}`;
  const app = kebab(c.name).slice(0, 40);
  const minReplicas = c.guards.downscaling ? 0 : 1;
  return [
    `# k8s_keda_envoy_ccu.yaml — CaseSpine v5 · ${c.name}`,
    "apiVersion: v1",
    "kind: Namespace",
    "metadata:",
    `  name: ${ns}`,
    "  labels:",
    `    casespine.io/case: ${app}`,
    "---",
    "# Non-interference isolation: pods talk only inside their case namespace.",
    "apiVersion: networking.k8s.io/v1",
    "kind: NetworkPolicy",
    "metadata:",
    "  name: casespine-non-interference",
    `  namespace: ${ns}`,
    "spec:",
    "  podSelector: {}",
    "  policyTypes: [Ingress, Egress]",
    "  ingress:",
    "    - from: [{ podSelector: {} }]",
    "  egress:",
    "    - to: [{ podSelector: {} }]",
    "---",
    "# Downscaling lever: scale to zero when idle; AIMD admission happens in the runtime.",
    "apiVersion: keda.sh/v1alpha1",
    "kind: ScaledObject",
    "metadata:",
    `  name: ${app}-orchestrator`,
    `  namespace: ${ns}`,
    "spec:",
    `  scaleTargetRef: { name: ${app}-orchestrator }`,
    `  minReplicaCount: ${minReplicas}`,
    "  maxReplicaCount: 20",
    "  cooldownPeriod: 900",
    "  triggers:",
    "    - type: prometheus",
    "      metadata:",
    "        serverAddress: http://prometheus.monitoring:9090",
    `        query: sum(rate(casespine_admitted_requests_total{namespace="${ns}"}[1m]))`,
    `        threshold: "${c.guards.rateLimit?.n ?? 30}"`,
  ].join("\n");
}

// ---------------------------------------------------------------- IR
export function emitIR(r: CompileResult) {
  return {
    casespine: "5.0",
    language: r.language,
    fields: Object.fromEntries(r.fields),
    cases: r.cases.map((c) => ({
      kind: c.kind,
      name: c.name,
      namespace_path: c.namespacePath,
      isolation_hash: c.isolationHash,
      archetype: c.archetype ?? null,
      deliverable: c.deliverable ?? null,
      engines: c.engines,
      population_segment: c.population,
      budget: { tokens: c.guards.budgetTokens, usd: c.guards.budgetUsd },
      guards: {
        preflight: c.guards.preflight ?? null,
        rate_limit: c.guards.rateLimit ?? null,
        allowed_topics: c.guards.allowedTopics,
        banned_topics: c.guards.bannedTopics,
        model_ladder: c.guards.modelLadder ?? null,
        downscaling: c.guards.downscaling?.text ?? null,
        value_per_outcome_usd: c.guards.valuePerOutcomeUsd ?? null,
        target_roi: c.guards.targetRoi ?? null,
      },
      lanes: c.lanes,
      case_files: c.caseFiles.map((f) => ({ name: f.name, sources: f.sources, namespace: f.namespace, redact: f.redact, coherence: f.coherence })),
      theorem_packs: c.theoremPacks,
      rules: c.rules.map((x) => ({
        id: x.id,
        text: x.raw,
        modality: x.modality,
        milestone: x.milestone,
        inherited: x.inherited,
        negated: x.negated,
        clauses: x.clauses,
        lean4: x.lean,
        smt2: x.smt2,
      })),
      stages: c.stages.map((s) => ({
        name: s.name,
        when: s.when,
        steps: s.steps.map((x) => x.text),
        escalate_to: s.escalateTo ?? null,
        milestone: s.milestone,
        exit_gateway: s.gate ?? null,
      })),
      config: c.config,
      deployment: c.deployment,
      actuators: c.actuators,
      satisfiable: c.satisfiable,
      witness: c.witness,
    })),
  };
}

export interface EmittedTarget {
  id: string;
  label: string;
  file: string;
  lang: "lean" | "smt" | "xml" | "python" | "json" | "yaml";
  code: string;
}

export function emitAll(r: CompileResult, focus?: CaseAST): EmittedTarget[] {
  const c = focus ?? r.cases.find((x) => x.stages.length) ?? r.root ?? undefined;
  return [
    { id: "lean", label: "Lean 4", file: "contracts/CaseSpine_Hierarchy.lean", lang: "lean", code: emitLean(r) },
    { id: "smt", label: "Z3", file: "contracts/CaseSpine_Z3.smt2", lang: "smt", code: emitSmt2(r) },
    { id: "langgraph", label: "LangGraph", file: "integrations/langgraph_case_graph.py", lang: "python", code: emitLangGraph(r, c) },
    { id: "bpmn", label: "BPMN 2.0", file: "process/CaseSpine_BPMN2_Zeebe.xml", lang: "xml", code: emitBpmn(r) },
    { id: "aws", label: "AWS", file: "integrations/aws_stepfunctions_bedrock.asl.json", lang: "json", code: emitAws(c) },
    { id: "gcp", label: "Google Cloud", file: "integrations/gcp_cloud_workflows.yaml", lang: "yaml", code: emitGcp(c) },
    { id: "databricks", label: "Databricks", file: "integrations/databricks_asset_bundle.yml", lang: "yaml", code: emitDatabricks(c) },
    { id: "k8s", label: "Kubernetes", file: "integrations/k8s_keda_envoy_ccu.yaml", lang: "yaml", code: emitK8s(c) },
    { id: "ir", label: "IR", file: "ir/compiled_case_manifest.json", lang: "json", code: JSON.stringify(emitIR(r), null, 2) },
  ];
}
