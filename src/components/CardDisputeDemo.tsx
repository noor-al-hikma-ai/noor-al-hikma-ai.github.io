import { useMemo, useState } from "react";
import { compileSpec } from "../lib/casespine/analyze";
import { CARD_DISPUTE_BASE, cardDisputeExample } from "../lib/casespine/examples";
import { evalRule } from "../lib/casespine/rules";

export function CardDisputeDemo() {
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [step, setStep] = useState<"base" | "draft" | "revised">("base");
  const deadline = step === "revised" ? 72 : 48;
  const source = step === "base" ? CARD_DISPUTE_BASE : cardDisputeExample(deadline);
  const compiled = useMemo(() => compileSpec(source), [source]);
  const rules = compiled.cases.at(-1)?.rules ?? [];
  const sample = { reviewer1Id: 101, reviewer2Id: 202, evidenceAgeHours: 60 };
  const outcomes = rules.map((rule) => ({ rule, passed: evalRule(rule, sample) === true }));
  const ready = !compiled.diagnostics.some((d) => d.severity === "error")
    && outcomes.length > 0 && outcomes.every(({ passed }) => passed);

  return (
    <section id="case-demo" aria-labelledby="case-demo-title" style={{ scrollMarginTop: 80 }}>
      <h2 id="case-demo-title">Add a dispute workflow without rewriting the controls</h2>
      <p>Try a fictional card operations case. Start with a two-reviewer policy, then add a workflow for late deliveries.</p>
      <label>
        Business brief language{" "}
        <select value={language} onChange={(event) => setLanguage(event.target.value === "ar" ? "ar" : "en")}>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </label>
      {language === "ar" ? (
        <p lang="ar" dir="rtl">أضف حالة فرعية لنزاعات تأخر التسليم. اجمع أدلة التسليم خلال ٤٨ ساعة، واحتفظ بقاعدة المراجعين المستقلين، وصعّد الاستثناءات إلى مسؤول عمليات البطاقات.</p>
      ) : (
        <p>“Add a late delivery case. Use evidence up to 48 hours old, keep the two-reviewer rule, and send exceptions to the Card Operations Lead.”</p>
      )}
      <div className="cta-row" role="group" aria-label="Card dispute demo steps">
        <button className="btn btn-ghost" aria-pressed={step === "base"} onClick={() => setStep("base")}>1. Original case</button>
        <button className="btn btn-ghost" aria-pressed={step === "draft"} onClick={() => setStep("draft")}>2. Add a draft</button>
        <button className="btn btn-ghost" aria-pressed={step === "revised"} onClick={() => setStep("revised")}>3. Propose 72 hours</button>
      </div>
      <div aria-live="polite">
        <h3>{step === "base" ? "Original intake" : "Late delivery subcase"}</h3>
        {step === "revised" && <p>Proposed rule change from <del>48 hours</del> to <ins>72 hours</ins>.</p>}
        <p>Sample input has two different reviewers and evidence that is 60 hours old.</p>
        <ul>
          {outcomes.map(({ rule, passed }) => (
            <li key={rule.id}><strong>{passed ? "Pass" : "Fail"}</strong> · {rule.inherited ? "Inherited" : "Local"} · {rule.raw}</li>
          ))}
        </ul>
        <p><strong>{ready ? "Sample review packet is ready for human review." : "Sample exception goes to the Card Operations Lead."}</strong></p>
      </div>
      <details>
        <summary>View the compiled case source</summary>
        <pre className="cp-code">{source}</pre>
      </details>
      <p>The browser compiles the case and checks sample values. The bilingual brief illustrates how a business owner describes the change. In production, the institution connects its evidence sources and reviewer queue, tests the change, and approves the new deadline before release.</p>
      <a className="btn btn-ghost" href="#/studio">Open Studio and choose “Card dispute · Review packet”</a>
    </section>
  );
}
