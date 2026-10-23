# Noor Al Hikma AI — CaseSpine website

Static website for **Noor Al Hikma AI** (نور الحكمة) and its CaseSpine language. It is a single-page
React + D3 + TypeScript app built with Vite and hosted on GitHub Pages. Everything runs in the visitor's
browser: there is no backend, no cookies and no analytics, and fonts are self-hosted.

| Page | URL | What it does |
| --- | --- | --- |
| Home | `#/` | Cinematic landing: hero film, four chapters of one customer's morning, the same morning for three others, specifications, the step-by-step deck and the call to action. Film slots play your clips when configured (see VIDEO_PROMPTS.md), otherwise animated scenes. |
| How it works | `#/walkthrough` | The same story as full-screen slides with code examples; arrow keys / swipe; `#/walkthrough#5` deep-links a slide. |
| Studio | `#/studio` | ✨ Copilot (plain English/Arabic → CaseSpine draft, assumptions, clarifying questions, rephrasing tips); editor with grey ghost-text suggestions (Tab), completion, ▾ dropdowns and hover quick-picks; Orange-style canvas with a searchable widget palette and a config form for every widget; ▶ Compile (⌘/Ctrl+Enter); Lean 4, Z3, LangGraph, BPMN, AWS, Google Cloud, Databricks, Kubernetes and IR outputs; `.csar` download. |
| RAG Sandbox | `#/sandbox` | Ask works straight away (sample policies load automatically) or upload PDF / DOCX / TXT / MD / HTML; UAE PII redaction, BM25 + SVD + RRF retrieval, ROI guards, Lean exit gateway, "did you mean" and suggested questions, human escalation queue, tamper-evident audit ledger. Every `Config:` value in the case changes its behaviour. |
| Services | `#/services` | Seven services, each with its own interactive widget. |
| Trust & Compliance | `#/trust` | Regulation → control → evidence mapping for UAE banks, integrations, security posture. |
| Technical brief | `#/brief` | The NeurIPS-style technical paper for engineers and architects. |

### CaseSpine `Config:` sections

Every widget is a component with typed settings (schema in `src/lib/casespine/configSchema.ts`):

```
Config:
  Retriever: { Mode: hybrid, Top K: 3, BM25 k1: 1.2, RRF k: 60 }
  Synthesizer: { Model: auto, Max Sentences: 3, Abstain When Unsupported: true }
  Escalation:
    Channel: teams
    SLA Hours: 4
```

Values are validated (ranges, allowed options), inherited by subcases, emitted into the IR and LangGraph
scaffold, and used by the sandbox runtime. Clicking a widget on the canvas edits the same lines.

## Run it on your Mac

```bash
cd "/Users/amiasnikov/Noor Al Hikma Site"
npm install        # once
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm test           # compiler tests: examples, Arabic ≡ English, 210 config round-trips, palette, ghost text, Copilot, .csar
npm run build      # production build into dist/
npm run preview    # serve dist/ locally, exactly as GitHub Pages will
```

## Edit before publishing

* `src/config.ts` — contact e-mail or booking URL (used by every "Request a pilot" / "Discuss this" button), LinkedIn, the founder line, and the landing-page film paths (`videos`).
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
