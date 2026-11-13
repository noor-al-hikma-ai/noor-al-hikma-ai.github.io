import { useRef, useState } from "react";
import { checkEvidence, policies, retrieve, type Claim, type Passage } from "../lib/compliance/policies.mjs";

const endpoint = import.meta.env.VITE_COMPLIANCE_ENDPOINT?.trim();
const samples = {
  synthetic: [
    "Who approves a transfer above AED 200,000?",
    "How often must the sanctions feed be refreshed?",
    "Can Demo Bank sell the commodity before it owns it?",
  ],
  uae: [
    "Who approves model implementation?",
    "What validation is required for Tier 1 models?",
    "Is there a six-month model implementation timeline?",
    "What personal data can be collected for a specific purpose?",
  ],
};

type Result = { mode: "live" | "search" | "no-source"; claims: Claim[]; elapsed: number; model?: string };

export default function Compliance() {
  const [corpus, setCorpus] = useState<Passage["corpus"]>("synthetic");
  const [live, setLive] = useState(Boolean(endpoint));
  const [question, setQuestion] = useState(samples.synthetic[0]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function ask(value: string) {
    const query = value.trim();
    if (inFlight.current || query.length < 6 || query.length > 400) return;
    inFlight.current = true;
    setQuestion(query);
    setError("");
    setResult(null);
    const start = performance.now();
    try {
      const passages = retrieve(query, corpus);
      if (!live || corpus === "uae" || !endpoint) {
        setResult({
          mode: passages.length ? "search" : "no-source",
          claims: passages.map((source) => ({ source, text: source.text, quote: source.text })),
          elapsed: performance.now() - start,
        });
        return;
      }
      setBusy(true);
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, corpus: "synthetic" }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error("Live generation is unavailable right now. Choose Policy search to see the source passages.");
      const claims = checkEvidence({
        claims: data.claims.map((claim: Claim) => ({ ...claim, source: claim.source.id })),
      }, passages);
      if (data.mode !== "live" && data.mode !== "no-source") throw new Error("Unexpected response.");
      setResult({ mode: data.mode, claims, elapsed: performance.now() - start, model: data.model });
    } catch {
      setError("Live generation could not return a cited answer. Retry or choose Policy search.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <article className="paper">
      <h1>Compliance policy demo</h1>
      <p className="lede">Ask about fictional Demo Bank policies or search a curated index of UAE regulatory passages. Open a source to check the evidence.</p>
      <div className="cta-row">
        <label>Policy collection{" "}
          <select value={corpus} disabled={busy} onChange={(event) => {
            const next = event.target.value as Passage["corpus"];
            setCorpus(next);
            setQuestion(samples[next][0]);
            setResult(null);
            setError("");
          }}>
            <option value="synthetic">Fictional Demo Bank</option>
            <option value="uae">Public UAE regulations</option>
          </select>
        </label>
        {corpus === "synthetic" && endpoint && (
          <label>Answer mode{" "}
            <select value={live ? "live" : "search"} disabled={busy} onChange={(event) => {
              setLive(event.target.value === "live");
              setResult(null);
              setError("");
            }}>
              <option value="live">Live LLM</option>
              <option value="search">Policy search</option>
            </select>
          </label>
        )}
      </div>
      <p className="muted">{corpus === "synthetic" && endpoint && live
        ? "This mode sends your question and relevant fictional policy passages to the model service. Use fictional details only."
        : "Policy search runs in your browser and shows matching passages. UAE entries are short summaries linked to the official text."}</p>
      <form className="cta-row" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
        <label style={{ flex: "1 1 280px" }}>Policy question
          <input value={question} onChange={(event) => setQuestion(event.target.value)}
            disabled={busy} maxLength={400} style={{ display: "block", width: "100%", padding: 10 }} />
        </label>
        <button className="btn btn-emerald" style={{ alignSelf: "end" }} disabled={busy || question.trim().length < 6}>
          {busy ? "Checking sources…" : "Ask"}
        </button>
      </form>
      <div className="cta-row" aria-label="Example questions">
        {samples[corpus].map((sample) => (
          <button key={sample} className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void ask(sample)}>{sample}</button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <section aria-live="polite" data-testid="policy-result">
        {result && <>
          <h2>{result.mode === "live" ? "Live model answer" : result.mode === "search" ? "Matching policy passages" : "No matching evidence"}</h2>
          <p className="muted">{Math.round(result.elapsed)} ms {result.mode === "live" ? "request to response" : "local lookup"}{result.model ? ` · ${result.model}` : ""}</p>
          {!result.claims.length && <p>The selected collection did not supply evidence for an answer. Try a different question or check the source list.</p>}
          <ol>
            {result.claims.map((claim, i) => (
              <li key={claim.source.id + i}>
                <p>{claim.text}</p>
                <details>
                  <summary>{claim.source.title}</summary>
                  {result.mode === "live" && <blockquote>{claim.quote}</blockquote>}
                  {claim.source.url && <a href={claim.source.url} target="_blank" rel="noreferrer">Open the official source</a>}
                </details>
              </li>
            ))}
          </ol>
        </>}
      </section>
      <details>
        <summary>Sources in this collection</summary>
        <ul>{policies.filter((policy) => policy.corpus === corpus).map((policy) => (
          <li key={policy.id}>{policy.url ? <a href={policy.url} target="_blank" rel="noreferrer">{policy.title}</a> : policy.title}</li>
        ))}</ul>
      </details>
      <p style={{ marginTop: 24 }}>To work with your own files, <a href="#/sandbox">use the browser-only document Sandbox</a>.</p>
    </article>
  );
}
