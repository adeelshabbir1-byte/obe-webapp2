import ObeAssistant from "./ObeAssistant";
import RefreshPlanButton from "./RefreshPlanButton";
import CourseReadiness from "./CourseReadiness";
import SubjectHomeLine from "./SubjectHomeLine";
import Link from "next/link";
export default function InstructorCourseSubNav({ courseId, active, code, title }: {
  courseId: string; active: "clos" | "weights" | "instruments" | "rubrics" | "schedule" | "marks" | "paper-distribution" | "attendance" | "resources"; code: string; title: string;
}) {
  // Order follows the work: plan the assessments, keep attendance (which dates the log), then rubrics, and the result last.
  const tabs = [
    { key: "clos", label: "1. CLOs & PLO Mapping", href: `/instructor/courses/${courseId}/clos` },
    { key: "weights", label: "2. Assessment Weights", href: `/instructor/courses/${courseId}/weights` },
    { key: "instruments", label: "3. Assessments", href: `/instructor/courses/${courseId}/instruments` },
    { key: "paper-distribution", label: "4. Paper Distribution", href: `/instructor/courses/${courseId}/paper-distribution` },
    { key: "attendance", label: "5. Attendance", href: `/instructor/courses/${courseId}/attendance` },
    { key: "schedule", label: "6. Lecture Log (Actual)", href: `/instructor/courses/${courseId}/schedule` },
    { key: "resources", label: "7. Tools & Books", href: `/instructor/courses/${courseId}/resources` },
    { key: "rubrics", label: "8. Rubrics", href: `/instructor/courses/${courseId}/rubrics` },
    { key: "marks", label: "9. Marks Entry & Result", href: `/instructor/courses/${courseId}/marks` },
  ];

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{code} — {title}</h1>
          <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>Your delivery record — starts as a copy of the Subject Expert's plan, fully editable.</div>
          <SubjectHomeLine courseId={courseId} />
        </div>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}><RefreshPlanButton courseId={courseId} />
        <Link href="/instructor/courses" className="btn btn-secondary btn-sm no-print">← Back to courses</Link></span>
      </div>
      <nav className="tabs no-print" aria-label="Course sections" style={{ marginBottom: 0 }}>
        {tabs.map((t) => (
          <a key={t.key} href={t.href} className="tab" aria-current={active === t.key ? "page" : undefined}>{t.label}</a>
        ))}
      </nav>
      <CourseReadiness courseId={courseId} source="INSTRUCTOR" />
      <ObeAssistant courseId={courseId} courseLabel={code} />
    </div>
  );
}
