type Link = { href: string; label: string };
type Section = { title: string; links: Link[] };

// Ordered list of (matcher, section title) rules — first match wins. This
// lets Shell group any flat nav array without every page needing to change
// how it passes navLinks.
const RULES: { match: (href: string) => boolean; section: string }[] = [
  // Coordinator
  { match: (h) => /\/coordinator\/(faculty|batches|courses|plos|calendar|students|grading-scale|prerequisite-map)$/.test(h), section: "Setup" },
  { match: (h) => /\/coordinator\/(semester|repeat-offering)$/.test(h), section: "Semester Operations" },
  { match: (h) => /\/coordinator\/(load-report|semester-health|batch-comparison|feedforward-digest)$/.test(h), section: "Reports & Analytics" },

  // OMC
  { match: (h) => /\/omc\/(queue|instructor-review|weight-exceptions)$/.test(h), section: "Review & Approval" },
  { match: (h) => /\/omc\/(plo-matrix|weight-policy|equivalence|course-repositioning)$/.test(h), section: "Curriculum Governance" },

  // Chairman
  { match: (h) => /\/chairman\/(coordinators|omc|assigners)$/.test(h), section: "Accounts" },
  { match: (h) => /\/chairman\/(plos|cqi|audit-log)$/.test(h), section: "Governance" },

  // Super User
  { match: (h) => /\/admin\/(users|curricula|curriculum-migration|platform-settings)/.test(h), section: "Platform" },

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
