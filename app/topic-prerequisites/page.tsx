import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import TopicPrereqBoard from "../../components/TopicPrereqBoard";
import { canEditLinks, corequisiteOrderIssues, courseTopics, visibleCourses } from "../../lib/topicLinks";

export const dynamic = "force-dynamic";
const ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR", "OMC", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "CHAIRMAN"];

// Prerequisites are about topics: this page links the topics of one course to the topics of another course that need them.
export default async function TopicPrerequisitesPage({ searchParams }: { searchParams: { a?: string; b?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!ROLES.includes(user.role)) redirect("/dashboard");

  const courses = await visibleCourses(user);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const mine = (c: (typeof courses)[number]) => c.subjectExpertId === user.id || c.instructorId === user.id || c.coordinatorId === user.id;
  // The formal prerequisites (set on the Prerequisite Map) are the usual starting points.
  const pairs = courses
    .filter((c) => c.prerequisiteCourseId && byId.has(c.prerequisiteCourseId))
    .map((c) => ({ a: byId.get(c.prerequisiteCourseId!)!, b: c }))
    .sort((x, y) => Number(mine(y.a) || mine(y.b)) - Number(mine(x.a) || mine(x.b)) || (x.b.semesterNumber ?? 99) - (y.b.semesterNumber ?? 99));
  const a = (searchParams.a && byId.get(searchParams.a)) || pairs[0]?.a || null;
  const b = (searchParams.b && byId.get(searchParams.b)) || (a ? pairs.find((p) => p.a.id === a.id)?.b : null) || null;
  const label = (c: (typeof courses)[number]) => `${c.code} — ${c.title}${c.batch ? ` (${c.batch.degreeProgram}, ${c.batch.batchName})` : ""}`;
  const samePrograms = a && b && a.coordinatorId === b.coordinatorId;

  const [topicsA, topicsB, links, canEdit, order, programLinks] = a && b && samePrograms
    ? await Promise.all([
      courseTopics(a.id), courseTopics(b.id),
      prisma.topicPrerequisite.findMany({ where: { coordinatorId: a.coordinatorId, prereqCourseCode: a.code, dependentCourseCode: b.code }, orderBy: { createdAt: "asc" } }).catch(() => null),
      canEditLinks(user, a, b),
      a.batchId && a.batchId === b.batchId && a.semesterNumber === b.semesterNumber ? corequisiteOrderIssues(a.id, "SE") : Promise.resolve({ issues: [], checked: 0 }),
      prisma.topicPrerequisite.findMany({ where: { coordinatorId: a.coordinatorId }, orderBy: [{ prereqCourseCode: "asc" }, { dependentCourseCode: "asc" }] }).catch(() => []),
    ])
    : [[], [], [], false, { issues: [], checked: 0 }, []];

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Prerequisite Topics</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14, maxWidth: 900 }}>
        A course is a prerequisite of another because of some of its topics — Functions in Programming Fundamentals are needed for Methods in OOP.
        Link those topics here. The system then checks that the prerequisite topics are assessed, that they come first when both courses run in the same
        semester, and, after results, tells the next course&apos;s teacher when most students did not master a topic they depend on.
      </p>

      <form className="card no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, display: "grid", gap: 4 }}>Prerequisite course
          <select name="a" defaultValue={a?.id || ""} style={{ minWidth: 280 }}>{courses.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}</select>
        </label>
        <label style={{ fontSize: 12, display: "grid", gap: 4 }}>Course that needs it
          <select name="b" defaultValue={b?.id || ""} style={{ minWidth: 280 }}>{courses.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}</select>
        </label>
        <button className="btn btn-brass" type="submit">Open</button>
        {pairs.length > 0 && (
          <div style={{ flexBasis: "100%", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="small-note">Prerequisites on the Prerequisite Map:</span>
            {pairs.slice(0, 16).map((p) => (
              <Link key={`${p.a.id}-${p.b.id}`} href={`/topic-prerequisites?a=${p.a.id}&b=${p.b.id}`} className={`badge ${a?.id === p.a.id && b?.id === p.b.id ? "badge-warn" : "badge-neutral"}`}>{p.a.code} → {p.b.code}</Link>
            ))}
          </div>
        )}
      </form>

      {courses.length === 0 && <div className="card">You have no courses yet.</div>}
      {a && b && !samePrograms && <div className="card err">These two courses belong to different programs. Topic links are kept within one program — choose two courses of the same program.</div>}
      {links === null && <div className="card err">The prerequisite-topic table is not in the database yet — run prisma/migration_oct2026_features.sql in Supabase.</div>}

      {a && b && samePrograms && (
        <>
          {order.issues.length > 0 && (
            <div className="card" style={{ borderLeft: "4px solid var(--rust)" }}>
              <h3 style={{ marginTop: 0 }}>Order problem: both courses run this semester for the same students</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {order.issues.filter((i) => i.otherCourseId === b.id || i.otherCourseId === a.id).map((i, n) => (
                  <li key={n}>&quot;{i.prereqTopic}&quot; is in week {i.prereqWeek} of {i.prereqCode}, but &quot;{i.dependentTopic}&quot; starts in week {i.dependentWeek} of {i.dependentCode}. Move the prerequisite topic earlier, or the dependent topic later.</li>
                ))}
              </ul>
            </div>
          )}
          <div className="card">
            <TopicPrereqBoard
              a={{ id: a.id, code: a.code, title: a.title }} b={{ id: b.id, code: b.code, title: b.title }}
              topicsA={topicsA.map((t) => ({ key: t.id, topic: t.topic, subtopic: t.subtopic, lecture: t.lectureNumber, week: t.week }))}
              topicsB={topicsB.map((t) => ({ key: t.id, topic: t.topic, subtopic: t.subtopic, lecture: t.lectureNumber, week: t.week }))}
              links={(links || []).map((l) => ({ id: l.id, prereqTopic: l.prereqTopic, dependentTopic: l.dependentTopic, note: l.note }))}
              canEdit={canEdit && links !== null}
            />
          </div>
          {programLinks.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>All topic links in this program ({programLinks.length})</h3>
              <table>
                <thead><tr><th>Prerequisite topic</th><th>Needed for</th><th>Note</th></tr></thead>
                <tbody>
                  {programLinks.map((l) => {
                    const ca = courses.find((c) => c.coordinatorId === l.coordinatorId && c.code === l.prereqCourseCode && c.batchId === a.batchId) || courses.find((c) => c.coordinatorId === l.coordinatorId && c.code === l.prereqCourseCode);
                    const cb = courses.find((c) => c.coordinatorId === l.coordinatorId && c.code === l.dependentCourseCode && c.batchId === a.batchId) || courses.find((c) => c.coordinatorId === l.coordinatorId && c.code === l.dependentCourseCode);
                    return (
                      <tr key={l.id}>
                        <td><b>{l.prereqCourseCode}</b> {l.prereqTopic}</td>
                        <td>{ca && cb ? <Link href={`/topic-prerequisites?a=${ca.id}&b=${cb.id}`}><b>{l.dependentCourseCode}</b> {l.dependentTopic}</Link> : <><b>{l.dependentCourseCode}</b> {l.dependentTopic}</>}</td>
                        <td className="small-note">{l.note || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
