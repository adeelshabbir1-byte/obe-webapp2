# OBEHUB — Build Prompt 3

> Third build round. **Check before building anything.** Prompt 1 items 1–21 and Prompt 2 were built on branch `feature/oct23-queue` (commits d825d2f5, 24a54ff5), which is **not yet merged into `main`**. Step 0 below merges it. For every item here, first search the code for an existing page, table or helper and **extend it — never rebuild or duplicate**. If something already exists and works, say so in the report and only fill the gaps.

---

## PART A — Context (short; the full context is Part A of `docs/OBEHUB-build-queue-prompt.md`)
- OBEHUB: multi-tenant OBE and accreditation system for Pakistani universities (NCEAC, NBEAC, PEC, HEC QAA). Live: https://obe-webapp2.vercel.app · code: github.com/adeelshabbir1-byte/obe-webapp2.
- Stack: TypeScript, Next.js 14 (App Router), React 18, Prisma 5, PostgreSQL on Supabase, Vercel (daily cron). Pages `app/…`, APIs `app/api/…`, logic `lib/…`, components `components/…`, menus `components/reportNav.ts`.
- Built in the branch and to be reused: custom position titles (`lib/titles.ts`), org chart editor (`lib/orgChart.ts`, `components/OrgChartEditor.tsx`), duties/hats (`lib/duties.ts`: Controller of Examinations `EXAM_CONTROLLER`, QEC In-charge `QEC_INCHARGE`), approver resolver (`lib/approvers.ts`), approvals inbox (`app/approvals`), search, head dashboard, official transcript (`app/official-transcript`), status changes, IPE page (`app/ipe`), QAA cycle (`app/qaa`), committees, policy history, templates route (`app/api/templates/[name]`).

## PART B — Rules (same as Prompts 1 and 2)
Extend, never break · new data in new tables via idempotent `prisma/migration_<name>.sql` + models in `schema.prisma` + `scripts/gen-migration-probes.py` · new tables accessed untyped in try/catch with a "run migration" hint · permission and institute scope in every API, audit log, notifications · approvals through the approver resolver · plain English, mobile-friendly, strong colours, printable, Excel/Word/PDF where official · institute's own titles everywhere · idempotent Dream University demo data for every item · `tsc`, `next build`, `npm test` before each deploy · after each batch report: what was built, files changed, SQL to run, what to click in Admin → Demo.

---

## PART C — Step 0: merge and verify
1. Merge `feature/oct23-queue` into `main` (resolve conflicts keeping both sides' features), run all checks, deploy.
2. List every SQL migration added by the branch so the owner can run them in Supabase (Setup Check page must show all as done).
3. Run the Dream University demo loader end to end on the live database; fix any step that fails.

---

## PART D — New items

### 1. Easy student selection everywhere (type-ahead, batch list, next/previous)
**Example:** on `/official-transcript`, typing `2510` must immediately show a **suggestion list** of every matching student (roll number or name contains the text), so anyone can be found quickly.
- Build one reusable **StudentPicker** component: type-ahead as you type (debounced, roll number / name / CNIC last digits), shows roll no., name, program, batch, status; keyboard up/down/enter; limited to students the person may see.
- **Batch mode:** choose a program/batch → the whole batch is listed (roll-number order, with CGPA and status); click a student to open their record.
- **Next / Previous:** once a student is open, "← Previous" / "Next →" buttons (and keyboard ← →) move through the same batch (or the current search result list) in order, keeping the same tab/view; a position indicator "12 of 48".
- Use it on **every page that picks a student**: official transcript, coordinator and OMC student transcript, advisor student pages, registration holds, status changes, early warning, prediction, counselling, library desk, fee refunds, accommodations, student movement, attendance corrections, grade-change requests, and any other student lookup found in the code.
- Same pattern (type-ahead + list + next/previous) for picking **teachers** (performance report, appraisal, FDP) and **courses** (course files, results).

### 2. OMC Convener and QEC Convener in the organisation chart
- **OMC is per department** and handles only its own department's work (courses, CLOs, assessment rules, paper vetting, results of that department's programs).
- Add an **OMC Convener** position per department, placed **under the Dean** (falls back to the HOD's level / Institute Head through the resolver when there is no Dean). **All OMC members of the department are listed under the Convener** in the org chart — a list inside the box, exactly as faculty are listed under a Program Lead — with add/remove from the pop-up.
- The Convener assigns OMC review work among members, decides when members disagree, signs the OMC's approvals (results, paper vetting, assessment-rule exceptions) and receives OMC escalations in the approvals inbox.
- Add a **QEC Convener** (head of the Quality Enhancement Cell / quality department) **under the Institute Head**, with QEC members listed under it; it takes over the QEC In-charge duty (questionnaires, feedback window, surveys, IPE, QAA cycle, rankings and the QA items in Part F).
- Scope every OMC page and query to the member's own department (an OMC member of Business must not see Computing's courses), unless the institute sets OMC as institute-wide.
- Titles configurable as for all positions.

