import { Academy, CareerRadar, CaseClinic, DeliveryPlan, FineTuneLab, MiniDashboard, OpportunityRadar } from "../components/ServiceWidgets";
import { contactHref, SITE } from "../config";

const SERVICES = [
  {
    id: "discovery",
    title: "AI Value Discovery Sprint",
    ar: "سباق اكتشاف القيمة",
    pitch: "Find the AI cases worth funding — in ten days, before a single licence is bought.",
    gets: ["Interviews with business, risk, data and IT owners", "A ranked portfolio of use cases by value, feasibility and data readiness", "Draft CaseSpine programs and an ROI model for the top three", "A board-ready readout with go / no-go criteria"],
    format: ["10 working days", "On-site or remote", "Fixed fee"],
    Widget: OpportunityRadar,
    caption: "Pick a business domain; click a bubble to see what the sprint validates.",
  },
  {
    id: "clinic",
    title: "AI Case Clinic",
    ar: "عيادة حالات الذكاء الاصطناعي",
    pitch: "Bring your hardest AI question. Leave with a written answer, a risk map and a compiled case.",
    gets: ["Your problem, data and constraints reviewed by a former bank Head of AI", "A written answer memo with options, risks and costs", "A CaseSpine draft you can run in the sandbox", "A follow-up session to stress-test the plan with your team"],
    format: ["72-hour turnaround", "Single case or retainer", "NDA by default"],
    Widget: CaseClinic,
    caption: "Describe the case in plain words — the CaseSpine draft compiles live. Open it in the Studio to keep going.",
  },
  {
    id: "turnkey",
    title: "Turnkey AI Delivery",
    ar: "تسليم الحلول المتكاملة",
    pitch: "From signed business case to a governed application running in your tenancy — with the evidence your reviewers need.",
    gets: ["CaseSpine authoring with your business and risk owners", "Integration with SSO, data catalogs, core systems and your cloud", "Lean-gated verification, red-teaming and model-risk documentation", "Go-live, hypercare and knowledge transfer to your teams"],
    format: ["8–20 weeks", "Fixed scope or outcome-based", "Your cloud or on-prem"],
    Widget: DeliveryPlan,
    caption: "Toggle scope to see an indicative plan. Verification overlaps build because contracts exist from day one.",
  },
  {
    id: "dashboards",
    title: "ROI Dashboards & Decision Analytics",
    ar: "لوحات العائد وتحليلات القرار",
    pitch: "Value, cost and risk on one screen — designed for the people who decide, not for the people who built the model.",
    gets: ["KPI design tied to value per outcome and budget ceilings", "Business analysis of drivers, segments and leakage", "React / D3 dashboards or your BI tool (Power BI, Tableau, Looker)", "Alerting wired to CaseSpine escalation lanes"],
    format: ["2–6 weeks", "Workshops + build", "Arabic / English layouts"],
    Widget: MiniDashboard,
    caption: "A live mini-dashboard on synthetic data. Filter by emirate and segment; click a bar to drill in.",
  },
  {
    id: "tuning",
    title: "LLM Tuning & Fine-tuning Lab",
    ar: "مختبر ضبط النماذج اللغوية",
    pitch: "The right adaptation for your data — prompting, RAG, LoRA, full fine-tuning or distillation — and an honest recommendation of which.",
    gets: ["Data audit and evaluation set built with your experts", "Experiments across adaptation strategies with cost and latency", "Fine-tuning on Azure, AWS, Databricks or on-prem open-weight models", "Promotion gated by the same Lean contract as production"],
    format: ["Advisory or hands-on", "4–10 weeks", "Your data stays in your perimeter"],
    Widget: FineTuneLab,
    caption: "Move the sliders to see how data volume, domain shift, sensitivity and latency change the recommended path.",
  },
  {
    id: "career",
    title: "AI Career Accelerator",
    ar: "مسرّع المسار المهني",
    pitch: "One-to-one coaching from someone who has hired, built and led AI teams in banking.",
    gets: ["Skills assessment against the role you want", "A 90-day plan with portfolio projects", "CV, LinkedIn and story review", "Salary and offer negotiation guidance"],
    format: ["4 or 8 sessions", "Online or in person", "Confidential"],
    Widget: CareerRadar,
    caption: "Rate yourself, pick a target role, and see your three biggest gaps with concrete actions.",
  },
  {
    id: "academy",
    title: "AI Leadership Academy & Mock Interviews",
    ar: "أكاديمية القيادة والمقابلات التجريبية",
    pitch: "Executive education that makes managers fluent in AI value and risk — and realistic interview rehearsal for candidates.",
    gets: ["Modular programme for managers and boards", "Hands-on case writing in the CaseSpine sandbox", "Mock interviews for Head of AI, engineer, PM and data-science roles", "Scored feedback with rubrics"],
    format: ["Half-day to 3 days", "On-site in Abu Dhabi / Dubai or online", "Certificates of completion"],
    Widget: Academy,
    caption: "Assemble a programme, or run a timed mock-interview question with a rubric.",
  },
];

