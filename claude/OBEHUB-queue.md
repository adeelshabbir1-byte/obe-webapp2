# OBEHUB — build queue

## Queue

### Prompt 10 — taken by Irfan, 2026-10-30 (in progress; three builds)

- **Build A** — 1 Topic Workspace fixes (lecture numbers, which version opens / followers open the base, topic panel follows clicks, proposals by intent + redesigned view, book chapters per topic) · 2 Course Repositioning layout · 3 Reset this semester's offering (snapshot, restore within 7 days) — taken by Irfan, 2026-10-30
- **Build B** — 4 Course Catalog (Computing, Management Sciences, Engineering) · 5 Counselling time pickers · 6 Teacher calendar & appointments · 9 Best / average / worst student samples — taken by Irfan, 2026-10-30
- **Build C** — 7 FDP / training · 8 AI checks (exam papers, SE plan) · 10 Visiting faculty, biometric attendance, pay — taken by Irfan, 2026-10-30

## Built — history

### Prompt 4 — batch set-up, OMC and SE workflow · commit `13b84aa6` · 2026-10-25

Migrations to run in Supabase (each safe to run twice): `prisma/migration_batch_flow.sql`, `prisma/migration_batch_omc.sql`, `prisma/migration_se_plan_votes.sql`, `prisma/migration_omc_rules.sql`.

1. **Create Selected Intakes → guided set-up.** `/api/coordinator/new-intake` returns each `batchId` and `setupHref`; one intake goes straight to step 2 (source) with step 1 ✓; several show one row each, "Step 2: choose its courses →". "+ New batch (step by step)" ends in the same set-up (`/coordinator/batches/[batchId]/setup` opens the next open step).
2. **Sync & equalise on Content Sync.** `/omc/content-sync?batchId=&setup=` loads the batch and the program's earlier batches, shows "Synced N of M", suggested links, courses with no earlier course ("new course" each or "Mark the rest as new") and "Back to the batch set-up →". Content Sync is open to the Program Lead for their own courses (OMC keeps full access). The inline "Equal to (already taught)" table is gone from the courses page. Later steps are never blocked; only opening registration (and offering the batch's courses) waits.
3. **Synced course defaults.** A synced course takes the previous batch course's semester (unless the Program Lead moved it by hand — then never again), home department and Subject Expert; its plan comes with the sync, and an OMC-approved plan counts as approved with a recheck warning. Board: "S5 (as in BSCS Fall 2026)".
4. **13-step guided set-up** with a progress strip on the existing pages (`?setup=<batchId>`): Batch · Source · Tracks · Preview & import · Sync & equalise · Home department · Final names & codes · Semester positions (Course Repositioning, editable by the PL for own batch; "Positions are final →") · Prerequisites ("Prerequisites are final →") · Electives / IDS · Subject Experts (defaults from the previous batch or the curriculum owner) · GA mapping check (read-only, warnings) · Review & send to OMC (`/coordinator/batch-review`: checklist, three-way comparison with totals vs council rules and course-by-course tags, PDF / Excel). Progress per batch with who and when; Batches page shows "N of 13 · Continue set-up →".
5. **OMC approval of a batch** (`/omc/batch-review`): department OMC (org-chart Convener + members, else the department's OMC people; Convener falls back to whoever covers the position) reviews in 7 steps, makes proposals with reasons; the Program Lead agrees / disagrees with comments; members endorse ("Endorsed 3 of 5 · waiting: …"); once more than half endorse the Convener finalises — accepted proposals are applied, the PL's opinion stays on record, no send-back; PL, HOD and Dean are told; the summary is kept as evidence.
6. **Registration gate and red flags.** Registration opens only when every offered course of the batch has an OMC-approved plan (synced approved plans count); red flags with what is missing and the SE deadline on the batch board, the SE's course list and the OMC queue; offering is blocked while steps 5–6 are open.
7. **SE plan step by step** (strip on the SE course pages: details · CLOs · lecture plan · assessments · midterm & final questions · review & submit), "Rechecked — no change" for carried approvals, OMC votes per round ("Votes: 2 of 5 approved · waiting: …"), Convener confirms; OMC suggestions per step / item with reasons, SE adds or replies; Convener can finalise the OMC's version — permanent note "Finalised by the OMC, not the Subject Expert" on the plan, course file and course description report.
8. **OMC rules.** Assessment limits per category (Core theory, Lab, General Education, Capstone, Elective) on the Assessment Rules page: Convener opens rounds, members give figures + comments, Convener finalises each category (locked until reopened, history kept); SE plans and teachers' weights are checked against locked limits. Weight exceptions and plan / topic change requests: two approvals approve, two rejections with reasons reject, or a 3-member semester panel decides 2 of 3; requester sees "Approved by A and B" / "Waiting: 1 of 2"; requests waiting over 3 days are flagged to the Convener.

Tests: `tests/prompt4.test.ts` (unit); database integration and HTTP end-to-end runs (Program Lead → OMC → HOD/Convener → SE) passed on the dev and production builds.

### Prompt 2 — approvals inbox, head dashboard, sign-off, search, help desk, counselling, library, assets, recruitment, ORIC, billing · commit `24a54ff5`

### Prompt 1 · commit `d825d2f`
