# Safe Lead Analysis Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one click on `Prospectar` create leads and immediately analyze the pending queue safely, with visible ETA, Gemini rate-limit backoff, and a stop-after-current-batch control that actually responds.

**Architecture:** Keep the existing Supabase Edge Functions and React workspace. The backend still processes bounded chunks so it does not hit Edge Function wall time, while the frontend owns orchestration, ETA, interruption, and automatic chaining from comment scraping into analysis. The backend returns rate-limit metadata so the UI waits instead of treating quota pressure as a fatal stop.

**Tech Stack:** React/Vite, Supabase Edge Functions, Apify actors, Gemini/OpenAI-compatible classification endpoint, Vitest.

---

### Task 1: Queue Helpers

**Files:**
- Modify: `src/contentMetrics/ContentMetricsWorkspace.jsx`
- Test: `src/contentMetrics/ContentMetricsWorkspace.test.jsx`

- [ ] Add pure helper coverage for ETA and interruptible wait behavior.
- [ ] Export small helpers from the workspace file for tests.
- [ ] Keep the batch size and wait defaults conservative and centralized.

### Task 2: Backend Rate-Limit Metadata

**Files:**
- Modify: `supabase/functions/enrich-leads/index.ts`

- [ ] Return `retryAfterSeconds`, `recommendedBatchSize`, and `estimatedSecondsPerLead` when the LLM returns 429.
- [ ] Keep leads pending on 429.
- [ ] Do not mark rate-limited leads as failed.

### Task 3: One-Click Prospecting Flow

**Files:**
- Modify: `src/contentMetrics/ContentMetricsWorkspace.jsx`
- Test: `src/contentMetrics/ContentMetricsWorkspace.test.jsx`

- [ ] After `prospect-post` succeeds and creates opportunities, refresh data and start the pending analysis loop automatically.
- [ ] Make `Parar após este lote` interrupt rate-limit sleeps.
- [ ] Show ETA and next retry time while the queue runs.

### Task 4: Verification

**Commands:**
- `npm test -- --pool=threads src/contentMetrics/ContentMetricsWorkspace.test.jsx --run`
- `npm test -- --pool=threads src/contentMetrics/repository.test.js src/contentMetrics/ContentMetricsWorkspace.test.jsx supabase/functions/_shared/content.test.ts --run`
- `npm run build`
- `git diff --check`
