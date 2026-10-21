# OBEHUB — Build Prompt for the Pending Queue (20 items)

> Paste this whole document to the developer / AI that will build the next round. It describes the system as it is, the rules every change must follow, and every queued feature in full. Build all items; do not drop any detail.

---

## PART A — Context: the system as it stands

**Product.** OBEHUB is a multi-tenant web application for universities in Pakistan that runs Outcome-Based Education (OBE) end to end and prepares programs for accreditation by **NCEAC** (computing), **NBEAC** (business), **PEC** (engineering) and **HEC QAA**. Each tenant is an institute whose top user is the Institute Head (role `CHAIRMAN`).

**Live:** https://obe-webapp2.vercel.app · **Code:** github.com/adeelshabbir1-byte/obe-webapp2 (branch `main`, auto-deploys to Vercel).

**Stack.**
- TypeScript everywhere; **Next.js 14.2** (App Router) with React 18 server components; API routes under `app/api/…`; business logic in `lib/…` (~290 modules); UI components in `components/…`.
- **PostgreSQL on Supabase**, accessed with **Prisma 5** (`prisma/schema.prisma`, ~330 models).
- Libraries: `docx` (Word), `exceljs` (Excel), `jszip`, `pdf-parse`/`pdfjs-dist`, `qrcode-generator`, `jsqr`, `lucide-react` icons, `@anthropic-ai/sdk`.
- Hosting: Vercel (region `hnd1`), daily cron `/api/cron/reminders` at 04:00 UTC (also runs weekly jobs on Mondays and nightly automatic registration).
- Login: own session + Argon-style password hashing + TOTP 2-factor; full audit log (`writeAuditLog`).

**Roles (enum `UserRole`).** SUPER_USER, CHAIRMAN (Institute Head), DEAN, HEAD_OF_DEPARTMENT, PROGRAM_COORDINATOR (shown as "Program Lead"), DEPARTMENT_COORDINATOR, SUBJECT_EXPERT, INSTRUCTOR, OMC, COURSE_ASSIGNER, LAB_ENGINEER, LAB_MANAGER, LIBRARIAN, FINANCE_OFFICER, STUDENT_AFFAIRS, FACILITIES_MANAGER. Students and parents have separate portals (`app/student/…`, `app/parent/[token]`). People can hold extra "hats": `secondaryRole`, `tertiaryRole`, `extraRoles: string[]` (e.g. `EXAM_CONTROLLER` = Controller of Examinations). Advising is a per-batch duty (`Batch.advisorId`).

