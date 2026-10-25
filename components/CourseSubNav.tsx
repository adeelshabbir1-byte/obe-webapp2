import ObeAssistant from "./ObeAssistant";
import CourseReadiness from "./CourseReadiness";
import SubjectHomeLine from "./SubjectHomeLine";
import Link from "next/link";
import ContentSyncStatusBanner from "./ContentSyncStatusBanner";
import TemplateChangeBanner from "./TemplateChangeBanner";
import SePlanBox from "./SePlanBox";
export default function CourseSubNav({ courseId, active, code, title, status }: {
  courseId: string; active: "clos" | "weights" | "instruments" | "schedule" | "paper-distribution" | "delivery" | "flow"; code: string; title: string; status: string;
}) {
  const tabs = [
    { key: "clos", label: "1. CLOs & GA Mapping", href: `/subjectexpert/courses/${courseId}/clos` },
    { key: "schedule", label: "2. Lecture Content", href: `/subjectexpert/courses/${courseId}/schedule` },
    { key: "weights", label: "3. Assessment Weights", href: `/subjectexpert/courses/${courseId}/weights` },
    { key: "instruments", label: "4. Assessments & Submit", href: `/subjectexpert/courses/${courseId}/instruments` },
    { key: "paper-distribution", label: "5. Paper Distribution", href: `/subjectexpert/courses/${courseId}/paper-distribution` },
    { key: "delivery", label: "6. Delivery Feedback", href: `/subjectexpert/courses/${courseId}/delivery` },
    { key: "flow", label: "Flow & Weights", href: `/subjectexpert/courses/${courseId}/flow` },
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
      {(() => { const i = tabs.findIndex((t) => t.key === active); const next = i >= 0 && i < 4 ? tabs[i + 1] : null; return next ? <div className="no-print" style={{ textAlign: "right", marginTop: 6 }}><Link className="btn btn-sm" href={next.href}>Next step: {next.label.replace(/^\d+\.\s*/, "")} →</Link></div> : null; })()}
      <CourseReadiness courseId={courseId} source="SE" />
      <ObeAssistant courseId={courseId} courseLabel={code} />
      {(status === "approved" || status === "reopened") && <TemplateChangeBanner courseId={courseId} />}
      {(active === "clos" || active === "instruments") && <SePlanBox courseId={courseId} status={status} showAlso={active === "clos"} />}
      {active === "clos" && (
        <div style={{ marginTop: 14 }}>
          <ContentSyncStatusBanner courseId={courseId} />
        </div>
      )}
    </div>
  );
}
