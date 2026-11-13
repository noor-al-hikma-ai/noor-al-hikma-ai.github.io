import { contactHref, SITE } from "../config";

export default function About() {
  return (
    <article className="paper">
      <div className="label" style={{ color: "var(--gold)" }}>About Noor Al Hikma AI</div>
      <h1>Build AI your team can run, review, and change.</h1>
      <p className="lede">
        Noor Al Hikma AI builds decision workflows, machine learning systems, and data products.
        We agree on what the system should improve, what rules it must follow, and what your team
        needs to operate it after handover.
      </p>

      <h2>Built from experience inside banks and marketplaces</h2>
      <p>
        Founder Alexey Miasnikov has led data and AI teams across banking and technology in the
        Middle East and Southeast Asia. As Head of Analytics &amp; Innovation at Techcombank, he
        built an MLOps team and helped establish bank-wide standards for taking models into production.
        Databricks documented the bank’s shift from months to weeks for model implementation.
        {" "}<a href="https://www.databricks.com/customers/techcombank">Read the Techcombank case study</a>.
      </p>
      <section id="careem" style={{ scrollMarginTop: 80 }}>
        <h3>Careem · Measuring fraud losses avoided</h3>
        <p>
          As Director of Data Science at Careem in Dubai, Alexey led the team that replaced a fraud
          system with 45,000 rules with a graph model that could spot related accounts. The team
          used controlled experiments to measure the impact. Alexey reports annual savings of $2.6 million.
        </p>
      </section>
      <p>
        That experience shapes how Noor works: pick a decision that affects revenue, losses, or operating
        cost, measure the starting point, and use the results to decide whether to scale.
        {" "}<a href={SITE.linkedin}>Meet Alexey on LinkedIn</a>.
      </p>

      <h2>CaseSpine puts business owners in charge of the rules</h2>
      <p>
        CaseSpine is a language Alexey created for describing how work should get done. A business
        owner starts with a brief in Arabic or English: what the workflow must deliver, which data it can
        use, which checks must pass, and when a person must step in. CaseSpine turns the structured case
        into machine-checkable rules and workflow definitions that engineering and risk teams can review.
      </p>
      <p>
        Imagine a bank adding a card dispute workflow. Its operations team can draft a case that
        gathers evidence, checks policy deadlines, and sends exceptions to an authorised reviewer.
        A new case can reuse the controls its parent case defines. The team can review what changed
        and put it through its existing test and approval process before it goes live. Noor designs
        deployments around the client’s approved infrastructure and access requirements.
      </p>

      <h2>Start with one workflow or build a delivery capability</h2>
      <p>
        <strong>For SMEs.</strong> Start with a workflow or data product with a clear path to paying for itself, such
        as invoice exception routing, demand forecasting, or a margin dashboard. Define the outcome,
        integrate with the tools you use, and hand over a system your team can operate.
      </p>
      <p>
        <strong>For regulated institutions.</strong> Build agent workflows, fraud and risk models,
        data pipelines, or BI with the controls your teams require. We also help establish the release
        standards, testing, monitoring, and evidence that make future changes easier to review.
      </p>
      <div className="cta-row">
        <a className="btn btn-emerald" href={contactHref("Noor Al Hikma AI — discuss a workflow")}>Discuss a workflow</a>
        <a className="btn btn-ghost" href="#/studio">Try CaseSpine Studio</a>
        <a className="btn btn-ghost" href="#/services">Explore services</a>
      </div>

      <h2>Company registration</h2>
      <p>
        <strong>{SITE.legalName}</strong> (License No. {SITE.licenseNumber}) is registered
        in Ajman Free Zone, United Arab Emirates.
      </p>
    </article>
  );
}