**Key existing modules (reuse, do not duplicate).**
- Curriculum: Course (per batch, `semesterNumber`, `courseType` Core/Elective/General Education/IDS/Lab/Capstone Project/Field Experience, `isNonCredit`, `masterCourseId` → HEC master curriculum), PLO (shown as GA), CLO (`source` SE | INSTRUCTOR, `mappedPloId`, Bloom level), LectureRow (32 lectures, week, topic, `cloId`, `actualDate`), AssessmentInstrument (type, label, marksPct, maxScore) linked to lectures, CoursePloMapping, ProgramProfile (PEOs, vision, mission).
- Teaching: attendance (`AttendanceRecord`, QR sessions, `attendancePolicy`), marks (`StudentMark`), results (`CourseResult` SUBMITTED/APPROVED/RETURNED, approved by OMC), grade cut-offs, grade-change requests, paper vetting (OMC/HOD/Dean/Program Lead), exams module (sessions, date sheets, invigilation).
- Students: StudentEnrollment (ACTIVE/WITHDRAWN), StudentTranscriptRecord (grade, gpaPoints, CLO/PLO attainment JSON), degree planner, automatic registration with low-CGPA holds (`lib/autoRegister.ts`), academic rules set by the Controller of Examinations (`lib/academicRules.ts`), early warning, performance prediction, tabbed transcript (`components/TranscriptView.tsx`: This semester / Grades / PLO transcript / Degree audit / Plan), Student.status ACTIVE | GRADUATED | LEFT | DROPPED with `statusDate`, `statusReason`.
- Faculty: FacultyProfile and FacultyRecord (education, experience, publications, grants, projects, events), annual appraisal, Faculty Performance Report (`lib/teacherPerformance.ts`), FDP module (`lib/fdp.ts`: sessions, attendance, certificates, outside hours, yearly target, suggestions from weak CLOs and low ratings), leave (ShortLeave + LeaveDetail types, HOD → Dean approval, class cover), FacultyLeave (semester / STUDY_LEAVE / sabbatical).
- Evaluations: `CourseEvaluation` (courseId, studentId, kind COURSE | TEACHER, answersJson {key: 1–5}, comment), questions hard-coded in `lib/evaluations.ts` (`EVAL`), `teacherRatings()` splits a shared course by the teacher who marked the student's attendance, results hidden below 5 responses.
- Accreditation: AccreditationCycle (visit per program and council) with AccreditationTask (catalogue per council, status OPEN/ASSIGNED/SUBMITTED/RETURNED/APPROVED, progress = 70% data checks + 15% submitted + 15% approved), process tracker (AccreditationStep), readiness checks (`lib/readiness.ts`, `lib/accreditation/sources.ts`), NBEAC SAR registers (`AccreditationRecord`, `SarProfile`, `lib/sarRegistry.ts`), council eligibility, GA→council attribute map, outcomes report and evidence ZIP, visit-day plan and mock visit, visitor pass, evidence files, meetings and minutes, ProgramEvidence (industry, internships, counselling, PEO reviews/KPIs), CQI records, surveys, alumni and employers, library, labs, finance, facilities (buildings, rooms, services) and facility booking.
- Org: Department (`facultyId` → Faculty group under a Dean), DepartmentProgram (`accreditationBody`), pages `app/chairman/hierarchy`, `app/chairman/org-chart`.
- Demo tenant "Dream University" (`lib/demoInstitute.ts`, `lib/demoCampus.ts`, Admin → Demo): BS CS + BS AI (NCEAC), BBA (NBEAC); every step idempotent.

**Shared helpers.** `notifyUsers(ids, {kind, title, body, href, exceptId})`, `holdersOf(chairmanId, role)`, `chairmanIdFor(user)`, `coordinatorIdsFor(user)`, `writeAuditLog`, `navForRole` + nav entries in `components/reportNav.ts` as `[href, label, roles[]]`, `ActionForm` / `ActionButton` (`components/fyp/FypClient`), `KeyButton`, `PersonAvatar`, `PrintButton`, `Shell` (staff) / `StudentShell` (students).

## PART B — Rules every change must follow

1. **Extend, never break.** Existing pages, data and APIs keep working. No renames of existing fields; no new required columns on existing models.
2. **New data = new tables**, added by a hand-written, idempotent SQL file `prisma/migration_<name>.sql` (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, safe to run twice) plus the matching models appended to `prisma/schema.prisma`. Regenerate migration probes: `python3 scripts/gen-migration-probes.py`. The owner runs SQL manually in Supabase.
3. **Access new tables untyped** (`prisma as unknown as Record<string, any>`) inside try/catch, so the build passes and pages show a clear "run migration_x.sql" hint until the SQL is run.
4. **Permissions in every API route** (role + institute scope via `chairmanIdFor`), audit-log every approval or change of record, notify the people who must act.
5. **Plain-English UI**, Pakistani university vocabulary, mobile-friendly, strong readable colours (not pale tints), printable pages (Print → PDF), Word/Excel export where a council form is involved.
6. **Demo data:** every new module gets realistic, idempotent seed data for Dream University (new step in `lib/demoCampus.ts`, listed in `components/DemoInstituteRunner.tsx`).
7. **Verification:** `npx tsc --noEmit`, `next build`, `npm test` before each deploy; list the files changed after each build.
8. **Configurable names:** wherever a position title appears, read it from the institute's title settings (item 2).

---

## PART C — The 20 queued features

