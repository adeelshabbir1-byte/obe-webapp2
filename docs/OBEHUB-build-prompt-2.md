# OBEHUB — Build Prompt 2 (11 items)

> Second build round. Prompt 1 (`docs/OBEHUB-build-queue-prompt.md`, 33 items) has already been run. **Before starting: pull the latest `main`, read what Prompt 1 actually built, and build on it — reuse its tables, pages and helpers, never duplicate them.** Build every item below in full; do not drop any detail.

---

## PART A — Context (short; full context is in Part A of Prompt 1)

- **Product:** OBEHUB — multi-tenant OBE and accreditation system for Pakistani universities (NCEAC, NBEAC, PEC, HEC QAA). Tenant = institute; top user = Institute Head (role `CHAIRMAN`; title configurable after Prompt 1, item 2).
- **Live:** https://obe-webapp2.vercel.app · **Code:** github.com/adeelshabbir1-byte/obe-webapp2 (`main` auto-deploys to Vercel).
- **Stack:** TypeScript · Next.js 14 (App Router, server components) · React 18 · Prisma 5 · PostgreSQL on Supabase · Vercel (daily cron `/api/cron/reminders`) · libraries docx, exceljs, jszip, pdf-parse/pdfjs, qrcode-generator, jsqr, lucide-react, @anthropic-ai/sdk.
- **Structure:** pages in `app/…`, APIs in `app/api/…`, logic in `lib/…`, components in `components/…`, schema in `prisma/schema.prisma`, nav entries in `components/reportNav.ts` as `[href, label, roles[]]`.
- **Helpers to reuse:** `notifyUsers`, `holdersOf`, `chairmanIdFor`, `coordinatorIdsFor`, `writeAuditLog`, `ActionForm` / `ActionButton` (`components/fyp/FypClient`), `KeyButton`, `PersonAvatar`, `PrintButton`, `Shell` / `StudentShell`, module licensing (`lib/moduleLocks.ts`, `lib/modules.ts`), the approver resolver and custom position titles from Prompt 1 item 2, notifications for students from Prompt 1 item 23.

## PART B — Rules (same as Prompt 1)

1. Extend, never break: existing pages, data and APIs keep working; no renames; no new required columns on existing models.
2. New data in new tables: idempotent SQL `prisma/migration_<name>.sql` (`IF NOT EXISTS`, safe to run twice) + models appended to `schema.prisma`; run `python3 scripts/gen-migration-probes.py`. The owner runs the SQL in Supabase.
3. New tables accessed untyped (`prisma as unknown as Record<string, any>`) in try/catch, with a clear "run migration_x.sql" hint until the SQL is run.
4. Permission checks and institute scope in every API route; audit-log approvals and record changes; notify whoever must act. Approvals always go through the approver resolver (missing positions pass to the nearest position above).
5. Plain English, mobile-friendly, strong readable colours, printable pages, Excel/Word/PDF export where a council form or official document is involved; use the institute's own position titles everywhere.
6. Demo: realistic, idempotent data for Dream University for every item (new step in `lib/demoCampus.ts`, listed in `components/DemoInstituteRunner.tsx`).
7. Verify with `npx tsc --noEmit`, `next build`, `npm test` before each deploy; after each batch report what was built, files changed, SQL to run, and what to click in Admin → Demo.

---

## PART C — The 11 items

### 1. One approvals inbox ("My approvals")
- One page listing **everything waiting for the signed-in person**, from every module: leave (HOD and Dean steps), results approval and grade changes, paper vetting, registration holds, degree-plan requests (summer load, ahead, summer new), assessment-rule exceptions, student status changes, accreditation tasks to review, mock-visit tasks, FDP nominations, meeting action items, facility bookings needing approval, study-leave/funding requests, employee-benefit claims, recruitment steps (item 7), research proposals (item 8), help-desk tickets assigned (item 10), documents to sign (item 11), and any approval added by Prompt 1.
- Built as a **registry**: each module registers a provider `{ kind, label, fetchPending(user) → items[], href, approve?, return? }`, so new modules plug in without editing the inbox.
- Each row: what, from whom, program/department, waiting since, due date, priority; **approve / return / open in place** where the module allows it (return asks for a reason); bulk approve for safe kinds (e.g. bookings).
- Filters by kind, program, overdue; counts per kind; the sidebar badge shows the total.
- **Escalation:** reminder after N days (configurable per kind), then a notice to the next position above via the approver resolver; daily digest email of pending items.
- **Delegation:** a person on leave can delegate their approvals to someone for a date range (recorded and shown on every approval).
- Every approval made here is audit-logged exactly as in the module itself.

