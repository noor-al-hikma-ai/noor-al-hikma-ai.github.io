import { VideoScene } from "../components/cinema/VideoScene";
import { CardDisputeDemo } from "../components/CardDisputeDemo";
import { contactHref, SITE } from "../config";
import "./home.css";

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <VideoScene name="dawn" eager className="hero-film" />
        <div className="hero-veil" />
        <div className="hero-copy">
          <div className="hero-kicker">{SITE.name}</div>
          <h1>Build AI your team can run, review, and change.</h1>
          <div className="hero-ar" lang="ar" dir="rtl">ذكاء اصطناعي يستطيع فريقك تشغيله ومراجعته وتعديله</div>
          <p>With CaseSpine, business owners can draft a workflow in Arabic or English, reuse existing controls, and show reviewers exactly what changed.</p>
          <div className="hero-cta">
            <a className="btn btn-gold btn-lg" href="#/home#case-demo">Try the card dispute demo</a>
            <a className="btn btn-emerald btn-lg" href={contactHref("Noor Al Hikma AI — discuss a workflow")}>Discuss a workflow</a>
          </div>
        </div>
      </section>

      <div className="paper">
        <CardDisputeDemo />

        <section>
          <h2>Experience taking AI into production</h2>
          <p>At Techcombank, the MLOps programme that founder Alexey Miasnikov helped lead reduced model implementation time from months to weeks. <a href="https://www.databricks.com/customers/techcombank">Read the Databricks case study</a>.</p>
          <p>At Careem, a fraud detection initiative Alexey led saved a reported $2.6 million annually. <a href="#/about#careem">Read about the Careem work</a>.</p>
        </section>

        <section>
          <h2>Start with one workflow or build a delivery capability</h2>
          <p>We build decision workflows, machine learning models, data pipelines, and BI. Start with a fixed-scope project for your business or establish the release standards and controls for a regulated institution.</p>
          <div className="cta-row">
            <a className="btn btn-emerald" href="#/services">Explore services</a>
            <a className="btn btn-ghost" href="#/compliance">Try the compliance demo</a>
            <a className="btn btn-ghost" href="#/sandbox">Try document Q&amp;A</a>
            <a className="btn btn-ghost" href="#/about">About Noor</a>
          </div>
        </section>
      </div>
    </div>
  );
}
