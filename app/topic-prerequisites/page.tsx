import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import TopicPrereqBoard from "../../components/TopicPrereqBoard";
import TopicPlanOversight from "../../components/TopicPlanOversight";
import { canEditLinks, corequisiteOrderIssues, courseTopics, visibleCourses } from "../../lib/topicLinks";
import { downstreamOfferings, effectOf, STRENGTHS, strengthOf } from "../../lib/prereqCascade";

export const dynamic = "force-dynamic";
const ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR", "OMC", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "CHAIRMAN"];

// Prerequisites are about topics: this page links the topics of one course to the topics of another course that need them.
export default async function TopicPrerequisitesPage({ searchParams }: { searchParams: { a?: string; b?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!ROLES.includes(user.role)) redirect("/dashboard");

  // Only base courses are linked: a course that copies its content from a base course uses the base course's links.
  const all = await visibleCourses(user);
  const courses = all.filter((c) => !c.contentSyncMember || c.contentSyncMember.isBase);
  const hiddenFollowers = all.length - courses.length;
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
        Link those topics here and grade each link: <b>Strong</b> — students can&apos;t register for the dependent course until they have attained the topic
        (or cleared it through remediation); <b>Mild</b> — they may register and the dependent course reviews the topic; <b>Weak</b> — a short recap.
        Changes reach every offering of the dependent course at once. The system also checks that prerequisite topics are assessed, that they come first
        when both courses run in the same semester, and, after results, tells the next course&apos;s teacher when most students did not master a topic.
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

      {hiddenFollowers > 0 && <p className="small-note">{hiddenFollowers} course{hiddenFollowers === 1 ? "" : "s"} that copy their content from a base course {hiddenFollowers === 1 ? "is" : "are"} not listed: link the base course and the links apply to every course that copies it.</p>}
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
              links={(links || []).map((l) => ({ id: l.id, prereqTopic: l.prereqTopic, dependentTopic: l.dependentTopic, note: l.note, strength: strengthOf(l.strength), orphaned: !!l.orphanedAt }))}
              canEdit={canEdit && links !== null}
            />
          </div>
          {links && links.length > 0 && (await (async () => {
            const offerings = await downstreamOfferings({ coordinatorId: a.coordinatorId, dependentCourseCode: b.code });
            const offered = offerings.filter((o) => o.isOffered);
            const plans = offered.length ? await prisma.prereqReviewPlan.findMany({ where: { courseId: { in: offered.map((o) => o.id) }, linkId: { in: links.map((l) => l.id) } } }).catch(() => []) : [];
            return (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>What these links do downstream</h3>
                <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13 }}>
                  {links.map((l) => <li key={l.id}><b style={{ color: STRENGTHS[strengthOf(l.strength)].color }}>{STRENGTHS[strengthOf(l.strength)].label}</b> — {l.orphanedAt ? <span style={{ color: "var(--rust)" }}>no effect: the topic is no longer in the lecture plan.</span> : effectOf(l)}</li>)}
                </ul>
                <p className="small-note" style={{ margin: "0 0 6px" }}>A change here applies at once to every offering of {b.code} ({offerings.length} course{offerings.length === 1 ? "" : "s"}, {offered.length} running now) and their teachers are told.</p>
                {offered.length > 0 && links.some((l) => l.strength !== "STRONG" && !l.orphanedAt) && (
                  <table>
                    <thead><tr><th>Running offering</th><th>Reviews planned</th></tr></thead>
                    <tbody>{offered.map((o) => {
                      const need = links.filter((l) => l.strength !== "STRONG" && !l.orphanedAt);
                      const done = need.filter((l) => plans.some((p) => p.courseId === o.id && p.linkId === l.id)).length;
                      return <tr key={o.id}><td>{o.code} — {o.batch?.degreeProgram} {o.batch?.batchName}</td><td>{done === need.length ? <span className="badge badge-ok">{done} of {need.length}</span> : <span className="badge badge-warn">{done} of {need.length}</span>}</td></tr>;
                    })}</tbody>
                  </table>
                )}
              </div>
            );
          })())}
          {programLinks.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>All topic links in this program ({programLinks.length})</h3>
              <table>
                <thead><tr><th>Prerequisite topic</th><th>Needed for</th><th>Strength</th><th>Note</th></tr></thead>
                <tbody>
                  {programLinks.map((l) => {
                    const ca = courses.find((c) => c.coordinatorId === l.coordinatorId && c.code === l.prereqCourseCode && c.batchId === a.batchId) || courses.find((c) => c.coordinatorId === l.coordinatorId && c.code === l.prereqCourseCode);
                    const cb = courses.find((c) => c.coordinatorId === l.coordinatorId && c.code === l.dependentCourseCode && c.batchId === a.batchId) || courses.find((c) => c.coordinatorId === l.coordinatorId && c.code === l.dependentCourseCode);
                    return (
                      <tr key={l.id}>
                        <td><b>{l.prereqCourseCode}</b> {l.prereqTopic}</td>
                        <td>{ca && cb ? <Link href={`/topic-prerequisites?a=${ca.id}&b=${cb.id}`}><b>{l.dependentCourseCode}</b> {l.dependentTopic}</Link> : <><b>{l.dependentCourseCode}</b> {l.dependentTopic}</>}</td>
                        <td><b style={{ color: STRENGTHS[strengthOf(l.strength)].color }}>{STRENGTHS[strengthOf(l.strength)].label}</b>{l.orphanedAt && <div className="small-note" style={{ color: "var(--rust)" }}>topic no longer in the plan</div>}</td>
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
      {["PROGRAM_COORDINATOR", "OMC"].includes(user.role) && <TopicPlanOversight role={user.role} courseIds={courses.filter((c) => c.isOffered).map((c) => c.id)} />}
    </Shell>
  );
}
