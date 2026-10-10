type Link = { href: string; label: string };
type Section = { title: string; links: Link[] };

// The same headings are used for every role, in the same order, so the menu looks alike wherever you sign in.
// First matching rule wins, which lets Shell group any flat nav array without each page changing how it passes navLinks.
const ORDER = ["My work", "Review & Approval", "Semester & Timetable", "Programs & Courses", "Students", "People & Structure", "Curriculum & Outcomes", "Curriculum Maps", "Policies & Rules", "Accreditation", "Facilities & Calendar", "Reports & Analytics", "Community", "Settings", "Platform", "More"];

const RULES: { match: (h: string) => boolean; section: string }[] = [
  { match: (h) => /^\/(home|deadlines|semester-plan|dashboard|requests)$/.test(h) || /^\/chairman\/faculty-workload$/.test(h)
      || /^\/(instructor\/(courses|timetable|labs)|subjectexpert\/courses|lab-engineer\/labs|faculty\/(my-availability|profile|course-preferences)|dean\/overview|hod\/department|dept-coordinator\/home)$/.test(h), section: "My work" },

  { match: (h) => /^\/omc\/(queue|instructor-review|weight-exceptions|template-changes)$/.test(h) || /^\/dean\/approvals$/.test(h), section: "Review & Approval" },

  { match: (h) => /^\/coordinator\/(semester|repeat-offering|calendar|timetable|out-of-batch-requests|assignment-history|elective-instructor-report)$/.test(h)
      || /^\/instructor\/course-team$/.test(h) || /^\/assigner\/(matrix|course-short-names)$/.test(h), section: "Semester & Timetable" },

  { match: (h) => /^\/coordinator\/(batches|courses|assign-subject-experts|plos|grading-scale|elective-options|custom-categories|program-profile|required-books)$/.test(h)
      || /^\/dean\/curricula$/.test(h), section: "Programs & Courses" },

  { match: (h) => /^\/coordinator\/(students|bulk-student-upload|student-transcript|deficiency-status|historical-grades-upload)$/.test(h) || h === "/outcomes", section: "Students" },

  { match: (h) => /^\/chairman\/(coordinators|omc|assigners|people|hierarchy|faculties|departments|staff|alumni-custodian)$/.test(h) || /^\/(course-leads|course-split|move-program|program-moves)$/.test(h)
      || /^\/(omc|coordinator)\/faculty-requests$/.test(h) || /^\/(hod|assigner)\/borrow-teacher$/.test(h) || /^\/coordinator\/(faculty|lab-engineers)$/.test(h), section: "People & Structure" },

  { match: (h) => /^\/coordinator\/(prerequisite-map|program-semester-map|semester-section-map|curriculum-readiness-matrix)$/.test(h)
      || /^\/omc\/(course-repositioning|section-comparison|prerequisite-correlation)$/.test(h), section: "Curriculum Maps" },
  { match: (h) => /^\/omc\/(weight-policy|passing-criteria|equivalence|content-sync|import-content)$/.test(h), section: "Policies & Rules" },
  { match: (h) => /^\/omc\/(plo-matrix|master-curriculum)$/.test(h) || /^\/chairman\/(cqi|plos)$/.test(h) || /^\/master-design$/.test(h), section: "Curriculum & Outcomes" },

  { match: (h) => /^\/accreditation-overview$/.test(h) || /^\/coordinator\/(evidence|course-folders|hec-comparison|sar|accreditation-status)$/.test(h) || /^\/(evidence-files|meetings)$/.test(h), section: "Accreditation" },
  { match: (h) => /^\/(resources|lab-inventory|library-inventory|academic-calendar|admission-criteria)$/.test(h) || /^\/chairman\/finance$/.test(h) || /^\/coordinator\/activities$/.test(h), section: "Facilities & Calendar" },

  { match: (h) => /^\/(omc\/)?reports/.test(h) || /^\/omc\/(total-summary|adherence-report)$/.test(h) || /^\/coordinator\/(load-report|semester-health|batch-comparison|feedforward-digest|report-bundles)$/.test(h)
      || /^\/faculty-report$/.test(h) || /^\/chairman\/(audit-log|report-access)$/.test(h) || h === "/yearly-summary", section: "Reports & Analytics" },

  { match: (h) => /^\/(advisor\/dashboard|coordinator\/(stakeholders|surveys)|public-library|instructor\/peers)$/.test(h), section: "Community" },
  { match: (h) => /^\/chairman\/(institute-settings|ai-configuration)$/.test(h) || h === "/settings/mfa", section: "Settings" },
  { match: (h) => /^\/admin\//.test(h), section: "Platform" },
];

// The page people open most in each section comes first; everything else keeps the role's own order.
const FIRST = ["/home", "/dashboard", "/coordinator/semester", "/coordinator/timetable", "/coordinator/batches", "/coordinator/courses", "/coordinator/students",
  "/omc/queue", "/chairman/people", "/coordinator/faculty", "/omc/plo-matrix", "/chairman/plos", "/accreditation-overview", "/coordinator/accreditation-status",
  "/resources", "/omc/reports", "/yearly-summary"];
const rank = (href: string) => { const i = FIRST.indexOf(href); return i < 0 ? FIRST.length : i; };

export function groupNavLinks(links: Link[]): Section[] {
  const sections = new Map<string, Link[]>();
  const ordered = links.map((l, i) => ({ l, i })).sort((a, b) => rank(a.l.href) - rank(b.l.href) || a.i - b.i).map((x) => x.l);
  for (const link of ordered) {
    const title = RULES.find((r) => r.match(link.href))?.section || "More";
    if (!sections.has(title)) sections.set(title, []);
    sections.get(title)!.push(link);
  }
  return ORDER.filter((t) => sections.has(t)).map((title) => ({ title, links: sections.get(title)! }));
}
