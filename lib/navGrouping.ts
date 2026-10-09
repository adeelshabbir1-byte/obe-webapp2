type Link = { href: string; label: string };
type Section = { title: string; links: Link[] };

// The same headings are used for every role, in the same order, so the menu looks alike wherever you sign in.
// First matching rule wins, which lets Shell group any flat nav array without each page changing how it passes navLinks.
const ORDER = ["My work", "Setup", "Semester Operations", "Teaching & Timetable", "People & Structure", "Review & Approval", "Curriculum & Outcomes", "Accreditation & Resources", "Calendar & Admissions", "Reports & Analytics", "Community", "Platform", "More"];

const RULES: { match: (href: string) => boolean; section: string }[] = [
  { match: (h) => /^\/(deadlines|semester-plan|dashboard)$/.test(h) || /^\/chairman\/faculty-workload$/.test(h)
      || /^\/(instructor\/(courses|timetable|labs)|subjectexpert\/courses|lab-engineer\/labs|faculty\/(my-availability|profile|course-preferences)|dean\/overview|hod\/department|dept-coordinator\/home)$/.test(h), section: "My work" },

  { match: (h) => /^\/coordinator\/(faculty|batches|courses|assign-subject-experts|plos|calendar|students|grading-scale|lab-engineers|elective-options|custom-categories|bulk-student-upload|program-profile|required-books|student-transcript|deficiency-status|historical-grades-upload)$/.test(h) || /^\/chairman\/(ai-configuration|institute-settings)$/.test(h), section: "Setup" },
  { match: (h) => /^\/coordinator\/(semester|repeat-offering)$/.test(h), section: "Semester Operations" },
  { match: (h) => /^\/coordinator\/(timetable|out-of-batch-requests|assignment-history|elective-instructor-report)$/.test(h) || /^\/instructor\/course-team$/.test(h) || /^\/assigner\/(matrix|course-short-names)$/.test(h), section: "Teaching & Timetable" },

  { match: (h) => /^\/chairman\/(coordinators|omc|assigners|people|hierarchy|faculties|departments|staff)$/.test(h) || /^\/(course-leads|course-split|move-program|program-moves)$/.test(h)
      || /^\/(omc|coordinator)\/faculty-requests$/.test(h) || /^\/(hod|assigner)\/borrow-teacher$/.test(h) || /^\/chairman\/alumni-custodian$/.test(h), section: "People & Structure" },

  { match: (h) => /^\/omc\/(queue|instructor-review|weight-exceptions)$/.test(h) || /^\/dean\/approvals$/.test(h), section: "Review & Approval" },
  { match: (h) => /^\/omc\/(plo-matrix|weight-policy|equivalence|import-content|content-sync|prerequisite-correlation|master-curriculum|passing-criteria|section-comparison|course-repositioning)$/.test(h)
      || /^\/coordinator\/(prerequisite-map|program-semester-map|semester-section-map|curriculum-readiness-matrix)$/.test(h) || /^\/chairman\/(plos|cqi)$/.test(h) || /^\/dean\/curricula$/.test(h) || /^\/master-design$/.test(h), section: "Curriculum & Outcomes" },

  { match: (h) => /^\/(accreditation-overview|resources|lab-inventory|library-inventory)$/.test(h) || /^\/chairman\/finance$/.test(h)
      || /^\/coordinator\/(evidence|course-folders|hec-comparison|sar|accreditation-status|activities)$/.test(h), section: "Accreditation & Resources" },
  { match: (h) => /^\/(academic-calendar|admission-criteria)$/.test(h), section: "Calendar & Admissions" },

  { match: (h) => /^\/(omc\/)?reports/.test(h) || /^\/omc\/(total-summary|adherence-report)$/.test(h) || /^\/coordinator\/(load-report|semester-health|batch-comparison|feedforward-digest|report-bundles)$/.test(h)
      || /^\/faculty-report$/.test(h) || /^\/chairman\/(audit-log|report-access)$/.test(h), section: "Reports & Analytics" },

  { match: (h) => /^\/(advisor\/dashboard|coordinator\/(stakeholders|surveys)|public-library|instructor\/peers)$/.test(h), section: "Community" },
  { match: (h) => /^\/admin\//.test(h), section: "Platform" },
];

export function groupNavLinks(links: Link[]): Section[] {
  const sections = new Map<string, Link[]>();
  for (const link of links) {
    const title = RULES.find((r) => r.match(link.href))?.section || "More";
    if (!sections.has(title)) sections.set(title, []);
    sections.get(title)!.push(link);
  }
  return ORDER.filter((t) => sections.has(t)).map((title) => ({ title, links: sections.get(title)! }));
}
