# Content Metrics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the complete Content Radar metrics workspace, historical LinkedIn import, Supabase data model, automated collectors, classification, cron, and setup documentation defined in the approved SPEC.

**Architecture:** Pure JavaScript domain modules normalize and aggregate content independently of React or Supabase. The Vite app reads secure Supabase views, falls back to a generated local historical snapshot when the new schema is unavailable, and renders a path-aware metrics workspace inside the existing shell. Supabase migrations own storage/RLS/views/cron; Deno Edge Functions own privileged external collection.

**Tech Stack:** React, Vite, Framer Motion, Lucide, Recharts, Supabase JS/Postgres/Edge Functions/Cron, Vitest, Testing Library, TypeScript scripts executed with `tsx`.

---

### Task 1: Test harness and historical normalization

**Files:**
- Modify: `package.json`
- Create: `src/contentMetrics/normalize.js`
- Create: `src/contentMetrics/normalize.test.js`
- Create: `scripts/build-linkedin-snapshot.mjs`
- Create: `src/contentMetrics/data/linkedin-history.json`

- [ ] Add Vitest and scripts for `test`, `test:run`, `build:snapshot`, and `import:linkedin`.
- [ ] Write failing tests for format priority, first-line hook extraction, CTA extraction, metric totals, stable IDs, and malformed records.
- [ ] Run `npm run test:run -- src/contentMetrics/normalize.test.js` and confirm failures reference missing exports.
- [ ] Implement only the normalization behavior required by the tests.
- [ ] Generate the local snapshot from the two provided JSON files.
- [ ] Verify the generator reports exactly `Fernando=105`, `Victor=117`, `total=222`, and `duplicates=0`.

### Task 2: Supabase schema, RLS, views, and import

**Files:**
- Create: `supabase/migrations/202607010001_content_metrics.sql`
- Create: `scripts/import-linkedin-history.mjs`
- Create: `scripts/import-linkedin-history.test.js`

- [ ] Write failing import tests for CLI argument validation, account upsert shape, post upsert shape, append-only historical snapshots, skip accounting, and dry-run output.
- [ ] Implement the importer with `--file`, `--owner`, `--account-url`, `--collected-at`, and `--dry-run`.
- [ ] Create all eight tables, enum checks, indexes, updated-at triggers, four `security_invoker` views, read-only frontend policies, and explicit grants.
- [ ] Add verification SQL in comments for 222 posts, no duplicate URLs/IDs/snapshots, enabled RLS, and view row counts.
- [ ] Run both historical imports in dry-run mode and assert their totals.

### Task 3: Tested analytics repository and selectors

**Files:**
- Create: `src/contentMetrics/repository.js`
- Create: `src/contentMetrics/repository.test.js`
- Create: `src/contentMetrics/analytics.js`
- Create: `src/contentMetrics/analytics.test.js`

- [ ] Write failing tests for Supabase-to-domain mapping and local fallback behavior.
- [ ] Implement a repository that reads latest-metric views plus accounts/imports/runs and returns a source/freshness descriptor.
- [ ] Write failing selector tests for date/person/channel/format/theme/CTA filters, KPI totals, creator comparison, monthly/weekly trends, top content, format/theme/CTA performance, and zero states.
- [ ] Implement pure analytics selectors and keep all score formulas centralized.
- [ ] Run the focused tests and the full suite.

### Task 4: Metrics workspace and URL navigation

**Files:**
- Create: `src/contentMetrics/ContentMetricsWorkspace.jsx`
- Create: `src/contentMetrics/components.jsx`
- Create: `src/contentMetrics/charts.jsx`
- Create: `src/contentMetrics/contentMetrics.css`
- Create: `src/contentMetrics/ContentMetricsWorkspace.test.jsx`
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

- [ ] Write failing UI tests for the Felipe-only Métricas entry, direct path parsing, local snapshot notice, period/person filters, sub-navigation, top ranking, post table, YouTube empty state, accounts, imports, and settings secret masking.
- [ ] Add the new desktop and mobile navigation entries without changing the existing dashboard behavior.
- [ ] Implement path/history synchronization for every `/content-dashboard` route from the SPEC.
- [ ] Build the overview around one dominant trend, compact KPI line, creator comparison, and ranked content table.
- [ ] Build LinkedIn/posts analysis and operational tables from the 222-record local snapshot or Supabase data.
- [ ] Build YouTube/videos/accounts/imports/settings states from Supabase data with honest unconfigured states.
- [ ] Add responsive layout, keyboard focus, accessible labels, reduced-motion handling, staggered workspace entrance, chart transitions, and row affordances.
- [ ] Run UI tests, `npm run build`, and inspect output for warnings.

### Task 5: YouTube collector

**Files:**
- Create: `supabase/functions/_shared/content.ts`
- Create: `supabase/functions/_shared/content.test.ts`
- Create: `supabase/functions/collect-youtube/index.ts`

- [ ] Write failing shared-helper tests for channel resolution, YouTube page-token pagination, ISO duration preservation, video normalization, and error serialization.
- [ ] Implement shared CORS, authenticated invocation, Supabase admin client creation, run logging, and safe upserts.
- [ ] Implement channel statistics, uploads playlist traversal, batched video statistics, entity upserts, and daily account/video snapshots.
- [ ] Ensure every path finalizes `collection_runs` and never exposes `YOUTUBE_API_KEY`.

### Task 6: LinkedIn collector and classifier

**Files:**
- Create: `supabase/functions/collect-linkedin/index.ts`
- Create: `supabase/functions/classify-content/index.ts`
- Create: `supabase/functions/_shared/classification.test.ts`

- [ ] Write failing helper tests for Apify run polling, dataset normalization, historical snapshot preservation, enum validation, and invalid model JSON.
- [ ] Implement the Apify actor flow using `APIFY_TOKEN` and `APIFY_LINKEDIN_ACTOR_ID`, with bounded polling and per-run evidence.
- [ ] Upsert posts and append `apify_daily` snapshots without altering `historical_json` rows.
- [ ] Implement pending-content classification through `CLASSIFICATION_API_URL`, `CLASSIFICATION_API_KEY`, and `CLASSIFICATION_MODEL`.
- [ ] Validate all five classification fields before updating a record; record invalid responses without inventing labels.

### Task 7: Cron, operations, and end-to-end verification

**Files:**
- Create: `supabase/migrations/202607010002_content_collection_cron.sql`
- Create: `docs/content-dashboard-setup.md`
- Modify: `README.md`

- [ ] Add Vault-backed `pg_cron`/`pg_net` jobs for `09:00 UTC` and `09:30 UTC`, matching 06:00/06:30 São Paulo standard time, with idempotent job names.
- [ ] Document schema deployment, import commands, required secrets, function deployment, cron verification, manual invocation, local fallback semantics, and troubleshooting.
- [ ] Run `npm run test:run`, both import dry-runs, snapshot generation, and `npm run build`.
- [ ] Start the app and verify all desktop/mobile metrics routes in a browser, including filter changes, fallback notice, tables, empty states, no console errors, and preserved existing app flows.
- [ ] Audit every numbered SPEC requirement against files, tests, rendered behavior, and SQL verification evidence before declaring completion.
