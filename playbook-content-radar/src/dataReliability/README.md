# Data-sync reliability harness

Guards the end-to-end content-radar data pipeline
(**Apify → Supabase edge functions → views → dashboard**) against the failure class that
breaks a sync silently: a read/write the database rejects, or an item that gets dropped or
overwritten without anyone noticing.

Run it:

```bash
npm run test:data      # just the reliability suite
npm run test:run       # the whole project suite
```

## What it checks

| File | Guard |
|------|-------|
| `schema.js` | The **single source of truth** for the DB — every table's columns, CHECK enums, UNIQUE keys, NOT NULL, and generated columns, transcribed from the migrations. Update this when a migration changes. |
| `columnReferences.test.js` | **Static scanner** over every edge function + script. Fails if any `.select()/.insert()/.update()/.upsert()` names a column or CHECK-enum value the schema doesn't have. This is the guard that would have caught today's failure. Includes self-tests so it can't rot into a no-op. |
| `normalizerContract.test.js` | **Contract fuzz.** Feeds hostile Apify payloads through the real shared normalizers and asserts every row they emit is one the DB will accept (valid columns/enums, non-negative metrics, no writes to generated columns). |
| `fakeSupabase.js` | In-memory Supabase that **enforces the real schema** (UNIQUE, CHECK, generated cols, `onConflict`, `.single()`), so the write path can run end-to-end in CI without touching production. |
| `syncE2E.test.js` | **End-to-end.** Runs the collector write pattern against `fakeSupabase` and locks in: per-item isolation (one bad row can't abort the account), idempotent re-collection, classification not reset to `pending`, and `post_url` collisions contained to a single item. |

## Bugs this harness was built around (found by the red-team sweep, all fixed)

1. **`content-dashboard-api` post-history** selected non-existent `impressions` / `collected_at` → endpoint 500'd on every call.
2. **`content-dashboard-api` PATCH** wrote non-existent `classified_at` → every manual reclassification 500'd and the edit was lost.
3. **`collect-linkedin`/`collect-youtube`** per-item loop had no try/catch → one bad item aborted the whole account's remaining items.
4. **Re-collection** reset `classification_status` back to `pending`, wiping classified/manual state and re-burning classification API calls daily.
5. **`collect-instagram`** used `inputUrl` (shared profile URL) as an identity fallback → could collapse every post to one row.
6. **`collect-instagram`** threw on an unparseable date → the post was silently dropped from the sync.
7. **PATCH on a missing id** returned 500 instead of 404.

## When you change the schema

1. Update `schema.js` to match the migration.
2. Run `npm run test:data`. If a normalizer or edge function now writes something the new
   schema rejects, one of these tests fails **before** it reaches production.
