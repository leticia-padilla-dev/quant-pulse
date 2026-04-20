# Automation Layer — Governance & Candidate Evaluation

This directory contains the **operational** layer for Quant Pulse signal candidate evaluation. It is **separate from the canonical feed** (`content/pulse.source.json`), keeping evaluation state out of the published source.

## Architecture

### Separation of Concerns

```
content/pulse.source.json
    ↓
    │ (editorial only, manually curated)
    ↓
automation/candidates/
    ↓
    │ (evaluation: scoring, gating, transitions)
    ↓
automation/candidates/ready_for_review/
    ↓
    │ (ready for QuantLab intent production)
    ↓
scripts/research-intents.mjs
    ↓
    │ (generates intents.json)
    ↓
public/data/intents.json
```

### Why Separate?

- **Canonical Feed is Pure**: `pulse.source.json` contains only editorially-verified, production-ready signals. No state churn, no partial evaluations.
- **Operational State Lives Here**: Candidate evaluation, gate decisions, state transitions, audit trails stay in `automation/`.
- **Prevents Contamination**: Scoring changes, gate adjustments, or confidence corrections don't get mixed with published feed.

---

## State Machine

### Lifecycle States

1. **no_candidate** — Signal rejected; below minimum thresholds
2. **candidate** — Signal accepted; ready for human review by QuantLab
3. **ready_for_review** — High-confidence signal; optional human review, may proceed directly to intent production
4. **published** — Signal accepted by QuantLab; in `content/pulse.source.json`
5. **archived** — Signal no longer active; retained for historical audit trail

### Allowed Transitions

```
no_candidate  ←  candidate  ←  ready_for_review  ←  published
    ↓              ↓              ↓                    ↓
 archived       archived      archived            archived
```

---

## Approval Gates

Three gates enforce transition rules. Defined in `automation/gates/approval_gates.yaml`.

### Gate 1: `no_candidate` (Rejection)

**Threshold:**
- `confidence < 0.50` OR `score < 40`

**Outcome:**
- State: `no_candidate`
- Action: Archive candidate; do not escalate
- Reason: Insufficient signal strength for review

### Gate 2: `candidate` (Acceptance for Review)

**Threshold:**
- `confidence >= 0.50` AND `score >= 40`
- `source` in `approved_sources`

**Outcome:**
- State: `candidate`
- Action: Queue for human review by QuantLab
- Reason: Meets minimum viability; human judgment required

### Gate 3: `ready_for_review` (High Confidence)

**Threshold:**
- `confidence >= 0.75` AND `score >= 70`
- `source` in `tier_1_sources`
- Category material to QuantLab

**Outcome:**
- State: `ready_for_review`
- Action: May pass directly to intent production (optional QuantLab review)
- Reason: High confidence; proven source; minimal risk

---

## Scoring Bands

Candidates are classified by score bands, determining priority and retention:

| Band | Score Range | Description | Retention |
|------|-------------|-------------|-----------|
| **P1** | 70–100 | Material impact; decision-driving | Permanent archive |
| **P2** | 40–69 | Notable; context-relevant | 6 months |
| **P3** | 0–39 | Background only; rejected | 30 days |

---

## Data Structures

### Candidate Record

**Location:** `automation/candidates/candidate_<id>.json`

```json
{
  "id": "candidate_2026_04_10_btc_whale_whale_01",
  "state": "candidate",
  "source": "coindesk",
  "title": "Large BTC Whale Activity Detected",
  "summary": "Multiple whale movements indicate potential market shift",
  "category": "Btc_Whale_Activity",
  "score": 68,
  "confidence": 0.72,
  "decision": {
    "gate_applied": "candidate",
    "timestamp": "2026-04-10T14:23:45Z",
    "reason": "Passed candidate gate: confidence=0.72, score=68. Ready for QuantLab review.",
    "evaluator": "scoring_engine_v1"
  },
  "state_transitions": [
    {
      "from": "no_candidate",
      "to": "candidate",
      "timestamp": "2026-04-10T14:23:45Z",
      "reason": "Candidate gate accepted signal"
    }
  ],
  "metadata": {
    "detected_at": "2026-04-10T14:00:00Z",
    "parent_signal_id": null,
    "related_signals": []
  }
}
```

### Candidates Index

**Location:** `automation/candidates/index.json`

Registry of all candidates (active + archived):

```json
{
  "version": "1.0",
  "generated_at": "2026-04-10T14:30:00Z",
  "total_candidates": 12,
  "by_state": {
    "no_candidate": 2,
    "candidate": 5,
    "ready_for_review": 3,
    "published": 2,
    "archived": 0
  },
  "candidates": [
    {
      "id": "candidate_2026_04_10_btc_whale_01",
      "state": "candidate",
      "score": 68,
      "confidence": 0.72,
      "file": "automation/candidates/candidate_2026_04_10_btc_whale_01.json"
    }
  ]
}
```