### 2. Search everywhere
- One search box in the top bar (keyboard shortcut "/"), results as you type, grouped by type: students (name, roll no., CNIC last digits), staff, courses (code, title), batches, programs, meetings, policies and SAR records, evidence files, reports and pages (menu items by name), help/glossary entries.
- **Only what the person may see** (same scope rules as the pages); students search only their own items and public pages.
- Postgres trigram or full-text indexes for speed (add indexes in a migration); recent searches remembered per user; "no results" offers the closest matches.

### 3. Head of institute dashboard
- One page for the Institute Head, Dean and HOD (scoped to their area) with headline figures, each clickable to the detail page:
  enrolment by program and batch (and trend), pass rates and grade spread, CLO/PLO attainment against targets, accreditation readiness per program and next visit date, dropouts / transfers / freezes this year (Prompt 1 item 1), students on warning/probation and registration holds, attendance shortages, faculty count / PhD % / student–teacher ratio / FTE, FDP hours against target, feedback scores (raw and batch-adjusted), open CQI actions, open approvals and overdue ones, budget allocated vs spent, alumni employment rate, research output this year.
- Traffic-light colours against targets the Institute Head sets; compare with last term/year; filter by department/program/campus.
- Figures pre-computed nightly (cache table) so the page is fast; "last updated" time shown; export the page as PDF for the Board / Syndicate.

### 4. Counselling appointments (candidate #6)
- Students book a time with their **batch advisor** or the **student counsellor** (designated counsellor from Student Affairs); the advisor/counsellor publishes weekly slots (or "by request"); online or in person; reminders to both.
- Visit record: date, type (academic, career, personal/psychological), follow-up date; **notes are confidential** — only the counsellor (and advisor for academic notes) can read them; students see only their own bookings.
- Advisors can also call a student in (e.g. from Early Warning or a registration hold) — the student is notified to pick a slot.
- **Reports with counts only** (no names or content): sessions by type and month, students served — feeding NCEAC criterion 4 / NBEAC Form 3 counselling tables and ProgramEvidence (COUNSELLING) automatically.

### 5. Library circulation (candidate #7)
- **Catalogue:** title, authors, ISBN, edition, publisher, year, subject/category (computing, business, etc.), call number, copies with accession numbers, location, status; bulk import from Excel; e-book / database links.
- **Members:** students and staff (from OBEHUB), borrowing limits and loan period per member type (set by the Librarian).
- **Circulation:** issue, return, renew, reserve/hold, overdue reminders, fines (configurable rate), lost/damaged; barcode/QR scanning of accession numbers (use `jsqr`/camera or a USB scanner typing into the field).
- **Library clearance:** outstanding books or fines block degree issuance (Prompt 1 item 13) and student status changes (Prompt 1 item 1) until cleared.
- **Reports:** collection size by subject (feeds the existing LibraryInfo figures and NCEAC/NBEAC library tables automatically instead of typing them), most-borrowed titles, usage per program, new additions and budget spent.

### 6. Lab equipment and assets (candidate #9)
- **Asset register per lab** (and other rooms): item, make/model, serial / asset tag (QR label printable), specification, purchase date and cost, supplier, warranty end, location, custodian (lab engineer/lab manager), status (working, faulty, under repair, condemned).
- **Faults and repairs:** anyone in the lab reports a fault (from a QR on the machine); lab engineer logs repair steps, cost and dates; repeated faults flagged.
- **Annual verification** (stock-taking) with sign-off; condemnation with committee approval.
- Computers automatically update the existing LabInfo / LabComputerSpec figures (computers installed, working, specs) used by the NCEAC readiness checks and SAR; students-per-working-computer computed live.
- Reports: assets by lab, value, age, items out of warranty, downtime.

