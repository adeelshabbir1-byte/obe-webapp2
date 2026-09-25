type Link = { href: string; label: string };
type Section = { title: string; links: Link[] };

// Ordered list of (matcher, section title) rules — first match wins. This
// lets Shell group any flat nav array without every page needing to change
// how it passes navLinks.
const RULES: { match: (href: string) => boolean; section: string }[] = [
  { match: (h) => h === "/dashboard", section: "Overview" },

  // Coordinator
  { match: (h) => /\/coordinator\/(faculty|batches|courses|assign-subject-experts|elective-options|custom-categories|plos|calendar|students|grading-scale|prerequisite-map)$/.test(h), section: "Setup" },
  { match: (h) => /\/coordinator\/(semester|timetable|repeat-offering|out-of-batch-requests)$/.test(h), section: "Semester Operations" },
  { match: (h) => /\/coordinator\/(assignment-history|report-bundles|program-profile|required-books|student-transcript)$/.test(h), section: "Documents & Records" },
  { match: (h) => /\/coordinator\/(stakeholders|surveys)$/.test(h), section: "Stakeholders & Feedback" },
  { match: (h) => /\/coordinator\/(load-report|semester-health|batch-comparison|feedforward-digest|elective-instructor-report|program-semester-map|curriculum-readiness-matrix)$/.test(h), section: "Reports & Analytics" },

  // Faculty (Subject Expert / Instructor)
  { match: (h) => /\/(subjectexpert|instructor)\/courses$/.test(h) || h === "/advisor/dashboard", section: "My Work" },
  { match: (h) => /\/faculty\/(my-availability|course-preferences)$/.test(h), section: "My Preferences" },

  // OMC
  { match: (h) => /\/omc\/(queue|instructor-review|weight-exceptions)$/.test(h), section: "Review & Approval" },
  { match: (h) => /\/omc\/(plo-matrix|weight-policy|equivalence|course-repositioning|import-content|content-sync|master-curriculum|passing-criteria)$/.test(h), section: "Curriculum Governance" },
  { match: (h) => /\/omc\/(prerequisite-correlation|section-comparison|total-summary|adherence-report)$/.test(h), section: "Reports & Analytics" },

  // Chairman
  { match: (h) => /\/chairman\/(coordinators|omc|assigners|alumni-custodian)$/.test(h), section: "Accounts" },
  { match: (h) => /\/chairman\/(plos|cqi|audit-log|report-access)$/.test(h), section: "Governance" },
  { match: (h) => /\/chairman\/(ai-configuration|institute-settings)$/.test(h), section: "Settings" },

  // Course Assigner
  { match: (h) => /\/assigner\//.test(h), section: "Assignments" },

  // Super User
  { match: (h) => /\/admin\/(users|account-requests)/.test(h), section: "Accounts" },
  { match: (h) => /\/admin\/(curricula|curriculum-migration)/.test(h), section: "Curricula" },
  { match: (h) => /\/admin\/(platform-settings|landing-page|report-bundles)/.test(h), section: "Platform" },

  // Shared
  { match: (h) => /\/(omc\/)?reports/.test(h), section: "Reports & Analytics" },
];

export function groupNavLinks(links: Link[]): Section[] {
  const sections = new Map<string, Link[]>();
  const order: string[] = [];

  for (const link of links) {
    const rule = RULES.find((r) => r.match(link.href));
    const title = rule?.section || "More";
    if (!sections.has(title)) { sections.set(title, []); order.push(title); }
    sections.get(title)!.push(link);
  }

  return order.map((title) => ({ title, links: sections.get(title)! }));
}
