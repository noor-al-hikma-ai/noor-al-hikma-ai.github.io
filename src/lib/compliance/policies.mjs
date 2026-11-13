// Versioned, curated passages. Public entries are paraphrases of the linked articles.
export const policies = [
  { id: "demo-limits", corpus: "synthetic", title: "Demo Bank · Retail Wire Policy §3", text: "The daily branch limit is AED 200,000 per customer. Transfers above AED 200,000 require approval by the Branch Manager and a second reviewer from Retail Compliance." },
  { id: "demo-cutoff", corpus: "synthetic", title: "Demo Bank · Retail Wire Policy §2", text: "Domestic AED transfers submitted before 14:00 Gulf Standard Time on a UAE business day are processed the same day. Transfers submitted after 14:00 are processed on the next business day." },
  { id: "demo-sanctions", corpus: "synthetic", title: "Demo Bank · AML/CFT Procedures §1", text: "The sanctions list feed must be refreshed at least every four hours. If the feed is older than four hours, automated release is suspended and payments are queued for manual review." },
  { id: "demo-match", corpus: "synthetic", title: "Demo Bank · AML/CFT Procedures §2", text: "A potential sanctions match puts the payment on hold. A first reviewer assesses the alert within two hours. A second independent reviewer must confirm a decision to release or reject the payment." },
  { id: "demo-murabaha", corpus: "synthetic", title: "Demo Bank · Murabaha Product Manual §2", text: "The bank must own the commodity and take constructive possession before selling it to the customer. Evidence of ownership must be stored in the deal file." },
  { id: "cbuae-lifecycle", corpus: "uae", title: "CBUAE Model Management Standards · 4.3.1–4.3.2", url: "https://rulebook.centralbank.ae/en/rulebook/43-model-life-cycle", text: "The model life cycle covers development, pre-implementation validation, implementation, usage and monitoring, independent validation, and recalibration, redevelopment or retirement. The institution specifies and documents the duration and frequency of each step in advance for each model." },
  { id: "cbuae-validation", corpus: "uae", title: "CBUAE Model Management Standards · 6.10.1–6.10.3", url: "https://rulebook.centralbank.ae/en/rulebook/610-pre-implementation-validation", text: "Pre-implementation validation is the first independent validation after model development. Its depth depends on model materiality and Tier 1 models require comprehensive validation. The institution documents the model scope, limitations and assumptions." },
  { id: "cbuae-approval", corpus: "uae", title: "CBUAE Model Management Standards · 7.2.1", url: "https://rulebook.centralbank.ae/en/rulebook/72-project-governance", text: "Senior Management must approve model implementation. Implementation follows completion of model development and full approval of the model." },
  { id: "uae-data", corpus: "uae", title: "UAE Personal Data Protection Law · Article 5", url: "https://www.uaelegislation.gov.ae/en/legislations/1972/download", text: "Article 5 requires fair, transparent and lawful processing, a specific and clear purpose, and personal data limited to what the purpose requires. It also addresses accuracy, protection and retention." },
];

const stop = new Set("a an and are as at be before by can do does for from how i in is it me must of on or our should that the their they to up we what when where which who will with".split(" "));
const terms = (value) => [...new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter((word) => !stop.has(word)).map((word) => word.replace(/s$/, ""));
const index = policies.map((policy) => ({ policy, words: new Set(terms(policy.title + " " + policy.text)) }));

export function retrieve(question, corpus) {
  const query = [...new Set(terms(question))];
  const pool = index.filter(({ policy }) => policy.corpus === corpus);
  return pool.map(({ policy, words }) => ({
    policy,
    score: query.reduce((score, word) => score + (words.has(word) ? 1 / pool.filter((entry) => entry.words.has(word)).length : 0), 0),
  })).filter(({ score }) => score >= 0.65).sort((a, b) => b.score - a.score).slice(0, 3).map(({ policy }) => policy);
}

export function checkEvidence(value, passages) {
  if (!Array.isArray(value?.claims) || value.claims.length > 3) throw new Error("Invalid claims");
  return value.claims.map(({ text, source, quote }) => {
    const passage = passages.find(({ id }) => id === source);
    const normalize = (input) => input.replace(/\s+/g, " ").trim();
    if (!passage || typeof text !== "string" || !text.trim() || text.length > 600
      || typeof quote !== "string" || normalize(quote).length < 20
      || !normalize(passage.text).includes(normalize(quote))) throw new Error("Invalid citation");
    return { text, quote, source: passage };
  });
}