export default function Services() {
  return (
    <article className="paper wide">
      <div className="label" style={{ color: "var(--gold)" }}>Services</div>
      <h1 style={{ maxWidth: 920 }}>Full-stack partnership across the AI solution lifecycle</h1>
      <p className="lede" style={{ maxWidth: 820 }}>
        From the first conversation about value to a governed system in production — and the people who will run it. Every engagement uses
        CaseSpine, so what we agree on paper is what gets built.
      </p>
      <nav className="svc-toc" aria-label="Services">
        {SERVICES.map((s, i) => (
          <a key={s.id} href={`#/services#${s.id}`}><span>{i + 1}</span>{s.title}</a>
        ))}
      </nav>

      {SERVICES.map((s, i) => (
        <section key={s.id} id={s.id} className="svc">
          <div className="svc-head">
            <div className="svc-num">{String(i + 1).padStart(2, "0")}</div>
            <div>
              <h2 style={{ margin: 0 }}>{s.title}</h2>
              <div lang="ar" className="svc-ar">{s.ar}</div>
              <p className="svc-pitch">{s.pitch}</p>
            </div>
          </div>
          <div className="svc-body">
            <div className="svc-gets">
              <div className="label">What you get</div>
              <ul>{s.gets.map((g) => <li key={g}>{g}</li>)}</ul>
              <div className="svc-format">{s.format.map((f) => <span key={f} className="chip">{f}</span>)}</div>
              <a className="btn btn-emerald btn-sm" href={contactHref(s.title)}>Discuss this →</a>
            </div>
            <figure className="figure" style={{ margin: 0 }}>
              <div className="figure-body"><s.Widget /></div>
              <figcaption>{s.caption}</figcaption>
            </figure>
          </div>
        </section>
      ))}

      <section id="contact" className="svc-contact">
        <h2 style={{ marginTop: 0 }}>Start a conversation</h2>
        <p>Tell us about the case, the people involved and what success is worth. We reply within one business day.</p>
        <div className="cta-row">
          {SITE.contactEmail || SITE.contactUrl ? (
            <a className="btn btn-emerald" href={contactHref("Noor Al Hikma AI — enquiry")}>{SITE.contactEmail ? `Email ${SITE.contactEmail}` : "Book a call"}</a>
          ) : (
            <a className="btn btn-emerald" href="#/services#clinic">Draft your case in the Clinic</a>
          )}
          {SITE.linkedin && <a className="btn btn-ghost" href={SITE.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
          <a className="btn btn-ghost" href="#/walkthrough">Watch the walkthrough</a>
        </div>
      </section>
      <style>{`
.svc-toc{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px;margin:26px 0 10px;font-family:var(--sans)}
.svc-toc a{display:flex;gap:10px;align-items:center;text-decoration:none;color:var(--ink);padding:9px 12px;border:1px solid var(--rule);border-radius:9px;background:var(--card);font-size:14px;font-weight:550}
.svc-toc a:hover{border-color:var(--gold);color:var(--ink)}
.svc-toc span{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold);font-size:12px;font-weight:700;flex:none}
.svc{margin-top:64px;scroll-margin-top:80px}
.svc-head{display:grid;grid-template-columns:64px 1fr;gap:12px;align-items:start}
.svc-num{font-family:var(--serif);font-size:44px;line-height:1;color:var(--gold);font-weight:600}
.svc-ar{font-family:var(--arabic-display);color:var(--emerald);font-size:20px;margin-top:2px;text-align:left}
.svc-pitch{font-size:19px;color:var(--ink-2);margin:6px 0 0;max-width:820px}
.svc-body{display:grid;grid-template-columns:260px minmax(0,1fr);gap:22px;margin-top:18px;align-items:start}
.svc-gets ul{padding-left:18px;font-size:15.5px;margin:6px 0 12px}
.svc-gets li{margin-bottom:5px}
.svc-format{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px}
.svc-contact{margin-top:80px;padding:28px;border:1px solid var(--rule);border-top:3px solid var(--emerald);border-radius:12px;background:var(--card);scroll-margin-top:80px}
@media(max-width:900px){.svc-body{grid-template-columns:1fr}.svc-head{grid-template-columns:48px 1fr}.svc-num{font-size:34px}}
`}</style>
    </article>
  );
}
