import { useEffect, useMemo, useRef, useState } from "react";
import { draftFromDescription, EXAMPLE_DESCRIPTIONS, type SlotId } from "../lib/casespine/copilot";
import { highlightCaseSpine } from "./highlight";

interface Props {
  open: boolean;
  onClose: () => void;
  onUse: (spec: string, name: string) => void;
}

export function CopilotPanel({ open, onClose, onUse }: Props) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [answers, setAnswers] = useState<Partial<Record<SlotId, string>>>({});
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 250);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    if (open) setTimeout(() => area.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const draft = useMemo(() => (debounced.trim() ? draftFromDescription(debounced, answers) : null), [debounced, answers]);
  if (!open) return null;

  return (
    <div className="cp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cp" role="dialog" aria-modal="true" aria-label="Describe your case in plain words">
        <div className="cp-head">
          <div>
            <div className="label" style={{ color: "var(--gold)" }}>CaseSpine Copilot</div>
            <h2>Describe your case in plain words</h2>
            <p className="muted">English or Arabic. Say who asks, which documents, what must never happen, what an answer may cost and who decides when unsure.</p>
          </div>
          <button className="cv-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="cp-body">
          <div className="cp-left">
            <textarea
              ref={area}
              rows={7}
              value={text}
              placeholder="e.g. Our branch staff need quick answers from our card dispute procedures. Never reveal IBANs, never give legal advice, at most 5 cents per answer, escalate to the Head of Card Operations."
              onChange={(e) => setText(e.target.value)}
              dir={/[؀-ۿ]/.test(text) ? "rtl" : "ltr"}
            />
            <div className="cp-examples">
              <span className="muted">Try:</span>
              {EXAMPLE_DESCRIPTIONS.map((d, i) => (
                <button key={i} className="chip" onClick={() => { setAnswers({}); setText(d); }}>
                  {["Card disputes", "Murabaha check", "Fleet dispatch"][i]}
                </button>
              ))}
            </div>
            {draft && draft.tips.length > 0 && (
              <div className="cp-tips">
                <b>{draft.completeness < 0.5 ? "Reconsider your description" : "To make it sharper"}</b>
                <ul>{draft.tips.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
            {draft && draft.questions.length > 0 && (
              <div className="cp-qs">
                {draft.questions.map((q) => (
                  <div key={q.id} className="cp-q">
                    <span>{q.q}</span>
                    <div>
                      {q.options.map((o) => (
                        <button key={o} className={`chip${answers[q.id] === o ? " emerald" : ""}`} onClick={() => setAnswers({ ...answers, [q.id]: o })}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {draft && (
              <table className="cp-assume">
                <tbody>
                  {draft.assumptions.map((a) => (
                    <tr key={a.label}>
                      <td className={a.detected ? "ok" : "guess"} title={a.detected ? "Understood from your words" : "Assumed — answer the question above to change it"}>{a.detected ? "✓" : "?"}</td>
                      <td>{a.label}</td>
                      <td>{a.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="cp-right">
            {draft ? (
              <>
                <div className="cp-status">
                  <span className={`chip ${draft.compiles ? "emerald" : "danger"}`}>{draft.compiles ? `Compiles · ${draft.rules} rules → Lean 4` : "Needs attention"}</span>
                  <span className="chip">{Math.round(draft.completeness * 100)}% understood</span>
                </div>
                <pre className="cp-code" dangerouslySetInnerHTML={{ __html: highlightCaseSpine(draft.spec) }} />
              </>
            ) : (
              <div className="cp-empty">
                <b>Your draft appears here as you type.</b>
                <span>Nothing leaves your browser.</span>
              </div>
            )}
          </div>
        </div>
        <div className="cp-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-emerald" disabled={!draft} onClick={() => draft && onUse(draft.spec, draft.name)}>
            Use this draft →
          </button>
        </div>
      </div>
    </div>
  );
}
