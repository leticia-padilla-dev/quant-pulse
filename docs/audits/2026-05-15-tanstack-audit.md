# TanStack Audit Note

Date: 2026-05-15
Repo: `Whiteks1/quant-pulse`
Scope: dependency and CI exposure review for the May 2026 TanStack/npm incident

## Result

SAFE

## Summary

- No occurrence of suspicious unscoped `tanstack` was found.
- Official `@tanstack/react-query` and `@tanstack/query-core` were present and reviewed.
- The reviewed `@tanstack/query*` family was treated as confirmed clean based on the official postmortem context used for this audit.
- No GitHub Actions runs existed on 2026-05-11 or 2026-05-12.
- No evidence was found that this repository executed `npm ci` or `npm install` in GitHub Actions during that window.

## Matches

- `package.json`: `@tanstack/react-query` `^5.83.0`
- `package-lock.json`: `@tanstack/react-query@5.83.0`
- `package-lock.json`: `@tanstack/query-core@5.83.0`
- `src/App.tsx`: direct runtime import of `@tanstack/react-query`
- `vite.config.ts`: dedupe entry for `@tanstack/react-query` and `@tanstack/query-core`

## CI Review

- Workflow: `.github/workflows/pr-validation.yml`
- Triggered event: `pull_request`
- Permissions: `contents: read`
- Install step: `npm ci`

- Workflow: `.github/workflows/pages.yml`
- Triggered events: `push` to `main`, `workflow_dispatch`
- Permissions: `contents: read`, `id-token: write`
- Install step: `npm ci`
- `id-token: write` is present for GitHub Pages deployment and is not exposed to PR validation.

GitHub Actions history review:

- No runs were present from 2026-05-11 through 2026-05-12.
- The latest runs near the reviewed period were on 2026-04-30.

## Validation Performed

- Text search for `tanstack` and `@tanstack/*`
- Review of `package.json`, `package-lock.json`, and workflow files
- `npm audit --omit=dev`: clean
- `npm run build`: not run during this audit because local `node_modules` were absent and the audit intentionally did not install dependencies
- `npm test`: not run during this audit because local `node_modules` were absent and the audit intentionally did not install dependencies
- `git diff --check`: clean

## Conclusion

This repository was reviewed for the May 2026 TanStack/npm incident and closed as SAFE for the incident window. No secret rotation was indicated by the evidence collected in this audit.