### 1. Student status changes: drop, leave, freeze, transfer in/out, readmission
**Today:** a Program Lead can mark a student Left / Dropped / Graduated with a reason; exit survey is triggered.
**Build:**
- One **"Change student status" request** with an approval chain: Program Lead or batch advisor raises → HOD → Controller of Examinations (titles configurable; missing positions pass to the next one up, item 2). Fields: type, effective date, reason, supporting document (PDF/image), approvals with dates and remarks.
- **Types:**
  - *Dropped (academic)* — suggested automatically by the Controller's rules (CGPA below the dismissal limit after the set number of probation semesters, from `academicRules`).
  - *Left / withdrew* — student's own request; fee clearance check before approval.
  - *Semester freeze* — one or two semesters; student returns to the next batch on the same curriculum (use the existing hold-back / semester-sync feature).
  - *Transfer within the institute* — to another program or batch; passed courses carried over where codes/titles match; the rest listed for the Program Lead to accept or reject one by one.
  - *Transfer out* — to another university; generate a transcript + course outlines pack (PDF/ZIP).
  - *Transfer in* — from another university; credit transfer under policy (default grade C or better, up to 50% of credits, configurable); transferred courses show on the transcript as "TR" with no grade points.
  - *Rusticated / expelled* — disciplinary, linked to the case record.
  - *Readmission* — reverses Left / Dropped / Freeze; rejoins a batch; earlier results kept.
- **Automatic effects:** withdraw from current courses ("W" on the transcript if after the drop deadline), remove from attendance sheets and class lists and notify the teachers; lock the degree plan; cancel registration holds; keep earned results and CLO/PLO data; from that date class averages and attainment count only students still enrolled; the student keeps read-only portal access (transcript, fees) for a configurable period, then it is switched off; exit survey for Left; alumni record for Graduated; inform parent links; trigger fee refund (item 16).
- **Reports:** a Student Movement report per batch (admitted, current, frozen, transferred in/out, dropped, left, graduated — reasons and trend); intake/graduation/dropout figures for NCEAC 4.h and NBEAC Form 3 computed from these records (no separate typing); Early Warning gains a "risk of dropping out" flag.

### 2. Org chart you click on, with your own position titles
**Today:** Hierarchy and Org Chart pages exist but assigning is form-based.
**Build:**
- **Visual tree:** Institute Head → Deans / faculties → departments (HOD) → programs (Program Lead) → duties (advisors, Controller of Examinations, QEC in-charge, OMC, Course Assigner, lab in-charge…).
- **Click a box → pop-up** (like the prerequisite picker): search a person by name and assign; see the current holder and since when; replace or vacate with a reason; set an *acting* holder during leave (with dates).
- **Drag and drop:** drag a position (with its whole branch) under another position; a confirmation shows who will now report to whom and whose approvals move; every move recorded and can be undone.
- **Vacant positions in red;** one person may hold several boxes (badge "+2 more"); "+" on any box to add a position; switch a position off if the institute does not have it.
- **Custom titles per institute:** Institute Head → VC / Rector / Director / Principal / President; Dean → Dean / Director of School; HOD → Chairman / Head of Department / Coordinator; Program Lead → Program Coordinator / Program In-charge; also Controller of Examinations, QEC Head, OMC etc. The chosen titles appear everywhere: menus, notifications, reports, signatures, SAR exports.
- **Powers pass to the nearest position above** when a position is switched off or vacant: no Dean → the department's Chairman/HOD, else the Institute Head; no HOD → Dean, then Institute Head; no Controller → whoever it sits under. The chart labels who is covering ("Dean's approvals → Chairman (no Dean)"); approval queues and notifications follow automatically and move back when the position is filled. Implement as one resolver (`approverFor(institute, positionKey, scope)`) used by every approval flow (leave, results, status changes, plan requests, assessment-rule exceptions, accreditation tasks).
- **History** of every assignment and change for the registers and the audit log.

### 3. Explanations inside the app
- **"How is this % worked out?"** next to every percentage on accreditation task pages: data in the system (up to 70%), submitted by the assignee (+15%), approved by the Head/Dean (+15%), and the exact checks still missing, each with a link to fix it.
- **Status badges with meanings on hover/tap:** Submitted, Approved, Returned, Signed off ("the person in charge confirmed it is complete and correct"), Provisional, Held, Attained, Not attained, Vacant, Acting, etc.
- **Glossary page under Help:** every term (signed off, CLO, PLO/GA, PEO, attainment, direct/indirect/blended attainment, CQI, provisional grade, registration hold, adjusted feedback score, complex computing problem, knowledge profile, FTE…) with links to where it is used.
- **Collapsible "What this shows and how it is calculated" note** at the top of each report and score page (readiness, outcomes report, transcript tabs, faculty performance, prediction, early warning, allocation suggestions).

