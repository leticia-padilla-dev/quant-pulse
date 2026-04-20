# Quant Pulse Automation System

## Event Ingestion Foundation (Slice 3)

This directory manages the ingestion and normalization of raw signals into a canonical event format.

### Workflow
1. **Raw Sources**: Data is initially collected as local fixtures in `automation/events/fixtures/`.
2. **Normalization**: The `scripts/ingest-events.mjs` script processes these fixtures.
   - Maps sources to approved identities in `config/approved-sources.yaml`.
   - Assigns priority tiers (1-3).
   - Generates deterministic 12-character hex IDs.
3. **Artifact**: A single canonical file `automation/events/normalized/events.normalized.json` is generated.
   - This file is byte-identical for same inputs (Idempotency).
   - Events are stable-sorted by date and ID.

### Usage
Run the ingestion pipeline:
```bash
npm run ingest:events
```

Validate the implementation:
```bash
npx vitest run src/test/ingestion.test.ts
```

### Schema
Events must comply with `config/event.schema.json`.

---
*Quant Pulse proposes the hypothesis; QuantLab requires the proof.*