### Audit Trail

**Location:** `automation/archive/audit_trail.json`

Permanent log of all decisions and state transitions:

```json
{
  "version": "1.0",
  "retention_policy": "permanent",
  "generated_at": "2026-04-10T14:30:00Z",
  "total_events": 42,
  "events": [
    {
      "timestamp": "2026-04-10T14:23:45Z",
      "event_type": "candidate_gated",
      "candidate_id": "candidate_2026_04_10_btc_whale_01",
      "gate": "candidate",
      "result": "accept",
      "decision_reason": "Passed candidate gate: confidence=0.72, score=68.",
      "evaluator": "scoring_engine_v1"
    }
  ]
}
```

---

## Validation & Enforcement

### Schema Validation

`scripts/validate-candidates.mjs` enforces:

1. **JSON Schema** (`config/candidate.schema.json`): All records shape-compliant
2. **Gate Logic** (`automation/gates/approval_gates.yaml`): Thresholds enforced
3. **State Machine**: Only allowed transitions
4. **Audit Trail**: All decisions logged
5. **Source Whitelist**: Only `approved_sources` permitted

### GitHub Actions (Fase 2+)

Automated validation on PR creation:

```yaml
on: [pull_request, workflow_dispatch]
steps:
  - run: npm run validate:candidates
  - run: npm run validate:feed
```

---

## Workflow

### Manual (Fase 1 Completion)

1. **Detect Signal**: Human finds market insight
2. **Create Candidate**: Write to `automation/candidates/candidate_<id>.json`
3. **Run Validation**: `npm run validate:candidates`
4. **Review Transitions**: Check gate decisions
5. **Escalate**: If `candidate` or `ready_for_review`, notify QuantLab
6. **Publish**: If approved, move to `content/pulse.source.json`

### Automated (Fase 2+)

1. **Event → Candidate**: Automated detection pipeline (Slice 3)
2. **Scoring**: Scoring engine produces `score` + `confidence`
3. **Gating**: Automatic gate evaluation
4. **Transition**: State machine moves candidate through lifecycle
5. **Audit**: All steps logged in `audit_trail.json`
6. **Intent Production**: `ready_for_review` candidates → `research_intents.mjs` → `public/data/intents.json`
7. **Feedback Loop**: QuantLab validation results → scoring refinements (Slice 4)

---

## Key Principles

1. **Separation of Concerns**: Operational state (automation/) ≠ Canonical feed (content/)
2. **Audit Trail**: Every decision logged with timestamp + reason
3. **Governance**: Gates are explicit; thresholds are tunable
4. **Feedback Loop**: QuantLab results feed back into scoring (connected in Slice 4)
5. **Confidence Over Opinions**: Decisions based on measurable thresholds, not hunches
6. **State Machine**: Only allowed transitions; prevents invalid states
7. **Source Whitelist**: Only approved sources can produce candidates (prevents noise)

---

## Files in This Directory

```
automation/
├── README.md                          ← You are here
├── candidates/
│   ├── index.json                     ← Registry of all candidates
│   ├── candidate_*.json               ← Individual candidate records
│   ├── examples/                      ← Sample fixtures (3 gate outcomes)
│   │   ├── example_no_candidate.json  ← Legacy fixtures
│   │   ├── example_candidate.json
│   │   ├── example_ready_for_review.json
│   │   ├── 2026-04-10_low_confidence_example.json        ← [NEW] Slice 1 fixtures
│   │   ├── 2026-04-10_moderate_confidence_example.json  ← [NEW]
│   │   └── 2026-04-10_high_confidence_example.json      ← [NEW]
│   └── [...]
├── archive/
│   ├── audit_trail.json               ← Permanent decision log
│   ├── decisions/
│   │   ├── 2026-04/
│   │   └── [...]
│   └── [...]
└── gates/
    └── approval_gates.yaml            ← Gate definitions & thresholds
```

---

- [x] **Task 1.2**: Implement `scripts/validate-candidates.mjs` (gate logic + validation)
- [x] **Task 1.4**: Create `.github/pull_request_template_candidate.md`
- [x] **Task 1.3**: Create 3 example fixtures demonstrating all gate outcomes
- [x] **Task 1.5**: Update `AGENTS.md` + `docs/governance-lifecycle.es.md`

## Next Steps (Slice 2 — Intent Emission)

- **Task 2.1**: Implement research intent generator for high-confidence candidates
- **Task 2.2**: Integrate `validate-candidates.mjs` into central CI workflow

---

## References

- [Governance Lifecycle](../docs/governance-lifecycle.es.md)
- [Priority Rules](../docs/priority-rules.es.md)
- [Category Taxonomy](../docs/category-taxonomy.es.md)
- [Canonical JSON Format](../docs/canonical-json-format.es.md)
- [Approved Sources](../config/approved-sources.yaml)
- [Execution Order](../.agents/EXECUTION_ORDER.md)
