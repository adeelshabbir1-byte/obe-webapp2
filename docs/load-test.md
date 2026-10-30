# Load test

k6 scripts in `tests/load/`. They run against a **preview or local build that uses the test database** (demo institute from `tests/e2e/seed.ts` plus `tests/load/seed-load.ts`: 5,000 students, 300 teachers, 120 offered courses, 100,000 transcript rows). Never against production.

```
E2E_DATABASE_URL=postgres://…/obe_e2e npx tsx tests/e2e/seed.ts
E2E_DATABASE_URL=postgres://…/obe_e2e npx tsx tests/load/seed-load.ts      # also writes tests/load/ids.json
k6 run -e BASE_URL=<preview or local URL> tests/load/marks.js
k6 run -e BASE_URL=<preview or local URL> tests/load/registration.js       # 500 students in 10 minutes
k6 run -e BASE_URL=<preview or local URL> tests/load/results.js            # 2,000 students in 15 minutes
```

Each run writes its summary (p95 per request, error rate) to `tests/load/results/`.

## Results so far (2026-10-30)

Setup: production build (`next start`) on one Windows laptop process, local Postgres 16 (Docker), no pooler.

### Marks entry — 100 teachers at the same moment, 30 saves each (3,200 requests)

| Request | p95 | average | max |
|---|---|---|---|
| Save a mark (API) | 0.30–0.50 s | 0.21 s | 4.0 s |
| Staff sign-in | 1.9–2.1 s | 1.3 s | 2.3 s |
| Marks Entry page (250 students) | 8.8–9.0 s | 7.6 s | 9.1 s |

Errors: **0 %**. The same requests one at a time: Marks Entry page 0.16 s, staff sign-in 0.12 s, student sign-in 0.06 s, student dashboard 0.04 s, transcript 0.29 s, registration 0.05 s.

What it means: saving marks holds up well. The slow Marks Entry page is 100 page renders queueing on **one** local Node process (about 75 ms of CPU each); on Vercel every request gets its own function instance, so the per-request time (≈ 0.2 s) is what teachers see. No database query took over 300 ms during the runs (the app logs any that do as `[slow-query]`).

### Registration day and result day

Started but not completed before this was merged; run them on a preview with the test database and add the numbers here.

## Fixed after the runs

- **Marks Entry page:** its six independent reads now run together instead of one after another; it reads only the student fields it shows.
- **Transcript (result day):** each current course's result, grading scale, approval and publication were read one course after another (N+1); they are now read together.

## Settings for production (Supabase)

- `DATABASE_URL` on the **pooler**: port 6543 with `?pgbouncer=true&connection_limit=1` (System Health checks this). One Prisma client per function instance is already cached (`lib/db.ts`).
- `DIRECT_URL` (port 5432) only for migrations.
- If result day is heavy: raise Supabase's pool size or compute add-on for that week; the app itself needs no change.
