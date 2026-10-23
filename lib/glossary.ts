// The words OBEHUB uses, in plain English, with the pages where each one matters. Shown on Help › Glossary and in the
// pop-up of every status badge, so a badge never has to be guessed.

export type GlossaryTerm = { key: string; term: string; meaning: string; where: [string, string][] };

export const GLOSSARY: GlossaryTerm[] = [
  { key: "it-grade", term: "IT (included in theory) and TR (transferred)", meaning: "IT: a lab whose marks went into its theory course (it counts as one Lab assessment of the theory course, whose transcript line carries the lab's credit hours too); the lab shows as done with no grade or credits of its own. TR: a course credited from another program or institute; it counts as passed but has no grade points.", where: [["/lab-engineer/labs", "My Labs"], ["/status-changes", "Student Status Changes"]] },
  { key: "clo", term: "CLO (Course Learning Outcome)", meaning: "What a student can do after one course — for example “apply recursion to solve problems”. Each CLO has a Bloom level and is mapped to one GA/PLO with a contribution %.", where: [["/subjectexpert/courses", "Course template › CLOs"], ["/instructor/courses", "My courses › CLOs"]] },
  { key: "plo", term: "PLO / GA (Program Learning Outcome / Graduate Attribute)", meaning: "What every graduate of the program can do. OBEHUB shows PLOs as GAs (GA-1 … GA-12). They are kept per batch, because two intakes may follow different curricula.", where: [["/coordinator/plos", "Program Learning Outcomes"], ["/omc/plo-matrix", "GA–Course Matrix"]] },
  { key: "peo", term: "PEO (Program Educational Objective)", meaning: "What graduates do a few years after graduating (career and professional growth). Reviewed with alumni and employers and measured through surveys.", where: [["/coordinator/program-profile", "Program Document"], ["/peo-attainment", "PEO Attainment"]] },
  { key: "bloom", term: "Bloom level (C1–C6)", meaning: "How demanding a CLO or question is: C1 remember, C2 understand, C3 apply, C4 analyse, C5 evaluate, C6 create.", where: [["/omc/reports/bloom", "Bloom distribution report"]] },
  { key: "attainment", term: "Attainment", meaning: "Whether a student reached a CLO or GA. A student attains a CLO when the marks they got on the questions of that CLO are at least the pass mark (50% by default) of what the CLO was worth. A course attains a CLO when enough students reached it, compared with its target (60% by default).", where: [["/omc/reports/attainment-analytics", "Program Attainment Analytics"], ["/omc/reports/pass-rates", "CLO / GA pass rates"]] },
  { key: "direct", term: "Direct attainment", meaning: "Attainment measured from students' marks on quizzes, assignments, exams, labs and projects.", where: [["/indirect-assessment", "Direct & Indirect GAs"]] },
  { key: "indirect", term: "Indirect attainment", meaning: "Attainment as seen by people: student, alumni and employer surveys and course-exit ratings, averaged per GA.", where: [["/indirect-assessment", "Direct & Indirect GAs"], ["/omc/reports/indirect-attainment", "Indirect GA attainment"]] },
  { key: "blended", term: "Blended attainment", meaning: "Direct and indirect attainment combined with the weights the program sets (for example 80% direct, 20% indirect).", where: [["/indirect-assessment", "Direct & Indirect GAs"]] },
  { key: "cqi", term: "CQI (Continuous Quality Improvement)", meaning: "Closing the loop: a weakness found in results, surveys or audits is recorded, an action is taken, and the next result shows whether it worked.", where: [["/chairman/cqi", "CQI Records"]] },
  { key: "signed-off", term: "Signed off", meaning: "The person in charge has confirmed that the work is complete and correct. After sign-off they can no longer change it unless it is returned.", where: [["/accreditation/tasks", "Accreditation Tasks"]] },
  { key: "provisional", term: "Provisional grade / result", meaning: "A grade or result that is shown but not final yet — it can still change until the result is approved.", where: [["/results-approval", "Result Approval"]] },
  { key: "hold", term: "Registration hold", meaning: "A student whose CGPA is below the Controller of Examinations' hold limit is not registered automatically in their batch's courses until the advisor decides.", where: [["/academic-rules", "Academic Rules & Registration"]] },
  { key: "probation", term: "Academic warning / probation", meaning: "Standing from the CGPA limits set by the Controller of Examinations: warning below the warning limit, probation below the probation limit. Probation reduces the allowed load.", where: [["/academic-rules", "Academic Rules & Registration"]] },
  { key: "adjusted-feedback", term: "Adjusted feedback score", meaning: "A teacher's student-feedback score compared with how generously the same batch rated all its teachers that term: +0.6 means 0.6 above that batch's usual rating. It is fairer than the raw score when some batches rate strictly and others generously.", where: [["/evaluations", "Course & Teacher Evaluations"]] },
  { key: "complex-problem", term: "Complex computing / engineering problem", meaning: "A problem with no obvious solution that needs in-depth knowledge, has conflicting requirements and wide impact — the Seoul Accord (NCEAC) and Washington Accord (PEC) attributes WP1–WP7.", where: [["/complex-problems", "Complex Problems & Knowledge Profile"]] },
  { key: "knowledge-profile", term: "Knowledge profile", meaning: "The kinds of knowledge a program must cover (WK1–WK8 for PEC, the NCEAC equivalent for computing) — natural science, mathematics, engineering fundamentals, specialist knowledge, design, practice, society and research.", where: [["/complex-problems", "Complex Problems & Knowledge Profile"]] },
  { key: "fte", term: "FTE (Full-Time Equivalent)", meaning: "Faculty counted by how much they teach: a full-time teacher is 1; a visiting teacher counts by the share of a full load they teach. Councils use FTE for student–teacher ratios.", where: [["/accreditation/readiness", "Visit Readiness"]] },
  { key: "readiness", term: "Readiness", meaning: "How much of what an accreditation council asks for is already in OBEHUB, as a percentage per criterion or form. Red items are gaps with a link to where they are fixed.", where: [["/accreditation/readiness", "Visit Readiness"], ["/accreditation-overview", "Accreditation Overview"]] },
  { key: "council", term: "Council (NCEAC, NBEAC, PEC, HEC)", meaning: "The body that accredits a program: NCEAC for computing, NBEAC for business, PEC for engineering, HEC for the rest. A program sees only its own council's forms.", where: [["/accreditation/readiness/programs", "Programs, councils & standards"]] },
  { key: "vacant", term: "Vacant", meaning: "A position on the organisation chart that nobody holds. Its approvals pass to the next position up until it is filled.", where: [["/chairman/org-chart", "Organisation Chart"]] },
  { key: "acting", term: "Acting", meaning: "Someone holding a position for a set period (for example while the holder is on leave). They receive its approvals and notifications until the end date.", where: [["/chairman/org-chart", "Organisation Chart"]] },
  { key: "covering", term: "Covering", meaning: "When a position is vacant or switched off, the nearest position above does its approvals. The chart shows who is covering for whom.", where: [["/chairman/org-chart", "Organisation Chart"]] },
  { key: "freeze", term: "Semester freeze", meaning: "A student pauses studies for one or two semesters and then joins the next batch on the same curriculum. Earned results are kept.", where: [["/status-changes", "Student Status Changes"]] },
  { key: "transfer", term: "Transfer (in / out / internal)", meaning: "A student moving between programs of the institute, to another university, or from another university. Transferred-in courses show as TR on the transcript and carry no grade points.", where: [["/status-changes", "Student Status Changes"]] },
  { key: "readmission", term: "Readmission", meaning: "A student who left, was dropped or froze their studies rejoins a batch. Earlier results stay on the record.", where: [["/status-changes", "Student Status Changes"]] },
  { key: "w-grade", term: "W (withdrawn)", meaning: "Shown on the transcript when a student leaves a course after the drop deadline. It has no grade points and does not affect the CGPA.", where: [["/status-changes", "Student Status Changes"]] },
  { key: "weight-policy", term: "Weight policy", meaning: "The OMC's allowed range for each type of assessment by course type, for example Final 50–60% for a core course. Weights outside it go to the OMC as an exception.", where: [["/omc/weight-policy", "Weight Policy"]] },
  { key: "early-warning", term: "Early warning", meaning: "A risk level per student worked out during the semester from CGPA, attendance, marks so far and missed assessments, so the advisor can act before results.", where: [["/early-warning", "Early Warning"]] },
];

