# Content Metrics Dashboard Design

## Outcome

Add a new **Métricas** workspace to Content Radar that turns the existing Fernando and Victor LinkedIn exports into an immediately useful historical dashboard, while also providing the complete Supabase foundation for daily LinkedIn and YouTube collection.

The feature preserves the current voting, idea, calendar, and editorial dashboard workflows. Metrics are a separate Felipe-only area because they answer a different question: what published content actually performed.

## Scope

The implementation covers the complete referenced SPEC:

- historical LinkedIn import for 105 Fernando posts and 117 Victor posts;
- normalized Supabase schema, secure views, import logs, and collection logs;
- overview, LinkedIn, YouTube, posts, videos, accounts, imports, and settings surfaces;
- Apify LinkedIn collection, YouTube Data API collection, and classification Edge Functions;
- daily cron SQL for 06:00 YouTube and 06:30 LinkedIn in `America/Sao_Paulo`;
- setup and operations documentation.

External collection only becomes live after operators set the Apify, YouTube, and classification credentials. Until then, the historical LinkedIn dashboard remains fully useful and the unavailable areas report their configuration state honestly.

## Product structure

The existing sidebar gains **Métricas** for Felipe. The metrics workspace has a compact local sub-navigation:

1. Visão geral
2. LinkedIn
3. YouTube
4. Posts
5. Vídeos
6. Contas
7. Importações
8. Configurações

The app is currently a single-page Vite React application without a router. To keep the change compatible, the metrics workspace uses URL paths through `history.pushState` and handles `popstate`, while rendering inside the existing application shell. Direct links map to the matching metrics section.

## Visual thesis

A restrained editorial analytics desk: white and ink surfaces, LinkedIn blue as the single accent, thin dividers, large decisive numbers, and charts that feel like working instruments rather than a grid of decorative cards.

The first screen starts with period and creator filters, then a compact KPI line, one dominant trend chart, creator comparison, and a ranked content table. Operational sections favor tables and status rails. Empty and unconfigured states say exactly what is missing.

## Interaction thesis

- The workspace and chart series enter with a short stagger so hierarchy is immediately legible.
- Filters transition the numbers, chart paths, and rankings in place without page reloads.
- Rows expose secondary actions on hover/focus while retaining keyboard access and reduced-motion support.

## Data architecture

`content_accounts` owns monitored identities. LinkedIn posts and YouTube videos reference an account. Each content entity has append-only daily metric snapshots. `import_batches` and `collection_runs` preserve operational evidence.

Historical JSON is a single snapshot dated `2026-05-12`; it must never be presented as historical day-by-day growth. Current views select the latest snapshot per item. Growth views operate only where multiple account snapshots exist.

All public-schema tables have RLS enabled. Frontend reads use explicit read-only policies. Mutating collection operations use Edge Functions with server-side secret credentials. Views use `security_invoker = true`. No service key, Apify token, YouTube key, or model key is bundled into the frontend.

## Normalization rules

- Format order: repost, video, carousel, image, text.
- Hook: first non-empty line, capped at 240 characters.
- CTA: explicit `comenta` or `comente` keyword patterns; no invented CTA.
- LinkedIn score: `likes + comments * 3 + shares * 4`.
- YouTube engagement rate: `(likes + comments) / views * 100`.
- Duplicate identity: LinkedIn `external_post_id` plus unique `post_url`; YouTube `video_id`.
- Snapshot identity: content, metric date, and source.

## Frontend data flow

The metrics repository requests Supabase views and operational tables. If the content schema is not deployed or is temporarily unavailable, the app uses a bundled normalized snapshot generated from the two supplied JSON files. The interface clearly labels this as **Snapshot histórico local**. Once Supabase data exists, it becomes authoritative without changing the UI.

Filtering and aggregation run in pure tested selectors. The UI receives already-normalized summary, trend, ranking, creator, format, theme, and CTA series.

## Collection flow

`collect-youtube` resolves missing channel IDs, reads channel/video public statistics, upserts entities, appends the daily snapshots, and records a collection run.

`collect-linkedin` starts the configured Apify actor for each active LinkedIn account, waits within the function runtime budget, reads the result dataset, normalizes posts, upserts entities, appends the daily snapshots, and records failures per run.

`classify-content` processes pending records through an OpenAI-compatible JSON endpoint configured only by environment variables. It validates every returned enum before persisting.

Cron calls the collection functions through `pg_cron` and `pg_net`, reading the project URL and invocation key from Supabase Vault.

## Failure behavior

- Missing content tables: show the bundled historical snapshot and a setup notice.
- Missing external credentials: keep the relevant collector disabled and display the missing secret names.
- Partial collector failure: preserve completed accounts and record the error in `collection_runs`.
- Malformed import item: count it as skipped, retain its error detail, and continue.
- Empty filters: show a clear zero state without stale totals.
- LinkedIn outliers remain visible, but rankings expose raw values and do not silently rewrite source data.

## Verification

- Unit tests cover normalization, CTA extraction, aggregation, filters, deduplication, and collector helpers.
- Import dry-run proves 105 Fernando + 117 Victor = 222 normalized unique records.
- Build and test suites must pass.
- Browser verification covers desktop and mobile navigation, filter updates, rankings, tables, empty states, and console errors.
- SQL includes verification queries for row counts, duplicate keys, view output, RLS, and cron jobs.

## Non-goals

- Reconstructing historical daily growth that does not exist in the source JSON.
- Scraping YouTube HTML.
- Exposing secrets or service-role operations in the browser.
- Replacing the existing editorial dashboard or voting workflow.
