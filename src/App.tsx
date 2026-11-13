import { useEffect, useRef, useState, type ComponentType } from "react";
import { NetStripe } from "./components/NetStripe";
import { Logo } from "./components/Logo";
import { contactHref, SITE } from "./config";
import { useRoute, type Route } from "./router";

const loaders: Record<Route, () => Promise<{ default: ComponentType }>> = {
  home: () => import("./pages/Home"),
  brief: () => import("./pages/Paper"),
  walkthrough: () => import("./pages/Walkthrough"),
  studio: () => import("./pages/Studio"),
  sandbox: () => import("./pages/Sandbox"),
  services: () => import("./pages/Services"),
  trust: () => import("./pages/Trust"),
  about: () => import("./pages/About"),
};
const pendingPages = new Map<Route, Promise<{ default: ComponentType }>>();
const pages = new Map<Route, ComponentType>();

function loadPage(route: Route) {
  const existing = pendingPages.get(route);
  if (existing) return existing;
  const request = loaders[route]().then((module) => {
    pages.set(route, module.default);
    return module;
  }).catch((error) => {
    pendingPages.delete(route);
    throw error;
  });
  pendingPages.set(route, request);
  return request;
}

function warmPage(route: Route) {
  void loadPage(route).catch(() => {});
}

const NAV: { route: Route; label: string }[] = [
  { route: "walkthrough", label: "How it works" },
  { route: "studio", label: "Studio" },
  { route: "sandbox", label: "RAG Sandbox" },
  { route: "services", label: "Services" },
  { route: "trust", label: "Trust & Compliance" },
  { route: "about", label: "About" },
];

export default function App() {
  const { route, anchor } = useRoute();
  const [displayed, setDisplayed] = useState<Route | null>(null);
  const [failed, setFailed] = useState<Route | null>(null);
  const [open, setOpen] = useState(false);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let current = true;
    setFailed(null);
    if (pages.has(route)) setDisplayed(route);
    else loadPage(route).then(
      () => { if (current) setDisplayed(route); },
      () => { if (current) setFailed(route); },
    );
    return () => { current = false; };
  }, [route]);

  const Page = pages.get(route) ?? (displayed ? pages.get(displayed) : undefined);
  const visibleRoute = pages.has(route) ? route : (displayed ?? route);

  useEffect(() => {
    if (!Page) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || connection?.effectiveType?.includes("2g")) return;
    let active = true;
    const warm = async () => {
      for (const next of ["sandbox", "studio", "walkthrough", "services", "about", "trust"] as const) {
        if (!active) return;
        await loadPage(next).catch(() => {});
      }
    };
    const idle = window.requestIdleCallback?.(warm);
    const timer = idle === undefined ? window.setTimeout(warm, 500) : undefined;
    return () => {
      active = false;
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [!!Page]);

  // The watermark stripe starts right after the brand and runs to the screen edge.
  useEffect(() => {
    const b = brandRef.current, h = headerRef.current;
    if (!b || !h) return;
    const set = () => h.style.setProperty("--stripe-left", `${b.offsetLeft + b.offsetWidth + 14}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(b);
    return () => ro.disconnect();
  }, [route]);

  useEffect(() => {
    setOpen(false);
  }, [route]);

  useEffect(() => {
    if (!Page || visibleRoute !== route) return;
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
    else window.scrollTo({ top: 0 });
  }, [Page, visibleRoute, route, anchor]);

  return (
    <>
      <header className="nav" ref={headerRef}>
        <NetStripe />
        <a className="nav-brand" href="#/" aria-label={`${SITE.name} home`} ref={brandRef}>
          <Logo />
          <b>{SITE.name}</b>
          <span className="ar-name" lang="ar">{SITE.nameAr}</span>
        </a>
        <button className="nav-burger" onClick={() => setOpen(!open)} aria-expanded={open}>
          Menu
        </button>
        <nav className={`nav-links${open ? " open" : ""}`}>
          {NAV.map((n) => (
            <a key={n.route} href={`#/${n.route}`} onPointerEnter={() => warmPage(n.route)} onFocus={() => warmPage(n.route)} className={visibleRoute === n.route ? "active" : ""} aria-current={visibleRoute === n.route ? "page" : undefined}>
              {n.label}
            </a>
          ))}
          <a className="btn btn-emerald btn-sm nav-cta" href={contactHref()}>
            Request a pilot
          </a>
        </nav>
      </header>
      <main>
        {failed === route && (
          <div className="paper" role="alert">
            This page couldn’t open. <button className="btn btn-ghost" onClick={() => window.location.reload()}>Reload site</button>
          </div>
        )}
        {Page && <Page />}
      </main>
      {visibleRoute !== "studio" && (
        <footer className="footer">
          <div className="footer-inner">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <Logo size={22} />
                <b style={{ color: "var(--ink)" }}>{SITE.name}</b>
                <span lang="ar" style={{ fontFamily: "var(--arabic-display)", color: "var(--gold)" }}>{SITE.nameAr}</span>
              </div>
              <div>{SITE.location} · CaseSpine v5</div>
              <div className="footer-links">
                <a href="#/walkthrough">How it works</a>
                <a href="#/services">Services</a>
                <a href="#/trust">Trust &amp; compliance</a>
                <a href="#/about">About</a>
                <a href="#/brief">Technical brief</a>
              </div>
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
