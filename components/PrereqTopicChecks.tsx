import Link from "next/link";
import { corequisiteOrderIssues, prereqAssessmentCheck } from "../lib/topicLinks";

/**
 * Shown on the lecture plan and assessments pages (Subject Expert and Instructor): topics of this course that later
 * courses build on must be taught and assessed, and — when a linked course runs in the same semester for the same
 * students — come in the right order. Renders nothing when the course has no topic links.
 */
export default async function PrereqTopicChecks({ courseId, source, show = "both" }: { courseId: string; source: "SE" | "INSTRUCTOR"; show?: "both" | "assessment" | "order" }) {
  const [checks, order] = await Promise.all([
    show === "order" ? Promise.resolve([]) : prereqAssessmentCheck(courseId, source).catch(() => []),
    show === "assessment" ? Promise.resolve({ issues: [], checked: 0 }) : corequisiteOrderIssues(courseId, source).catch(() => ({ issues: [], checked: 0 })),
  ]);
  if (!checks.length && !order.issues.length && !order.checked) return null;
  const notAssessed = checks.filter((c) => c.lectures.length > 0 && c.assessedBy.length === 0);
  const notInPlan = checks.filter((c) => c.lectures.length === 0);
  const ok = !notAssessed.length && !notInPlan.length && !order.issues.length;

  return (
    <details className="card" open={!ok} style={{ borderLeft: `4px solid ${ok ? "var(--sage)" : "var(--rust)"}` }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
        Prerequisite topics {ok ? <span style={{ color: "var(--sage)", fontWeight: 600 }}>— all good</span> : <span style={{ color: "var(--rust)", fontWeight: 600 }}>— needs attention</span>}
      </summary>
      {checks.length > 0 && (
        <>
          <p className="small-note" style={{ marginTop: 8 }}>These topics are needed by later courses. Teach them, and make sure at least one quiz, assignment or exam question tests each one.</p>
          <table>
            <thead><tr><th>Topic</th><th>Needed for</th><th>In the plan</th><th>Assessed by</th></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.topic}>
                  <td><b>{c.topic}</b></td>
                  <td style={{ fontSize: 12 }}>{c.dependents.map((d) => `${d.code}: ${d.topic}`).join("; ")}</td>
                  <td style={{ color: c.lectures.length ? "inherit" : "var(--rust)", fontWeight: c.lectures.length ? 400 : 700 }}>{c.lectures.length ? `Lecture ${c.lectures.join(", ")}` : "Not in the plan"}</td>
                  <td style={{ color: c.assessedBy.length ? "var(--sage)" : "var(--rust)", fontWeight: 600 }}>{c.assessedBy.length ? c.assessedBy.join(", ") : "Not assessed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {order.issues.length > 0 && (
        <>
          <h4 style={{ margin: "12px 0 6px" }}>Order with a course taught alongside</h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {order.issues.map((i, n) => (
              <li key={n}>
                &quot;{i.prereqTopic}&quot; ({i.prereqCode}) is planned for week {i.prereqWeek}, but &quot;{i.dependentTopic}&quot; ({i.dependentCode}) — which needs it — starts in week {i.dependentWeek}.
                {i.thisSide === "prereq" ? " Bring it forward in this course, or ask the other course to move its topic later." : " Move it later in this course, or ask the other course to teach the prerequisite earlier."}
              </li>
            ))}
          </ul>
        </>
      )}
      {order.checked > 0 && order.issues.length === 0 && <p className="small-note" style={{ marginBottom: 0 }}>Courses taught alongside this one in the same semester: the prerequisite topics come first.</p>}
      <p style={{ marginBottom: 0, fontSize: 12.5 }}><Link href="/topic-prerequisites">Open Prerequisite Topics →</Link></p>
    </details>
  );
}
