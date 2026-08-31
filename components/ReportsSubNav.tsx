const REPORTS = [
  { key: "coverage", label: "1. PLO Coverage Summary", href: "/omc/reports/coverage" },
  { key: "heatmap", label: "2. Depth Heatmap", href: "/omc/reports/heatmap" },
  { key: "progression", label: "3. Semester Progression", href: "/omc/reports/progression" },
  { key: "audit", label: "4. Course Audit / Orphans", href: "/omc/reports/audit" },
  { key: "bloom", label: "5. Bloom's Distribution", href: "/omc/reports/bloom" },
];

export default function ReportsSubNav({ active }: { active: string }) {
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--line)", marginBottom: 20, flexWrap: "wrap" }}>
      {REPORTS.map((r) => (
        <a key={r.key} href={r.href} style={{
          padding: "8px 12px", fontSize: 12, textDecoration: "none",
          color: active === r.key ? "var(--ink)" : "var(--slate)",
          borderBottom: active === r.key ? "2px solid var(--brass)" : "2px solid transparent",
          fontWeight: active === r.key ? 600 : 400,
        }}>{r.label}</a>
      ))}
    </div>
  );
}
