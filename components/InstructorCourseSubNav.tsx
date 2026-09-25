import Link from "next/link";
export default function InstructorCourseSubNav({ courseId, active, code, title }: {
  courseId: string; active: "clos" | "weights" | "instruments" | "schedule" | "marks" | "paper-distribution" | "attendance"; code: string; title: string;
}) {
  const tabs = [
    { key: "clos", label: "1. CLOs & PLO Mapping", href: `/instructor/courses/${courseId}/clos` },
    { key: "weights", label: "2. Assessment Weights", href: `/instructor/courses/${courseId}/weights` },
    { key: "schedule", label: "3. Lecture Content (Actual)", href: `/instructor/courses/${courseId}/schedule` },
    { key: "instruments", label: "4. Assessments", href: `/instructor/courses/${courseId}/instruments` },
    { key: "marks", label: "5. Marks Entry", href: `/instructor/courses/${courseId}/marks` },
    { key: "paper-distribution", label: "6. Paper Distribution", href: `/instructor/courses/${courseId}/paper-distribution` },
    { key: "attendance", label: "7. Attendance", href: `/instructor/courses/${courseId}/attendance` },
  ];
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{code} — {title}</h1>
          <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>Your delivery record — starts as a copy of the Subject Expert's plan, fully editable.</div>
        </div>
        <Link href="/instructor/courses" className="btn btn-secondary btn-sm">← Back to courses</Link>
      </div>
      <nav className="tabs" aria-label="Course sections">
        {tabs.map((t) => (
          <a key={t.key} href={t.href} className="tab" aria-current={active === t.key ? "page" : undefined}>{t.label}</a>
        ))}
      </nav>
    </div>
  );
}
