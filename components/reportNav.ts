export const REPORT_VIEWER_NAV = [
  { href: "/omc/reports", label: "Reports" },
  { href: "/omc/total-summary", label: "Total Summary" },
  { href: "/omc/adherence-report", label: "Cross-Instructor Comparison" },
];

export const OMC_ACTION_NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/instructor-review", label: "Instructor Delivery Review" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/chairman/cqi", label: "CQI Records" },
  { href: "/omc/reports", label: "Reports" },
];

export function navForRole(role: string) {
  return role === "OMC" ? OMC_ACTION_NAV : REPORT_VIEWER_NAV;
}