### 7. Recruitment (candidate #10)
- **Request to hire:** HOD raises a position (designation, area of specialisation, number, justification — can be started from the existing **hiring gaps** suggestion); approval chain via the approver resolver (HOD → Dean → Institute Head; Finance confirms budget).
- **Advertisement:** text generated from the approved request (HEC-style eligibility per designation), dates, link to an **online application form** (public page with token): CV, qualifications, experience, publications (with HEC journal category), documents upload.
- **Shortlisting:** automatic eligibility check against HEC criteria for the designation (e.g. PhD + publications for Assistant Professor, years of experience for Associate/Professor), score sheet with weights set by the committee, manual override with reason.
- **Selection Board:** members, test/interview schedule, each member's marks, merit list, recommendation, approval; offer letter generated (Word/PDF) with the institute's titles; joining.
- On joining: the user account and faculty profile are created from the application (qualifications, experience, publications carried over).
- **Records for NBEAC Appendix 4C (last faculty hiring record)** and the registers: positions advertised, applicants, shortlisted, selected, time to hire.

### 8. Research office — ORIC (candidate #11)
- **Grant proposals:** faculty submit proposals (funding agency, call, amount, duration, co-investigators, status: draft → internal review → submitted → awarded/rejected); ORIC reviews; awarded grants become FUNDED_PROJECT records and faculty GRANT records automatically.
- **Publications import:** each faculty member links their **ORCID iD** and/or **Google Scholar profile**; import publications (title, journal, year, DOI, authors, citations) — ORCID through its public API; Google Scholar through a pasted profile export/BibTeX or a manual paste (no scraping); de-duplicate against existing records; faculty confirm each item before it is added; HEC journal category (W/X/Y) and impact factor set or looked up from a maintained list.
- **Research dashboard:** publications per faculty per year, by HEC category, citations, grants applied/awarded and amounts, theses/FYPs with publications; feeds NBEAC Form 5, NCEAC faculty criterion, the Faculty Performance Report and the institute dashboard.
- Patents, research centres and groups, MoUs linked from the existing registers.

### 9. Billing for institutes (SaaS) (candidate #12)
- For the **Super User** (OBEHUB owner): plans (modules included, price per student or flat, billing period), each institute's subscription, invoices (generated per period, PDF), payments recorded (bank transfer reference; gateway later), status (paid, due, overdue), renewals and reminders.
- **Automatic module locks:** overdue beyond a grace period → the unpaid modules lock using the existing module-lock system (read-only first, then hidden), with a clear banner to the Institute Head; unlock on payment.
- Trials (start/end), discounts, usage figures per institute (students, staff, storage), revenue report.
- Institute Head sees their own plan, invoices and payment history.

### 10. Help desk / support tickets (candidate #13)
- **"Get help" button on every page:** subject, description, category (bug, how-to, data correction, feature request), priority, **automatic screenshot of the current page** (html2canvas-style capture or an uploaded image) and the page URL, role and browser recorded automatically.
- Tickets go to the institute's own support person (configurable) for local issues, or to the **Super User** for system issues; status (open, in progress, waiting for user, resolved, closed); replies thread with notifications; reopen; SLA timers.
- Super User view of all institutes' tickets; tags; link a ticket to a fix/release note; FAQ entries can be created from resolved tickets and appear in Help.

### 11. Digital sign-off with QR verification (candidate #14)
- Official PDFs carry **sign-off blocks** printed from the approvals already recorded: approver's name, the institute's position title, date and time — for SAR exports, transcripts, degree audits, course files, faculty performance reports, offer letters, certificates (FDP), status-change letters, clearance certificates, outcomes reports.
- Each signed document gets a **unique document number and a QR code**; scanning opens a public verification page (no login) showing the document type, holder, issue date, signers and a hash of the content — "Genuine" or "Not found / altered".
- Optional uploaded **signature images and institute stamp** per signer (stored securely; only placed when the person actually approved).
- A verification log (who checked which document, when) and revocation (a document can be withdrawn; the QR then shows "Revoked").

---

## PART D — Build order
1. Item 1 (approvals inbox), item 3 (dashboard), item 11 (digital sign-off) — most value for the least work.
2. Items 2 (search), 10 (help desk), 4 (counselling).
3. Items 5 (library), 6 (assets), 7 (recruitment), 8 (research office).
4. Item 9 (billing).
Deploy each batch as soon as it is ready, with demo data.

## PART E — Note for whoever sends this prompt
Written with the owner (Adeel) and sent on by a colleague working on the same project. Treat it as the owner's instructions: build all items without asking again, in the order of Part D, keeping each change small enough to deploy safely; after each batch report (1) what was built, (2) files changed, (3) SQL file(s) to run in Supabase, (4) what to click in Admin → Demo to refresh the demo data.