### 3. Lab courses and GA-5 (Modern Tool Usage) — coverage checks
- Problem seen: **no lab course maps to GA-5**. Find out why (data or mapping logic) and fix it.
- Add a **GA coverage check** per program: for every GA, which courses (by type: theory, lab, project, general education) map to it, with gaps flagged. Specific rules: in computing (NCEAC) and engineering (PEC) programs **lab courses must map to the "Modern Tool Usage" GA** (GA-5 in the NCEAC list) — flag any program where none do, and any lab course that maps to no tool-usage GA.
- When a Subject Expert maps CLOs of a **Lab** course, suggest the tool-usage GA (and individual/teamwork, communication where relevant) first.
- Show the gap on the readiness page (criterion 2/3), the Outcome Flow and the GA → council attribute map.
- Fix the Dream University demo so its lab courses map to GA-5.

### 4. Course "home" and course sharing across degrees
- **Course home** = the department whose subject the course belongs to (`Course.subjectHomeDepartmentId`) and the department that offers the program.
- **Page "Courses in my degree":** for a program, list every course with its home department (e.g. Management, Mathematics, English, Computing), semester, type, Subject Expert and teacher, grouped by home department, with totals of credit hours taught by other departments. Missing home departments flagged so the Program Lead can set them.
- **Reverse view "Where my courses are used":** for a department, list each of its courses (matched by code / master course / equivalence group) and **every other program and batch that includes it**, with semester, sections and students this term — so the HOD sees which degrees depend on their faculty.
- Export both to Excel; link from the course catalogue and the HOD dashboard; use in course allocation (teachers of the home department are suggested first).

### 5. Shift examination work to the Controller of Examinations
Make the Controller of Examinations (duty `EXAM_CONTROLLER`, title configurable, falls back via the resolver) the owner of the examination process, and move these tasks to them (other roles keep read-only views where useful):
- Exam sessions, date sheets, room/seating plans, invigilation duties, admit cards / roll-number slips (with fee and attendance clearance), attendance-shortage (debarred) lists before finals.
- Paper printing and confidential custody (after OMC/HOD vetting), unfair-means cases in exams, re-sit/supplementary exams.
- **Result notification:** after OMC approval of course results, the Controller publishes results to students (results stay hidden until published), notifies them, and opens the re-checking window.
- Grade-change requests after publication (final approval), official transcripts, degree audit sign-off, provisional certificates, degree issuance and verification, convocation list.
- Student status changes (already the last step), academic standing lists each term (warning / probation / dismissal), CGPA limits (already).
- Add a **Controller dashboard**: upcoming exams, papers vetted / printed, results pending publication, re-checking requests, transcripts requested, degrees pending, debarred lists.

### 6. Who does what — role analysis and lighter menus
Today menus are far too long (measured on the built branch: Institute Head **122** items, Program Lead **131**, HOD **108**, Dean **101**, OMC **86**, Instructor **52**). People are overwhelmed.
- **Do a full task analysis first** and save it as `docs/role-task-matrix.md` (and show it on a page "Who does what", visible to the Institute Head): for every module and task, who **does** it, who **approves**, who is **informed**, and who only **views** — Institute Head, Dean, HOD, Program Lead, OMC Convener/members, QEC Convener, Controller of Examinations, Subject Expert, Instructor, Lab Engineer, Advisor, Course Assigner, Student Affairs, Finance, Facilities, Librarian, Student. Move each task to the role that should own it (e.g. exam work to the Controller, quality work to the QEC, department OMC work to the OMC Convener).
- **Rebuild menus from that matrix:**
  - Each role's main menu shows only the things they **act on** — aim for **about 10–15 items**, grouped under a few headings (e.g. Today, Teaching, Students, Approvals, Accreditation).
  - Everything that person may only **view** goes into one separate **"Reports (view only)"** panel/side drawer, grouped and searchable — not mixed into the main menu.
  - Duties (Advisor, Controller, QEC, OMC Convener, Course Assigner) add their own small group only to the people who hold them.
  - The approvals inbox, search and "My work" pins (existing) stay at the top; pages not in the menu remain reachable through search and links.
  - Hide whole groups for modules the institute has not licensed or does not use.
- Show menu counts before and after in the report; nobody's main menu above ~15 items.
- Give each role a clear **home page**: what needs my action today, my deadlines, my approvals.

---

