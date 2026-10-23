# Noor Al Hikma AI — CaseSpine website

Static website for **Noor Al Hikma AI** (نور الحكمة) and its CaseSpine language. It is a single-page
React + D3 + TypeScript app built with Vite and hosted on GitHub Pages. Everything runs in the visitor's
browser: there is no backend, no cookies and no analytics, and fonts are self-hosted.

| Page | URL | What it does |
| --- | --- | --- |
| Paper | `#/paper` | NeurIPS-style landing page with live figures (pipeline, rule → Lean 4 compiler, ROI governor, archetypes, roles, sovereign stack, audit chain). |
| Walkthrough | `#/walkthrough` | 13 live slides for client meetings. Arrow keys / swipe; `#/walkthrough#5` deep-links a slide; `Esc` exits. |
| Studio | `#/studio` | CaseSpine editor (completion, hover hints, lint) beside an Orange-style visual canvas that stays in sync both ways; compiled Lean 4, Z3, LangGraph, BPMN, AWS, Google Cloud, Databricks, Kubernetes and IR outputs; `.csar` download. |
| RAG Sandbox | `#/sandbox` | Upload PDF / DOCX / TXT / MD / HTML, ask questions; UAE PII redaction, BM25 + SVD + RRF retrieval, ROI guards, Lean exit gateway, human escalation queue and a tamper-evident SHA-256 audit ledger. |
| Services | `#/services` | Seven services, each with its own interactive widget. |
| Trust & Compliance | `#/trust` | Regulation → control → evidence mapping for UAE banks, integrations, security posture. |

## Run it on your Mac

```bash
cd "/Users/amiasnikov/Noor Al Hikma Site"
npm install        # once
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm test           # compiler tests: all examples compile, Arabic ≡ English, palette edits, .csar build
npm run build      # production build into dist/
npm run preview    # serve dist/ locally, exactly as GitHub Pages will
```

## Edit before publishing

* `src/config.ts` — contact e-mail or booking URL (used by every "Request a pilot" / "Discuss this" button), LinkedIn, the founder line.
* `src/pages/Services.tsx` — service names, bullets and formats.
* `src/pages/Trust.tsx` — regulatory mapping text (have your compliance adviser review it).
* `src/lib/casespine/examples.ts` — the example programs shown in the Studio.
* `src/styles/global.css` — colour tokens (light-only pastel palette: white/cream, emerald, gold, cobalt/turquoise).

## Code map

```
src/lib/casespine/   compiler: arabic.ts (AR→EN normaliser), tree.ts (literate-YAML reader),
                     rules.ts (SBVR → clauses → Lean/Z3/Python), analyze.ts (CaseAST, witness solver,
                     diagnostics), emit.ts (all targets), graph.ts + edits.ts (visual canvas ↔ text),
                     csar.ts (PEP 441 zipapp), language.ts + vocab.ts (CodeMirror support)
src/lib/rag/         extract.ts (pdf.js, DOCX), pii.ts, engine.ts (BM25, randomised SVD, RRF, synthesis),
                     runtime.ts (guards, optimiser, Lean gate), samples.ts (synthetic corpus)
src/lib/ledger.ts    hash-chained audit ledger + PROV-O export
src/components/      CaseCanvas, CodeEditor, figures, ROI simulator, service widgets
src/pages/           one file per route
scripts/             test-compiler.ts, make-sample-pdf.py, publish.sh
```

The generated Lean 4 modules for every example type-check with Lean 4 v4.34 (including the `decide`
witness proofs), and downloaded `.csar` files run with `python3 file.csar info | verify | check state.json`.

See **DEPLOY.md** for publishing to GitHub Pages.