### 4. Faculty and course feedback questionnaires and analysis
**Today:** fixed HEC-style questions (9 course + 9 teacher) in code; one answer set per student per course; teacher result shown only from 5 responses.
**Build:**
- **Step 1 — Who sets the questionnaires:** a new duty **QEC in-charge** given by the Institute Head (hat in `extraRoles`); until named, the Head or Dean. Questionnaire editor: add / reword / reorder / retire questions, group them (Preparation, Delivery, Assessment, Behaviour…), give each a **weight** in the total. Questions keep a fixed identity across rewording (versioned), so terms stay comparable. The current HEC questions become version 1 so existing answers keep working. QEC sets the feedback window (e.g. weeks 12–14) and the minimum respondents (default 5).
- **Step 2 — Students fill in:** one form per course and teacher in the window; dashboard reminder; section/teacher detected from attendance as now; anonymous — teachers never see names, only counts.
- **Step 3 — Per-question breakdown:** for each question the count of each rating ("10 answered — 5★ 3, 4★ 3, 3★ 0, 2★ 2, 1★ 2") as a coloured bar, the average, and the **total out of 100** = Σ(question average × weight), with the calculation shown. Per course and section; comments listed separately.
- **Step 4 — The teacher across batches:** this term next to every earlier course/batch, question by question; **lifetime average per question**; questions consistently low flagged (below their own average and the department's), e.g. "Q6 Available outside class — 2.8 over 7 courses"; trend line of the total by term.
- **Step 5 — How strict or generous each batch is:** each batch's average per question and in total across all teachers it rated that term; a generous/strict table vs the institute average; the teacher's **adjusted score** relative to that batch's norm ("3.9 from a batch averaging 3.3 → +0.6").
- **Step 6 — Who sees what, where it is used:** teacher sees own (no names); HOD, Dean, QEC see all, batch-strictness table, ranking on raw and adjusted score. Adjusted score feeds the Faculty Performance Report, course-allocation rating, annual appraisal.
- **Feedback → workshop → improvement:** low questions map to FDP topics (e.g. "explains clearly" → teaching-skills workshop); the teacher is invited automatically to the matching FDP session; attendance recorded; the report shows that question's score before and after the workshop. Hours count toward the FDP target.
- Word/PDF export for the QEC proformas.
- **Demo:** realistic variety — one strict batch, one generous batch, one teacher always low on one question, a teacher who improved after a workshop.

### 5. Lab under the theory instructor
- When a theory course has a **separate lab course**, the theory instructor supervises the lab; the lab engineer of that lab reports to the theory instructor for that course.
- **Lab manual vetting:** the lab engineer uploads/updates the experiment for each lab session; the theory instructor approves it **before** the session; reminders to both if not approved in time.
- **Lab–theory sync:** each lab experiment linked to the theory topic it practises (lecture rows); flags: lab scheduled before its theory topic is taught, theory topic moved without the lab, lab with no theory link.
- **Lab marks:** per-course setting **"Lab marks go into the theory result"** — *on*: lab counts as one assessment of the theory course (default 20%, editable); after the lab ends the theory instructor approves the lab marks, which then appear as one "Lab" assessment in the theory course; the theory result/grade includes it; no separate lab grade on the transcript; lab CLOs feed the theory course's CLO/PLO attainment. *Off*: the lab stays a separate course with its own result and transcript line (some universities). After approval, lab marks are locked for the lab engineer; changes go through grade-change requests.
- Reporting: the theory instructor sees the lab's status (manuals approved/pending, labs held, attendance, marks); the Program Lead sees mismatches across courses.
- Build on the existing lab plan module.

### 6. Complex computing / engineering problems and knowledge profiles (NCEAC Seoul Accord, PEC Washington Accord)
- Tag courses, assessments (questions, assignments, labs, projects) and the FYP with **complex problem attributes** (PEC WP1–WP7, Complex Engineering Activities EA1–EA5; NCEAC complex computing problem attributes) and **knowledge profiles** (PEC WK1–WK8; NCEAC equivalent).
- Coverage matrix report per program: which attributes/profiles each course and assessment covers, gaps, and student attainment on complex-problem assessments; include open-ended labs.
- Feed the NCEAC/PEC readiness checks and SAR sections.

### 7. HEC Undergraduate Education Policy 2023 checker
- Per program: check the named General Education courses (Islamic Studies/Ethics, Ideology & Constitution of Pakistan, Quantitative Reasoning I & II, Expository Writing, ICT/Applications, Civics & Community Engagement, Entrepreneurship, Arts & Humanities, Natural Sciences, Social Sciences — with credit hours), total credits 120–144, mandatory internship and capstone, interdisciplinary and major requirements.
- Pass/fail with exactly what to add or rename; mapping UI to mark which of your courses satisfies which requirement.

### 8. HEMIS data export
- Export students, faculty, programs, enrolment, results and graduates in HEC HEMIS format (Excel/CSV by HEMIS template), with validation (missing CNIC, dates, codes) before export and a log of each submission.

### 9. Complete course file as one PDF
- Per course: course outline, CLOs and CLO–PLO mapping, lecture plan vs what was actually taught, attendance summary, assessments and question papers with CLO mapping, best/average/worst student samples, results and grade distribution, CLO attainment, CQI actions, teacher feedback summary.
- One click → PDF; batch download per program/semester; mark "complete" automatically when all parts exist (replaces the manual "kept" flag).

### 10. Moderation extras (internal moderation already exists: OMC vets papers and approves results)
- **External examiner option:** temporary login (like the visitor pass) for an outside examiner to vet final papers or FYP results and give remarks.
- **Moderation log report:** every paper and result vetted — who, when, comments, changes made — ready for the SAR.
- **Vetting checklist** for vetters: CLO coverage, Bloom level balance, marks distribution, clarity, no repeats from past papers.

### 11. HEC QAA self-assessment cycle
- Workflow: form Program Team → SAR preparation → Assessment Team visit and report → implementation plan → progress tracking against the plan; dates, members, documents, status, reminders.

### 12. Plagiarism records
- Turnitin similarity per FYP, thesis and research paper: report file, similarity %, HEC threshold, decision and action taken; feeds NBEAC Form 5 and HEC policy compliance.

### 13. Degree issuance and verification
- Clearance (library, fee, hostel, department) → degree audit pass (existing) → degree serial register → convocation list → verification requests from HEC/employers with responses logged.

### 14. NBEAC faculty qualification and sufficiency
- Classify each faculty member as academically or professionally qualified (with the criteria), compute full-time-equivalent and the ratios NBEAC Standard 4 requires, per program; flags when below the requirement.

### 15. Mandatory committees (HEC policies)
- Harassment committee (HEC 2020 policy), grievance committee, disability/accessibility focal person, others: members, terms, meetings, cases handled (confidential), annual report.

### 16. Fee refund rules
- HEC fee refund policy as configurable rules (refund % by week of withdrawal); computed automatically when a student withdraws/leaves (item 1); finance officer approves; record kept.

### 17. Students with disabilities
- Register (confidential), accommodations (extra exam time, seating, materials), shown to exam office and teachers as needed; reporting for HEC.

### 18. Policy version history
- Each policy and curriculum version with its Board of Studies and Academic Council meeting and minute numbers, approval dates and effective dates; the approval trail prints into the SAR.

### 19. Faculty development funding
- Study leave and scholarships: amount sanctioned (fee, stipend, travel), sponsor (institute / HEC / other), bond or service agreement (years to serve after return), degree and university, semester progress reports, expected and actual return, completion, refund if the bond is broken.
- Conference and training grants.
- Feeds NBEAC/NCEAC faculty-development spending tables and the FDP module.

### 20. Employee benefits register
- Health insurance (insurer, policy number, coverage, limits, dependants covered, premium, renewal, claims), provident fund, pension, leave encashment, children's fee concession, transport and housing allowances.
- Each faculty member sees their own benefits; HR/Finance manage; summary for NBEAC Form 7 (employee benefits).

---

## PART D — Still waiting on the owner
- **AAS dropdown values** (NCEAC AAS screenshots) — map them into the AAS module when received.
- **NCEAC documents** — to be uploaded to the Claude project "OBE"; read only the relevant sections and update forms/checks accordingly.

## PART E — Suggested build order
1. Items 3, 4, 2, 1 (daily use) → 2. Items 6, 7, 9, 8 (accreditation) → 3. Items 5, 10–20. Deploy each batch as soon as it is ready, with demo data, and list changed files and the SQL to run.
