// Single source of truth for every report in the system — the Reports Hub,
// the Chairman's ACL manager, Super Admin's bundles, and Coordinator's print
// groups all read from this list instead of duplicating it.

export type ReportDef = { id: string; href: string; title: string; desc: string; hasEditActions?: boolean };
type ReportCardDef = Omit<ReportDef, "id">;
export type ReportSection = { title: string; desc: string; cards: ReportCardDef[] };

function idFor(href: string) {
  return href.replace(/^\//, "").replace(/\//g, ".");
}

export const REPORT_SECTIONS: ReportSection[] = [
  {
    title: "Curriculum & PLO Analytics",
    desc: "Program-wide views across an entire batch or degree.",
    cards: [
      { href: "/omc/reports/coverage", title: "Program-Level PLO Coverage & Distribution Summary", desc: "How comprehensively the program addresses each PLO, highlighting under-mapped outcomes." },
      { href: "/omc/reports/heatmap", title: "PLO Depth & Contribution Heatmap", desc: "Breaks down mapping by course type to check whether core courses carry the primary weight." },
      { href: "/omc/reports/progression", title: "Semester-Wise PLO Progression & Balance", desc: "Evaluates how outcomes scale across semesters — foundational PLOs early, advanced ones later." },
      { href: "/omc/reports/audit", title: "Course-Level Accreditation Audit & Orphan Detection", desc: "Flags orphan courses (no PLO mapped) and overly broad courses (mapped to every PLO)." },
      { href: "/omc/reports/bloom", title: "CLO Bloom's Taxonomy Distribution", desc: "Whether higher-order thinking is adequately represented as students progress." },
      { href: "/omc/plo-readiness", title: "PLO Readiness Matrix", desc: "Every PLO's status across every batch, in one color-coded grid." },
      { href: "/omc/reports/indirect-attainment", title: "Indirect PLO Attainment (Stakeholder Feedback)", desc: "Average rating per PLO from submitted student, alumni, and employer surveys — a second evidence source alongside direct attainment." },
      { href: "/omc/reports/attainment-analytics", title: "Program Attainment Analytics", desc: "NBA/Washington-Accord style: target vs actual CO attainment, PO levels (0-3), session-wise trend, and subject-wise comparison." },
      { href: "/omc/reports/cross-instructor-comparison", title: "Cross-Instructor Topic Comparison", desc: "For one course code, compare every instructor's actual delivery — topic coverage, lectures per topic, and marks distribution." },
      { href: "/omc/reports/clo-plo-flow", title: "Assessment → CLO → PLO Flow", desc: "Visual flow of each assessment's weight through CLOs to PLOs, with weighted, color-coded connections." },
    ],
  },
  {
    title: "Course Assessment Reports",
    desc: "Per-course breakdowns of weight, marks, and topic coverage.",
    cards: [
      { href: "/omc/total-summary", title: "Total Summary", desc: "Every topic's contribution to each CLO, PLO, and assessment type — from the SE's plan." },
      { href: "/omc/weight-compliance", title: "Weight Policy Compliance", desc: "Every offered course's weight compliance status, not just pending exceptions." },
      { href: "/omc/reports/midterm-distribution", title: "Midterm Paper Distribution", desc: "Which topics and CLOs the midterm's questions actually test, and how much each is worth." },
      { href: "/omc/reports/final-distribution", title: "Final Paper Distribution", desc: "Same breakdown, for the final exam." },
    ],
  },
  {
    title: "Instructor Delivery Reports",
    desc: "How closely actual teaching tracked the plan.",
    cards: [
      { href: "/omc/adherence-report", title: "Cross-Instructor Comparison", desc: "Compares instructors teaching the same course by adherence to the SE's plan, with charts." },
      { href: "/omc/submission-timeliness", title: "Submission Timeliness", desc: "Which Subject Experts have submitted their template, and which haven't yet." },
      { href: "/omc/delivery-completion", title: "Instructor Delivery Completion", desc: "How much of the semester each instructor has actually logged." },
      { href: "/omc/reports/log-file", title: "Course Log File", desc: "The Instructor's actual lecture-by-lecture delivery record, with dates and Online/On-Campus mode." },
      { href: "/omc/reports/weekly-plan", title: "Tentative Weekly Plan", desc: "The Subject Expert's planned topics, by week — the official course outline." },
    ],
  },
  {
    title: "Official Course Documents",
    desc: "Formal, printable paperwork for accreditation and records.",
    cards: [
      { href: "/omc/reports/course-description", title: "Course Description Form", desc: "The full formal course description — weights, CLOs, weekly topics, textbook, and more." },
      { href: "/omc/reports/course-monitoring", title: "Course Monitoring Form", desc: "Weightage, PLO assignment, and plan adherence — with a signature block for printing." },
    ],
  },
  {
    title: "Results & Grading",
    desc: "Student marks and computed results.",
    cards: [
      { href: "/omc/reports/result-mate", title: "Result Mate", desc: "Per-student marks, CLO/PLO attainment, and relative grading for the class.", hasEditActions: true },
      { href: "/omc/reports/pass-rates", title: "CLO / PLO Pass Rates", desc: "Pass/fail counts per CLO and PLO, plus a histogram of the class's overall score distribution." },
      { href: "/omc/reports/course-offering-map", title: "Course Offering Map", desc: "Which courses are offered, who's teaching them, and how many students are enrolled — visually, by semester." },
    ],
  },
  {
    title: "Resource Planning",
    desc: "Faculty load and section-sharing efficiency.",
    cards: [
      { href: "/omc/section-utilization", title: "Combined-Section Utilization", desc: "How many sections Course Equivalence groups are saving vs. teaching separately." },
    ],
  },
];

export const ALL_REPORTS: ReportDef[] = REPORT_SECTIONS.flatMap((s) => s.cards).map((c) => ({ ...c, id: idFor(c.href) }));

export function reportIdForHref(href: string): string {
  return idFor(href);
}
