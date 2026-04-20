# AGENTS.md

## Project

Quant Pulse

## Source of truth

- docs/quantlab-upstream-contract.es.md
- docs/quantlab-signal-intent-format.es.md
- docs/architecture-phases.es.md (fases: Pages + Knowledge → backend + Actions)
- docs/live-feed-api-contract.es.md
- docs/roadmap.es.md
- docs/feed-workflow.es.md
- docs/editorial-manual.es.md
- docs/scoring-system.es.md
- docs/priority-rules.es.md
- docs/category-taxonomy.es.md
- docs/canonical-json-format.es.md
- docs/signal-vs-noise.es.md
- docs/voice-summary-style.es.md
- docs/brand-guidelines.md
- docs/governance-lifecycle.es.md
- config/approved-sources.yaml
- config/news.schema.json
- config/candidate.schema.json
- config/research-intent.schema.json
- config/research-intents-document.schema.json
- automation/intent-templates.yaml
- automation/gates/approval_gates.yaml
- content/pulse.source.json (fuente editorial de Fase 1)
- public/data/pulse.json (feed estático servido en Pages; debe salir del pipeline)
- public/data/intents.json (artefacto downstream estático publicado por el pipeline)
- npm run validate:feed (comprobación mínima de consistencia editorial y de contrato para feed, archive e intents)
- npm run generate:intents (generación de intents a partir de candidatos validados)
- npm run validate:candidates (comprobación de gates de aprobación)

## Rules

- Treat `docs/quantlab-upstream-contract.es.md` as the product-boundary contract for Quant Pulse vs QuantLab.
- Treat the current repository files, docs, schema, and runtime as present-state authority. Use the roadmap as target state, not as proof of implemented behavior.
- Quant Pulse is the upstream signal layer for QuantLab. It is not a trading engine, not a backtesting system, not an execution controller, and not a general news aggregator.
- Keep the primary scope constrained to Crypto & Markets, Web3 market structure, execution-venue and broker-rail risk, Technology only when it affects infrastructure, security, or market structure, and Macro only when it materially affects crypto or technology conditions.
- Quant Pulse outputs should improve at least one of: research intent generation, signal prioritization, risk awareness, or product priorities for QuantLab.
- If a signal cannot be translated into a research hypothesis, risk filter, or product/instrumentation priority, keep it as context only and do not let it drive downstream QuantLab behavior.
- Do not invent categories outside the taxonomy in `docs/category-taxonomy.es.md`.
- Do not output JSON that breaks the canonical format in `docs/canonical-json-format.es.md` and `config/news.schema.json`.
- Do not edit `public/data/pulse.json` manually if the same change belongs in `content/pulse.source.json`.
- Keep summaries readable aloud in Spanish when producing Spanish copy; the UI may stay in English until localized.
- Prefer primary and tier_1 sources per `config/approved-sources.yaml`.
- Treat signal vs noise as a first-class classification.
- Ask for a plan before large refactors.
- Prefer small, verifiable changes.

## Git workflow rules

- Use `.agents/workflow-policy.md` as the reusable workflow checklist and `.agents/templates/slice-completion-report.md` as the standard close-out template for completed slices.
- Use `.agents/repo-hygiene.md` for the canonical remote URL and the expected protection posture for `main`.
- Use `.agents/scripts/start-slice.ps1 -IssueNumber <n> -Slug <short-name>` when you need a fresh branch and isolated worktree from `origin/main`.
- Use `.agents/scripts/cleanup-slice.ps1 -WorktreePath <path>` after merge when you want to remove a clean local slice worktree that is already merged into `origin/main`.
- For non-trivial work with a real diff, do not ask whether to create the GitHub workflow steps one by one. Execute the full slice workflow by default unless the user explicitly asks not to.
- Do not force the full issue and PR workflow for preflight, review-only, exploratory, or no-diff conclusions. In those cases, report the finding clearly and only open an issue when it adds real backlog value.
- Use the full repository workflow for non-trivial work: `issue -> branch -> code -> validate -> commit -> push -> PR -> merge -> close issue`.
- If a better next slice is discovered while following the docs and present-state repo contract, the agent may pivot to that smaller or more relevant slice and explain the decision.
- Treat the workflow as incomplete until the slice branch is cleaned locally and remotely and `main` is synced back to `origin/main`.
- Clean up merged slice branches pragmatically: delete the local branch when it no longer has pending work, delete the remote branch when it does not need to be preserved, and do not delete branches with unmerged work or branches owned by someone else without confirmation or explicit team policy.
- Start each slice from `origin/main`, not from a dirty feature branch.
- If the current worktree is dirty, prefer an isolated `git worktree` for the new slice instead of mixing changes.
- Keep each commit limited to one logical slice.
- Before staging, inspect `git status` and `git diff` so only intended files enter the commit.
- Never stage unrelated local work or runtime/data changes that belong to another slice.
- Keep branch, docs, workflow, and runtime scope separated; do not mix them in one commit unless the contract owner is the same.
- Run `git diff --check` before staging or opening a PR.
- For implementation slices, run the repository checks that own the touched contract before opening the PR.

## Phased delivery (summary)

1. **Fase 1:** `content/pulse.source.json` + build pipeline + GitHub Pages + `public/data/pulse.json` + Custom GPT Knowledge (listado en `docs/architecture-phases.es.md`). No backend, no GPT Actions, no OpenAI en el frontend.
2. **Fase 2:** backend mínimo y feed vivo según `docs/live-feed-api-contract.es.md`; Actions solo después de que esa frontera exista y sea estable.
3. **Fase 3 (opcional):** chat u otras integraciones con API key solo en servidor.

## Boundary phrase

`Quant Pulse proposes the hypothesis; QuantLab requires the proof.`
