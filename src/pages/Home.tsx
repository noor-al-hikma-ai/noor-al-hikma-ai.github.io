import { useEffect } from "react";
import { VideoScene } from "../components/cinema/VideoScene";
import type { SceneName } from "../components/cinema/Scenes";
import { StoryDeck } from "../components/StoryDeck";
import { Octagram } from "../components/Logo";
import { contactHref, SITE } from "../config";
import "./home.css";

const CHAPTERS: { film: SceneName; time: string; place: string; title: string; ar: string; text: string }[] = [
  {
    film: "ask",
    time: "07:12",
    place: "Al Barsha, Dubai",
    title: "She asks, in her own words.",
    ar: "تسأل بكلماتها",
    text: "Mariam runs a family trading house. A new buyer wants AED 2 million of goods on 90-day terms. She asks in Arabic, on her phone — the way she would ask her finance director. No forms. No jargon.",
  },
  {
    film: "checks",
    time: "07:12:04",
    place: "Inside the bank",
    title: "Noor reads every rule that applies.",
    ar: "نور يقرأ كل قاعدة",
    text: "Credit policy, Sharia manual, limits, sanctions — read in seconds, inside the bank's own walls. Personal data is hidden before a single word is read.",
  },
  {
    film: "answer",
    time: "07:12:06",
    place: "On her screen",
    title: "A clear answer — with its proof.",
    ar: "إجابة واضحة مع الدليل",
    text: "Yes, up to AED 2 million, if the goods are owned before the sale. Every sentence points to its source, every rule is checked, and the answer cost three fils.",
  },
  {
    film: "life",
    time: "07:15",
    place: "Back to her day",
    title: "Back to what matters.",
    ar: "عودة إلى ما يهم",
    text: "No email chain, no waiting until Sunday. The decision is recorded for the auditors — and Mariam is on her way to the people she built the business for.",
  },
];

const SAME_MORNING = [
  { time: "08:30", place: "Abu Dhabi", who: "Branch officer", q: "Can this customer send AED 250,000 abroad today?", a: "Needs a second approver — routed to the branch manager in one tap." },
  { time: "10:00", place: "Sharjah", who: "Chief Financial Officer", q: "Where are we losing money on card disputes?", a: "Answered from the dispute procedures and twelve weeks of data, with sources." },
  { time: "11:45", place: "DIFC", who: "Head of Compliance", q: "Did any answer this week break our rules?", a: "No — every answer carries the proof of the rules it satisfied." },
];

const SPECS = [
  { k: "Languages", v: "Arabic · English" },
  { k: "Every answer", v: "With its sources and proof" },
  { k: "Cost", v: "Capped per question" },
  { k: "Your data", v: "Never leaves your walls" },
  { k: "Getting started", v: "Describe it in plain words" },
];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function Home() {
  useReveal();
  return (
    <div className="home">
      <section className="hero">
        <VideoScene name="dawn" eager className="hero-film" />
        <div className="hero-veil" />
        <div className="hero-copy">
          <div className="hero-kicker">{SITE.name}</div>
          <h1>
            Every business question.
            <br />
            Answered with certainty.
          </h1>
          <div className="hero-ar" lang="ar">كل سؤال في عملك، بإجابة موثوقة</div>
          <p>Ask in Arabic or English. Get an answer you can prove, at a cost you set — running inside your own walls.</p>
          <div className="hero-cta">
            <a className="btn btn-gold btn-lg" href="#/home#story">Watch the story</a>
            <a className="btn btn-emerald btn-lg" href="#/studio">✨ Describe your case</a>
          </div>
        </div>
        <a className="scroll-cue" href="#/home#story" aria-label="Scroll to the story">
          <span />
        </a>
      </section>

      <section className="interlude reveal" id="story">
        <div className="hairline" />
        <p>
          One morning in the Emirates.
          <br />
          One question worth two million dirhams.
        </p>
        <div className="hairline" />
      </section>

      {CHAPTERS.map((c, i) => (
        <section key={c.film} className={`chapter${i % 2 ? " flip" : ""}`}>
          <div className="ch-film reveal">
            <VideoScene name={c.film} />
            <div className="ch-time">
              <b>{c.time}</b>
              <span>{c.place}</span>
            </div>
          </div>
          <div className="ch-copy reveal">
            <div className="ch-num">{["I", "II", "III", "IV"][i]}</div>
            <h2>{c.title}</h2>
            <div className="ch-ar" lang="ar">{c.ar}</div>
            <p>{c.text}</p>
          </div>
        </section>
      ))}

      <section className="morning">
        <h2 className="reveal">The same morning, across the Emirates</h2>
        <div className="morning-grid">
          {SAME_MORNING.map((m, i) => (
            <article key={m.place} className="morning-card reveal" style={{ transitionDelay: `${i * 0.12}s` }}>
              <div className="mc-time">
                <b>{m.time}</b> · {m.place}
              </div>
              <div className="mc-who">{m.who}</div>
              <p className="mc-q">“{m.q}”</p>
              <p className="mc-a">
                <span>✓</span> {m.a}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="specs reveal" aria-label="Specifications">
        <div className="specs-orn">
          <Octagram size={420} opacity={0.16} />
        </div>
        <div className="specs-title">Specifications</div>
        <dl>
          {SPECS.map((s) => (
            <div key={s.k}>
              <dt>{s.k}</dt>
              <dd>{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="how" id="how">
        <div className="how-head reveal">
          <div className="hero-kicker">How it works</div>
          <h2>From a question to a governed system — in seven steps</h2>
        </div>
        <div className="reveal">
          <StoryDeck />
        </div>
      </section>

      <section className="convert reveal">
        <h2>Your question deserves a certain answer.</h2>
        <div className="convert-ar" lang="ar">سؤالك يستحق إجابة موثوقة</div>
        <div className="convert-cta">
          <a className="btn btn-gold btn-lg" href="#/studio">✨ Describe your case</a>
          <a className="btn btn-emerald btn-lg" href="#/sandbox">Ask your documents</a>
          <a className="btn btn-primary btn-lg" href={contactHref("Noor Al Hikma AI — demo")}>Book a 20-minute demo</a>
        </div>
        <div className="convert-note">No sign-up · runs in your browser · nothing is uploaded</div>
        <div className="convert-links">
          <a href="#/services">Services</a>
          <a href="#/trust">Trust &amp; compliance</a>
          <a href="#/brief">Technical brief for engineers</a>
        </div>
      </section>
    </div>
  );
}
