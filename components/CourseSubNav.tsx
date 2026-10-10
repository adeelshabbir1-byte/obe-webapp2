import SubjectHomeLine from "./SubjectHomeLine";
import Link from "next/link";
import ContentSyncStatusBanner from "./ContentSyncStatusBanner";
import TemplateChangeBanner from "./TemplateChangeBanner";
export default function CourseSubNav({ courseId, active, code, title, status }: {
  courseId: string; active: "clos" | "weights" | "instruments" | "schedule" | "paper-distribution" | "delivery"; code: string; title: string; status: string;
}) {
  const tabs = [
    { key: "clos", label: "1. CLOs & PLO Mapping", href: `/subjectexpert/courses/${courseId}/clos` },
    { key: "schedule", label: "2. Lecture Content", href: `/subjectexpert/courses/${courseId}/schedule` },
    { key: "weights", label: "3. Assessment Weights", href: `/subjectexpert/courses/${courseId}/weights` },
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
          <SubjectHomeLine courseId={courseId} />
        </div>
        <Link href="/subjectexpert/courses" className="btn btn-secondary btn-sm no-print">← Back to courses</Link>
      </div>
      <nav className="tabs no-print" aria-label="Course sections" style={{ marginBottom: 0 }}>
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className="tab" aria-current={active === t.key ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
      {(status === "approved" || status === "reopened") && <TemplateChangeBanner courseId={courseId} />}
      {active === "clos" && (
        <div style={{ marginTop: 14 }}>
          <ContentSyncStatusBanner courseId={courseId} />
        </div>
      )}
    </div>
  );
}
