export default function CourseSubNav({ courseId, active, code, title, status }: {
  courseId: string; active: "clos" | "schedule" | "weights"; code: string; title: string; status: string;
}) {
  const tabs = [
    { key: "clos", label: "CLOs", href: `/subjectexpert/courses/${courseId}/clos` },
    { key: "schedule", label: "30-Lecture Schedule", href: `/subjectexpert/courses/${courseId}/schedule` },
    { key: "weights", label: "Assessment Weights", href: `/subjectexpert/courses/${courseId}/weights` },
  ];
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{code} — {title}</h1>
          <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>Template status: {status}</div>
        </div>
        <a href="/subjectexpert/courses" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Back to courses</a>
      </div>
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--line)" }}>
        {tabs.map((t) => (
          <a key={t.key} href={t.href} style={{
            padding: "8px 14px", fontSize: 12.5, textDecoration: "none",
            color: active === t.key ? "var(--ink)" : "var(--slate)",
            borderBottom: active === t.key ? "2px solid var(--brass)" : "2px solid transparent",
            fontWeight: active === t.key ? 600 : 400,
          }}>{t.label}</a>
        ))}
      </div>
    </div>
  );
}
