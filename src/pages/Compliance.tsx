import { useRef, useState } from "react";
import { checkEvidence, policies, retrieve, type Claim, type Passage } from "../lib/compliance/policies.mjs";
import { requestLiveModel } from "../lib/liveModel";

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

type ModelResult = { mode: "live" | "no-source"; claims: Claim[]; model?: string };
type Result = { source: "model" | "index"; claims: Claim[]; elapsed: number; model?: string; fallback?: boolean };

function isModelResult(value: unknown): value is ModelResult {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ModelResult>;
  return (data.mode === "live" || data.mode === "no-source") && Array.isArray(data.claims)
    && (data.model === undefined || typeof data.model === "string");
}

export default function Compliance() {
  const [corpus, setCorpus] = useState<Passage["corpus"]>("synthetic");
  const [live, setLive] = useState(Boolean(endpoint));
  const [question, setQuestion] = useState(samples.synthetic[0]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function ask(value: string) {
    const query = value.trim();
    if (inFlight.current || query.length < 6 || query.length > 400) return;
    inFlight.current = true;
    setQuestion(query);
    setResult(null);
    const start = performance.now();
    const passages = retrieve(query, corpus);
    const lookupMs = performance.now() - start;
    const showPassages = (fallback = false) => setResult({
      source: "index",
      claims: passages.map((source) => ({ source, text: source.text, quote: source.text })),
      elapsed: lookupMs,
      fallback,
    });
    try {
      if (!live || corpus === "uae" || !endpoint) {
        showPassages();
        return;
      }
      setBusy(true);
      const data = await requestLiveModel(endpoint, { question: query, corpus: "synthetic" });
      if (!isModelResult(data)) {
        showPassages(true);
        return;
      }
      const claims = checkEvidence({
        claims: data.claims.map((claim: Claim) => ({ ...claim, source: claim.source.id })),
      }, passages);
      setResult({ source: "model", claims, elapsed: performance.now() - start, model: data.model });
    } catch {
      showPassages(true);
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
      <section aria-live="polite" data-testid="policy-result">
        {result && <>
          <h2>{!result.claims.length ? "No matching evidence" : result.source === "model" ? "Live model answer" : "Matching policy passages"}</h2>
          <p className="muted">{result.fallback
            ? "Live answer unavailable. Searched the local policy index."
            : <>{Math.round(result.elapsed)} ms {result.source === "model" ? "request to response" : "local lookup"}{result.model ? ` · ${result.model}` : ""}</>}</p>
          {!result.claims.length && <p>The selected collection did not supply evidence for an answer. Try a different question or check the source list.</p>}
          <ol>
            {result.claims.map((claim, i) => (
              <li key={claim.source.id + i}>
                <p>{result.source === "index" && <strong>{claim.source.title}. </strong>}{claim.text}</p>
                {result.source === "model" && <details>
                  <summary>{claim.source.title}</summary>
                  <blockquote>{claim.quote}</blockquote>
                </details>}
                {claim.source.url && <a href={claim.source.url} target="_blank" rel="noreferrer">Open the official source</a>}
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
