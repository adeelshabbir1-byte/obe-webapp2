const REPORTS = [
  { key: "coverage", label: "1. PLO Coverage Summary", href: "/omc/reports/coverage" },
  { key: "heatmap", label: "2. Depth Heatmap", href: "/omc/reports/heatmap" },
  { key: "progression", label: "3. Semester Progression", href: "/omc/reports/progression" },
  { key: "audit", label: "4. Course Audit / Orphans", href: "/omc/reports/audit" },
  { key: "bloom", label: "5. Bloom's Distribution", href: "/omc/reports/bloom" },
];

export default function ReportsSubNav({ active }: { active: string }) {
  return (
    <nav className="tabs no-print" aria-label="Curriculum reports">
      {REPORTS.map((r) => (
        <a key={r.key} href={r.href} className="tab" aria-current={active === r.key ? "page" : undefined}>{r.label}</a>
      ))}
    </nav>
  );
}
