import { useEffect, useRef, useState } from "react";
import { highlightCaseSpine } from "./highlight";
import { contactHref } from "../config";
import "./storydeck.css";

// The landing narrative as slides: Mariam's question, then the seven steps
// from plain words to a governed system, ending in a call to action.

function Code({ src, lean }: { src: string; lean?: boolean }) {
  return <pre className={`sd-code${lean ? " lean" : ""}`} dangerouslySetInnerHTML={{ __html: highlightCaseSpine(src) }} />;
}

interface Slide {
  kicker: string;
  title: string;
  text: string;
  visual: () => React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    kicker: "The question",
    title: "Mariam has a question worth AED 2 million",
    text: "A new buyer wants goods on 90-day terms. The answer lives in a credit policy, a Sharia manual, a limits table and a sanctions list. Here is how Noor turns a question like hers into a working, governed system — in seven steps.",
    visual: () => (
      <div className="sd-chat">
        <div className="sd-bubble ar" lang="ar">هل يمكننا بيع بضائع بقيمة مليوني درهم لمشترٍ جديد بأجل ٩٠ يومًا؟</div>
        <div className="sd-bubble en">Can we sell AED 2 million of goods to a new buyer on 90-day terms?</div>
      </div>
    ),
  },
  {
    kicker: "Step 1",
    title: "Describe it in plain words",
    text: "Open the Studio, press ✨ and brief Noor as you would brief a new colleague. Copilot drafts the whole case and asks only about what it could not infer.",
    visual: () => (
      <div className="sd-stack">
        <div className="sd-quote">“Our relationship managers check if a client can get Murabaha financing, based on our Sharia manual and credit policy. Reviewed by the Chief Risk Officer, at most 20 cents per question, within 3 seconds.”</div>
        <div className="sd-arrow">↓ Copilot · 52 lines · 5 rules · compiles</div>
      </div>
    ),
  },
  {
    kicker: "Step 2",
    title: "Read it like a policy",
    text: "The draft reads like a memo your risk committee can sign — in English or Arabic. Each line is something a person decided.",
    visual: () => (
      <Code
        src={`Case: Murabaha Credit Check
Lanes:
  Relationship Managers:
    SSO Provider: Microsoft Entra ID
  Chief Risk Officer:
    Roles: [HITM_APPROVER]
Case File:
  Sharia Manual:
    Source: pdf("sharia_manual.pdf", "credit_policy.pdf")
    Curation: redact [UAE_IBAN, EMIRATES_ID]`}
      />
    ),
  },
  {
    kicker: "Step 3",
    title: "Rules become proofs",
    text: "Write obligations the way you say them. Each one becomes a Lean 4 proof obligation — nothing leaves the system unless every rule holds.",
    visual: () => (
      <div className="sd-stack">
        <Code src={`Rules:
  - It is obligatory that bank owns underlying asset
    and debt to asset ratio <= 33.0% before Milestone Approved.`} />
        <div className="sd-arrow">↓ compiled</div>
        <Code lean src={`def ProcessContract (s : ProcessCaseState) : Prop :=
  s.bankOwnsAsset = true ∧ s.debtToAssetMillipoints ≤ 330
example : ProcessContract witness := by decide`} />
      </div>
    ),
  },
  {
    kicker: "Step 4",
    title: "Put a ceiling on cost",
    text: "A budget is a rule too. Junk questions are blocked for free, models step down as the budget shrinks, and nothing ever runs past the ceiling.",
    visual: () => (
      <div className="sd-stack">
        <Code src={`Cost & Traffic Guards:
  Budget Ceiling: 8000 tokens or $0.20
  Banned Topics: [investment advice]
  Model Ladder: [large, medium, small] when budget remaining < 40%`} />
        <div className="sd-meter"><i style={{ width: "15%" }} /><span>3 fils used of 20 cents</span></div>
      </div>
    ),
  },
  {
    kicker: "Step 5",
    title: "Tune any part — without code",
    text: "Every building block has settings. Change them in the text, or click the block in the picture and move a slider — both stay in sync.",
    visual: () => (
      <div className="sd-split">
        <Code src={`Config:
  Retriever: { Mode: hybrid, Top K: 4 }
  Synthesizer: { Max Sentences: 3, Language: ar }
  Escalation: { Channel: teams, SLA Hours: 4 }`} />
        <div className="sd-inspector">
          <b>Retriever</b>
          <label>Top K <span>4</span></label>
          <div className="sd-slider"><i style={{ width: "40%" }} /></div>
          <label>Mode <span>hybrid ▾</span></label>
        </div>
      </div>
    ),
  },
  {
    kicker: "Step 6",
    title: "Ask — and get the proof",
    text: "Answers arrive with citations to the exact page, the rules they satisfied and what they cost. If Noor is unsure, a named person decides.",
    visual: () => (
      <div className="sd-answer">
        <div className="sd-badge">✓ Verified · 2.1 s · 3 fils</div>
        <p>Yes — up to AED 2.0 million on 90-day terms, if the goods are owned before sale and the buyer passes screening. <span className="sd-cite">[1]</span> <span className="sd-cite">[2]</span></p>
        <div className="sd-cites"><span>[1] Credit policy §3</span><span>[2] Murabaha manual §2</span></div>
      </div>
    ),
  },
  {
    kicker: "Step 7",
    title: "Deploy inside your walls",
    text: "One file runs in your bank's cloud or data centre, signs in with your identity provider and registers with your data catalog. Nothing leaves the UAE.",
    visual: () => (
      <div className="sd-stack">
        <Code src={`Deployment:
  Cloud: azure://uaenorth
  Residency: UAE
  Identity: [Microsoft Entra ID, UAE PASS]
  Data Governance: [Collibra, Unity Catalog]`} />
        <div className="sd-chips">
          {["Azure UAE", "AWS me-central-1", "Core42", "On-premises", "UAE PASS", "Entra ID"].map((c) => <span key={c}>{c}</span>)}
        </div>
      </div>
    ),
  },
  {
    kicker: "Your turn",
    title: "Try it on your own question",
    text: "Start in the browser — no sign-up, nothing uploaded. Or let us run a two-week pilot on your documents.",
    visual: () => (
      <div className="sd-cta">
        <a className="btn btn-gold" href="#/studio">✨ Describe your case</a>
        <a className="btn btn-emerald" href="#/sandbox">Ask your documents</a>
        <a className="btn btn-primary" href={contactHref("Noor Al Hikma AI — demo")}>Book a 20-minute demo</a>
      </div>
    ),
  },
];