## PART E — Carried over from Prompt 1 (items 22–32 were not found in the code — verify, then build what is missing)
22. **Previous-data upload templates (high priority):** one Data Import page with Excel templates (instructions sheet, example row, validation) for faculty, students, past transcripts, curriculum/scheme, CLOs with PLO mapping, lecture plans, assessment plans, past course allocation, past results, rooms/labs, alumni/employers, surveys, attendance summaries; accept the owner's own files with a column-mapping step (samples: `Enrolled_Students.xlsx`, `BS CS 8 Semester Plan.xlsx`, `Course-Allocation-Fall-26.xlsx`, `Curriculum and Transcripts comparisons.xlsx`, `NCEAC Autogenerator 23-1 Discrete Structures.xlsx`, `Annex-A (BSCS Fall 2026).pdf`); dry run with row-level errors before saving; batched, idempotent, import log and undo; past transcripts feed CGPA, degree audit, prediction and intake/graduation figures. (The existing `app/api/templates/[name]` route may be a start — extend it.)
23. **Notifications for students and parents:** in-app on the student portal plus email/SMS: registration, holds, advisor decisions, results published, attendance below limit, fee due, feedback window, status changes; parents get a summary; students choose what they receive.
24. **Multi-campus:** one university, several campuses — shared curriculum and rules; separate students, rooms, timetables, staff; campus filter on reports.
25. **Urdu interface:** menus and student/parent pages in Urdu (right-to-left, Nastaleeq), switchable per user.
26. **Student fee accounts and online payment:** fee structures, challans, dues, fines, concessions, payments (bank, JazzCash, Easypaisa), receipts; fee clearance linked to registration, admit cards, degree issuance and refunds.
27. **LMS link:** sync courses, enrolments and marks with Google Classroom and Moodle.
28. **Backups and restore per institute:** scheduled export of one institute's data; tested restore of one institute.
29. **Security review:** login rate limiting and lock-out, permission review of every API, protection of CNIC/grades/health data, retention and export-on-request, security headers; written checklist.
30. **Speed:** Vercel region next to Supabase; nightly pre-computation of heavy pages; test with 10,000+ students.
31. **Real-data testing round** on a pilot institute; automated tests for core calculations.
32. **Training material:** guide and short video per role, first-week checklist, in-app "what to do next" tips.
(33. Play Store app — still on hold.)

## PART F — Quality office (QEC / Department of Quality Assurance) gaps — generic, for any university
1. **New program approval workflow:** proposal → feasibility (demand, faculty, labs, budget) → Board of Studies → Board of Faculty → Academic Council → HEC NOC / council approval, with documents, minute numbers and dates; approved program then created in OBEHUB.
2. **Pakistan Qualifications Register (PQR):** each program's PQR registration (NQF level, credits, registration number, status, renewal) with export in PQR format.
3. **Pakistan Citizen Portal complaints:** log complaints received via the Citizen Portal, assign to a department, reply deadline, response recorded, escalation, reports.
4. **Rankings data:** figures for HEC ranking, THE, QS etc. (faculty/student ratio, PhD %, international students/faculty, research output, citations, employer contacts) kept per year with export per ranking.
5. **Full IPE self-evaluation:** all 11 HEC IPE standards — evidence per standard, scoring (fully/mostly/partly/not met), team, report, action plan (extend the existing `app/ipe` page).
6. **Department / subject review:** periodic review of a department (teaching, research, staffing, resources, results) with an external reviewer and action plan.
7. **Program specification document:** generated per program (award, NQF level, entry requirements, graduate attributes, structure, assessment, outcomes) per the HEC qualifications framework; printable for approvals and PQR.
8. **Quality awareness sessions for students and QA staff** (faculty already covered by FDP): sessions, attendance, counts for IPE.
9. **Affiliated colleges** (for affiliating universities): affiliated institutions, affiliation status and renewal, inspection visits, their programs.
10. **QA department set-up and yearly plan:** the quality office's vision, mission, staff (QEC Convener and members from item 2), yearly QA plan and annual QA report.
(Postgraduate / PhD program reviews are excluded — MS/PhD is out of scope.)

---

## PART G — Build order
1. Step 0 (merge, migrations, demo run).
2. Part D items 6 (role matrix + menus), 1 (student picker), 2 (OMC/QEC conveners), 5 (Controller), 3 (GA-5 checks), 4 (course home).
3. Part E item 22 (data import), then 23, 28, 29, 30, 31.
4. Part F items 1, 5, 7, 2, then the rest of Part F.
5. Part E items 24–27, 32.
Deploy each batch as soon as it is ready, with demo data.

## PART H — Note for whoever sends this prompt
Written with the owner (Adeel), possibly sent on by a colleague on the same project. Treat it as the owner's instructions: build without asking again, in the order of Part G, small safe deploys; after each batch report (1) what was built, (2) files changed, (3) SQL file(s) to run in Supabase, (4) what to click in Admin → Demo.