/** Status words used across the app, with what each one means. */
export const STATUS: Record<string, { label: string; meaning: string; tone: "ok" | "wait" | "bad" | "info" }> = {
  OPEN: { label: "Not assigned", meaning: "Nobody holds this task yet.", tone: "bad" },
  ASSIGNED: { label: "Assigned", meaning: "Given to someone, who is working on it.", tone: "info" },
  SUBMITTED: { label: "Signed off", meaning: "The person in charge confirmed it is complete and correct, and sent it for approval.", tone: "wait" },
  RETURNED: { label: "Returned", meaning: "Sent back with a note saying what to change. It is with the assignee again.", tone: "bad" },
  APPROVED: { label: "Approved", meaning: "Checked and accepted by the approver. It is final unless reopened.", tone: "ok" },
  DRAFT: { label: "Draft", meaning: "Still being prepared; nobody has been asked to approve it yet.", tone: "info" },
  PENDING: { label: "Pending", meaning: "Waiting for a decision.", tone: "wait" },
  REJECTED: { label: "Rejected", meaning: "The approver decided against it.", tone: "bad" },
  PROVISIONAL: { label: "Provisional", meaning: "Shown but not final — it can still change until the result is approved.", tone: "wait" },
  HELD: { label: "Held", meaning: "Not applied automatically: waiting for the advisor or another decision first.", tone: "wait" },
  ATTAINED: { label: "Attained", meaning: "The student (or the class) reached this outcome.", tone: "ok" },
  NOT_ATTAINED: { label: "Not attained", meaning: "The student (or the class) did not reach this outcome yet.", tone: "bad" },
  VACANT: { label: "Vacant", meaning: "Nobody holds this position. Its approvals pass to the next position up.", tone: "bad" },
  ACTING: { label: "Acting", meaning: "Held for a set period by someone standing in for the holder.", tone: "info" },
  COVERING: { label: "Covering", meaning: "Doing the approvals of a vacant or switched-off position.", tone: "wait" },
  OFF: { label: "Switched off", meaning: "This institute does not have this position; its powers pass to the position above.", tone: "info" },
  CLOSED: { label: "Closed", meaning: "Finished; no more changes are expected.", tone: "info" },
};

export const TONE: Record<string, { bg: string; fg: string }> = {
  ok: { bg: "#1E7B45", fg: "#fff" }, wait: { bg: "#B26A00", fg: "#fff" }, bad: { bg: "#C62828", fg: "#fff" }, info: { bg: "#1F4E8C", fg: "#fff" },
};