export function StoryDeck({ fullscreen, start = 0, onIndex }: { fullscreen?: boolean; start?: number; onIndex?: (i: number) => void }) {
  const [i, setI] = useState(Math.max(0, Math.min(SLIDES.length - 1, start)));
  const touch = useRef<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const n = SLIDES.length;
  const go = (k: number) => {
    const next = Math.max(0, Math.min(n - 1, k));
    setI(next);
    onIndex?.(next);
  };
  useEffect(() => setI(Math.max(0, Math.min(n - 1, start))), [start, n]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (!fullscreen && !root.current?.matches(":hover, :focus-within")) return;
      if (["ArrowRight", "PageDown"].includes(e.key) || (fullscreen && e.key === " ")) {
        e.preventDefault();
        go(i + 1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(i - 1);
      } else if (fullscreen && e.key === "Escape") window.location.hash = "/";
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const s = SLIDES[i];
  return (
    <div
      ref={root}
      className={`sd${fullscreen ? " full" : ""}`}
      tabIndex={-1}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
    >
      <div className="sd-progress"><i style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
      <div className="sd-slide" key={i}>
        <div className="sd-text">
          <div className="sd-kicker">{s.kicker}</div>
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </div>
        <div className="sd-visual">{s.visual()}</div>
      </div>
      <div className="sd-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous step">←</button>
        <div className="sd-dots">
          {SLIDES.map((x, k) => (
            <button key={k} className={k === i ? "on" : k < i ? "past" : ""} onClick={() => go(k)} aria-label={`${x.kicker}: ${x.title}`} />
          ))}
        </div>
        <span className="sd-count">{i + 1} / {n}</span>
        <button className="btn btn-emerald btn-sm" onClick={() => go(i + 1)} disabled={i === n - 1} aria-label="Next step">Next →</button>
      </div>
    </div>
  );
}
