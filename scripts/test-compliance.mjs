import assert from "node:assert/strict";
import { createHandler } from "../server/compliance-worker.mjs";
import { checkEvidence, retrieve } from "../src/lib/compliance/policies.mjs";

const question = "Who approves a transfer above AED 200,000?";
const passages = retrieve(question, "synthetic");
assert.equal(passages[0].id, "demo-limits");
assert.equal(retrieve("Who approves model implementation?", "uae")[0].id, "cbuae-approval");
assert.equal(retrieve("What validation is required for Tier 1 models?", "uae")[0].id, "cbuae-validation");
assert.equal(retrieve("Who won the football match?", "uae").length, 0);
const claim = { text: "Two reviewers must approve.", source: passages[0].id, quote: passages[0].text };
assert.equal(checkEvidence({ claims: [claim] }, passages).length, 1);
assert.throws(() => checkEvidence({ claims: [{ ...claim, quote: "A fabricated passage that did not appear in the source." }] }, passages));
assert.throws(() => checkEvidence({ claims: [{ ...claim, source: "cbuae-approval" }] }, passages));
const origin = "https://noor-al-hikma-ai.github.io";
const request = (payload, caller = origin) => new Request("https://worker.example/ask", {
  method: "POST", headers: { Origin: caller, "Content-Type": "application/json" }, body: JSON.stringify(payload),
});
const allowed = { limit: async () => ({ success: true }) };
let modelCalls = 0;
const env = {
  COMPLIANCE_LIMITER: allowed, COMPLIANCE_EDGE_LIMITER: allowed,
  AI: { run: async (_model, input) => {
    modelCalls++;
    assert.ok(JSON.parse(input.messages[1].content).passages.every((passage) => passage.corpus === "synthetic"));
    return { response: JSON.stringify({ claims: [claim] }) };
  } },
};
const handle = createHandler();
const payload = { corpus: "synthetic", question };
assert.equal((await handle(request({ ...payload, upload: "PRIVATE" }), env)).status, 400);
assert.equal((await handle(request({ ...payload, corpus: "uae" }), env)).status, 400);
assert.equal((await handle(request(payload, "https://other.example"), env)).status, 403);
assert.equal((await handle(request(payload), {})).status, 503);
assert.equal((await handle(request(payload), { ...env, COMPLIANCE_LIMITER: { limit: async () => ({ success: false }) } })).status, 429);
assert.equal(modelCalls, 0);
const response = await handle(request(payload), env);
assert.equal(response.status, 200);
assert.equal((await response.json()).claims[0].source.id, "demo-limits");
assert.equal(modelCalls, 1);
const bad = await handle(request(payload), {
  ...env, AI: { run: async () => ({ response: { claims: [{ ...claim, source: "invented" }] } }) },
});
assert.equal(bad.status, 502);
console.log("Compliance retrieval, citation validation, endpoint boundaries, rate limit and rejection passed.");
