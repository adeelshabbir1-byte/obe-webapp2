import Link from "next/link";
export default function CourseSubNav({ courseId, active, code, title, status }: {
  courseId: string; active: "clos" | "weights" | "instruments" | "schedule" | "paper-distribution" | "delivery"; code: string; title: string; status: string;
}) {
  const tabs = [
    { key: "clos", label: "1. CLOs & PLO Mapping", href: `/subjectexpert/courses/${courseId}/clos` },
    { key: "weights", label: "2. Assessment Weights", href: `/subjectexpert/courses/${courseId}/weights` },
    { key: "schedule", label: "3. Lecture Content", href: `/subjectexpert/courses/${courseId}/schedule` },
    { key: "instruments", label: "4. Assessments & Submit", href: `/subjectexpert/courses/${courseId}/instruments` },
    { key: "paper-distribution", label: "5. Paper Distribution", href: `/subjectexpert/courses/${courseId}/paper-distribution` },
    { key: "delivery", label: "6. Delivery Feedback", href: `/subjectexpert/courses/${courseId}/delivery` },
  ];
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{code} — {title}</h1>
          <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>Template status: {status}</div>
        </div>
        <Link href="/subjectexpert/courses" className="btn btn-secondary btn-sm">← Back to courses</Link>
      </div>
      <nav className="tabs" aria-label="Course sections">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className="tab" aria-current={active === t.key ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
    </div>
  );
}
