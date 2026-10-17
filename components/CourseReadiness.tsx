import Link from "next/link";
import { courseIssues } from "../lib/courseChecks";

// "What's missing" checklist shown under the course tabs; each item links to the tab that fixes it.
export default async function CourseReadiness({ courseId, source }: { courseId: string; source: "SE" | "INSTRUCTOR" }) {
  const issues = await courseIssues(courseId, source).catch(() => null);
  if (!issues) return null;
  const base = source === "SE" ? `/subjectexpert/courses/${courseId}` : `/instructor/courses/${courseId}`;
  if (!issues.length) return <div className="no-print" style={{ marginTop: 10, fontSize: 12.5, color: "#1F5E36", background: "#E8F3EC", border: "1px solid #BFE0CB", borderRadius: 8, padding: "6px 12px" }}>✓ Plan check: nothing missing.</div>;
  return (
    <details className="no-print" style={{ marginTop: 10, fontSize: 12.5, background: "#FBF3E4", border: "1px solid #EBD3A6", borderRadius: 8, padding: "6px 12px" }}>
      <summary style={{ cursor: "pointer", color: "#7A520C", fontWeight: 700 }}>Plan check: {issues.length} thing{issues.length > 1 ? "s" : ""} missing — click to see</summary>
      <ul style={{ margin: "6px 0 2px 18px" }}>
        {issues.map((i, k) => <li key={k} style={{ margin: "3px 0" }}>{i.text} <Link href={`${base}/${i.fix}`} style={{ fontWeight: 600 }}>Fix →</Link></li>)}
      </ul>
    </details>
  );
}
