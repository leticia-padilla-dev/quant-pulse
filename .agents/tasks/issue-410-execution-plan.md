# Execution Plan - Issue #410: Intent Emission

Implementación de la generación de research intents para QuantLab basados en candidatos `ready_for_review`.

## Tasks

- [x] **Commit 1**: Crear `automation/intent-templates.yaml` con templates por tema (macro, whale, regulatory, web3, execution).
- [ ] **Commit 2**: Proveer esquema de validación `config/research-intent.schema.json`.
- [ ] **Commit 3**: Implementar script `scripts/generate-intents.mjs`.
- [ ] **Commit 4**: Añadir fixtures y tests de integración.
- [ ] **Commit 5**: Actualizar documentación y `AGENTS.md`.

## Metadata
- **Merge Target**: `main`
- **Workflow**: 1 issue = 1 branch = 1 PR
- **Local Validation**: `npm run generate:intents` (por implementar)
