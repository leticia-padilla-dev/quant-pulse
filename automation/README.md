# Automation Layer — Governance, Candidates, and Event Ingestion

This directory contains the **operational** layer of Quant Pulse. It stays separate from the canonical published feed in `content/pulse.source.json` so that evaluation state, candidate lifecycle, and early ingestion artifacts do not contaminate editorial output.

## Architecture

There are now two operational surfaces:

1. **Candidate governance**
   - `automation/candidates/`
   - `automation/gates/approval_gates.yaml`
   - `scripts/validate-candidates.mjs`
   - used to validate candidate records, gate decisions, and lifecycle transitions

2. **Event ingestion foundation (Slice 3)**
   - `automation/events/fixtures/`
   - `automation/events/normalized/events.normalized.json`
   - `config/event.schema.json`
   - `scripts/ingest-events.mjs`
   - used to normalize raw fixture inputs into a deterministic pre-candidate event contract

The intended flow is:

```text
raw fixtures -> normalized events -> candidate evaluation -> research intents -> published feed/archive
```

## Candidate Governance

Candidate governance remains the owner of:

- lifecycle states (`no_candidate`, `candidate`, `ready_for_review`, `published`, `archived`)
- approval gates and thresholds
- audit trail and transition logging
- separation between operational state and canonical feed

Use:

```bash
npm run validate:candidates
```

This validates candidates against:

- `config/candidate.schema.json`
- `automation/gates/approval_gates.yaml`

## Event Ingestion Foundation

Slice 3 adds the first deterministic ingestion baseline without introducing live fetching, scoring, dedupe, alerts, or feedback automation.

### Scope

- ingest local JSON fixtures from `automation/events/fixtures/`
- normalize them into `automation/events/normalized/events.normalized.json`
- map sources against `config/approved-sources.yaml`
- generate deterministic 12-character hex IDs
- produce byte-identical output for identical inputs
- validate the normalized artifact against `config/event.schema.json`

### Rules

- source mapping follows the repo policy in `config/approved-sources.yaml`
- only **explicit source identities** are promoted to approved source names
- generic source classes are not treated as source identities
- unknown sources stay as their raw source name and fall back to tier `3`
- normalized output is stable-sorted by `published_at`, then `id`

### Commands

Run ingestion:

```bash
npm run ingest:events
```

Run focused tests:

```bash
npm test -- --run src/test/ingestion.test.ts
```

## Files

```text
automation/
├── README.md
├── archive/
├── candidates/
├── events/
│   ├── fixtures/
│   └── normalized/
└── gates/
```

Related contracts and scripts:

- `config/candidate.schema.json`
- `config/event.schema.json`
- `config/approved-sources.yaml`
- `scripts/validate-candidates.mjs`
- `scripts/ingest-events.mjs`

## Boundaries

This automation layer still does **not** implement:

- live fetching
- deduplication
- automatic scoring
- candidate generation from events
- alerts or notifications
- feedback loop refinement

Those remain later slices. This slice only establishes a deterministic, testable event foundation that is aligned with the current roadmap.

---
*Quant Pulse proposes the hypothesis; QuantLab requires the proof.*
