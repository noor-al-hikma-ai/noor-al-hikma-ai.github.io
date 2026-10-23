import { lazy, Suspense, useEffect, useState } from "react";
import { Logo } from "./components/Logo";
import { contactHref, SITE } from "./config";
import { useRoute, type Route } from "./router";

const Paper = lazy(() => import("./pages/Paper"));
const Walkthrough = lazy(() => import("./pages/Walkthrough"));
const Studio = lazy(() => import("./pages/Studio"));
const Sandbox = lazy(() => import("./pages/Sandbox"));
const Services = lazy(() => import("./pages/Services"));
const Trust = lazy(() => import("./pages/Trust"));

const NAV: { route: Route; label: string }[] = [
  { route: "paper", label: "Paper" },
  { route: "walkthrough", label: "Walkthrough" },
  { route: "studio", label: "Studio" },
  { route: "sandbox", label: "RAG Sandbox" },
  { route: "services", label: "Services" },
  { route: "trust", label: "Trust & Compliance" },
];

export default function App() {
  const { route, anchor } = useRoute();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" }), 120);
    else window.scrollTo({ top: 0 });
  }, [route, anchor]);

  const fullBleed = route === "walkthrough";
  return (
    <>
      {!fullBleed && (
        <header className="nav">
          <a className="nav-brand" href="#/paper" aria-label={`${SITE.name} home`}>
            <Logo />
            <b>{SITE.name}</b>
            <span className="ar-name" lang="ar">{SITE.nameAr}</span>
          </a>
          <button className="nav-burger" onClick={() => setOpen(!open)} aria-expanded={open}>
            Menu
          </button>
          <nav className={`nav-links${open ? " open" : ""}`}>
            {NAV.map((n) => (
              <a key={n.route} href={`#/${n.route}`} className={route === n.route ? "active" : ""}>
                {n.label}
              </a>
            ))}
            <a className="btn btn-emerald btn-sm nav-cta" href={contactHref()}>
              Request a pilot
            </a>
          </nav>
        </header>
      )}
      <main>
        <Suspense fallback={<div className="paper muted sans">Loading…</div>}>
          {route === "paper" && <Paper />}
          {route === "walkthrough" && <Walkthrough />}
          {route === "studio" && <Studio />}
          {route === "sandbox" && <Sandbox />}
          {route === "services" && <Services />}
          {route === "trust" && <Trust />}
        </Suspense>
      </main>
      {!fullBleed && route !== "studio" && (
        <footer className="footer">
          <div className="footer-inner">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <Logo size={22} />
                <b style={{ color: "var(--ink)" }}>{SITE.name}</b>
                <span lang="ar" style={{ fontFamily: "var(--arabic-display)", color: "var(--gold)" }}>{SITE.nameAr}</span>
              </div>
              <div>{SITE.location} · CaseSpine v5</div>
            </div>
            <div style={{ maxWidth: 560 }}>
              Demos on this site run entirely in your browser: uploaded documents, indexes and the audit ledger never leave your device.
              Regulatory mappings describe design intent and are not legal advice or a certification.
            </div>
          </div>
        </footer>
      )}
    </>
  );
}
