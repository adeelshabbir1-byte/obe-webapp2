import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { followUpsFor, type FollowUpRow } from "../../lib/topicLinks";
import { appraiseesFor } from "../../lib/appraisal";
import { FollowUpActionForm, FollowUpAssign } from "../../components/FollowUpControls";

export const dynamic = "force-dynamic";
const ROLES = ["INSTRUCTOR", "SUBJECT_EXPERT", "OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "DEAN", "CHAIRMAN"];
const KIND: Record<string, string> = { WEAK_PREREQ: "Prerequisite topic not mastered", MISSED: "Planned but not taught", WEAK: "Weak results" };
const STATUS: Record<string, [string, string]> = { OPEN: ["Open", "badge-no"], IN_PROGRESS: ["In progress", "badge-warn"], DONE: ["Done", "badge-ok"], DISMISSED: ["Not needed", "badge-neutral"] };

// Topic follow-ups: what one course's results ask of the next course (a tutorial, extra classes, covering a missed
// topic), who is doing it and what was done. These are the course-level actions behind continuous quality improvement.
export default async function FollowUpsPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!ROLES.includes(user.role)) redirect("/dashboard");

  const { act, oversee, canAssign, missingTable } = await followUpsFor(user);
  const all = [...act, ...oversee];
  const courseIds = Array.from(new Set(all.flatMap((f) => [f.sourceCourseId, f.targetCourseId]).filter((x): x is string => !!x)));
  const courses = new Map((await prisma.course.findMany({ where: { id: { in: courseIds.length ? courseIds : ["none"] } }, select: { id: true, code: true, title: true, batch: { select: { batchName: true, degreeProgram: true } }, instructor: { select: { name: true } } } })).map((c) => [c.id, c]));
  const people = canAssign ? (await appraiseesFor(user)).people : [];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(all.flatMap((f) => [f.assignedToId, f.actionById]).filter((x): x is string => !!x))).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const courseText = (id: string | null, code: string) => { const c = id ? courses.get(id) : null; return c ? `${c.code} — ${c.title}${c.batch ? ` (${c.batch.batchName})` : ""}` : code; };
  const filter = searchParams.status && STATUS[searchParams.status] ? searchParams.status : "";
  const shown = oversee.filter((f) => !filter || f.status === filter);
  const openActs = act.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS");

  const card = (f: FollowUpRow, editable: boolean) => (
    <div key={f.id} className="card" style={{ borderLeft: `4px solid ${f.status === "DONE" ? "var(--sage)" : f.status === "DISMISSED" ? "var(--line)" : "var(--rust)"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <span className={`badge ${STATUS[f.status]?.[1] || "badge-neutral"}`} style={{ marginRight: 6 }}>{STATUS[f.status]?.[0] || f.status}</span>
          <span className="badge badge-neutral">{KIND[f.kind] || f.kind}</span>
          <h3 style={{ margin: "8px 0 2px", fontSize: 15 }}>&quot;{f.targetTopic || f.topic}&quot; in {f.targetCourseId ? courseText(f.targetCourseId, f.targetCourseCode) : `${f.targetCourseCode} (next time it is taught)`}</h3>
          <p className="small-note" style={{ margin: 0 }}>
            From {courseText(f.sourceCourseId, f.sourceCourseCode)}{f.studentsTotal ? ` · ${f.studentsBelow} of ${f.studentsTotal} students below the pass mark on "${f.topic}"` : ""} · raised {f.createdAt.toISOString().slice(0, 10)}
            {f.assignedToId ? ` · assigned to ${names.get(f.assignedToId) || "a teacher"}` : ""}
          </p>
        </div>
      </div>
      <p style={{ fontSize: 13, margin: "8px 0 0" }}>{f.recommendation}</p>
      {f.actionTaken && <p style={{ fontSize: 13, margin: "8px 0 0" }}><b>Action taken{f.actionById ? ` (${names.get(f.actionById) || ""}${f.actionAt ? `, ${f.actionAt.toISOString().slice(0, 10)}` : ""})` : ""}:</b> {f.actionTaken}</p>}
      {editable && <FollowUpActionForm id={f.id} status={f.status} actionTaken={f.actionTaken} />}
    </div>
  );

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Topic Follow-ups</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14, maxWidth: 900 }}>
        When most students of a course did not master a topic that a later course builds on — or a planned topic was never taught — the course&apos;s
        teacher sends a follow-up here. The teacher of the next course (or a teacher the OMC assigns) arranges a tutorial or extra class and records what
        was done. Topics are linked on <Link href="/topic-prerequisites">Prerequisite Topics</Link>; follow-ups are sent from each course&apos;s Marks page.
      </p>
      {missingTable && <div className="err">The follow-up table is not in the database yet — run prisma/migration_oct2026_features.sql in Supabase.</div>}

      {(act.length > 0 || !oversee.length) && (
        <>
          <h2 style={{ fontSize: 17, margin: "6px 0 10px" }}>For you to act on {openActs.length > 0 && <span className="badge badge-no">{openActs.length} open</span>}</h2>
          {act.length === 0 ? <div className="card small-note">Nothing for your courses right now.</div> : act.map((f) => card(f, true))}
        </>
      )}

      {oversee.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>All follow-ups in your area ({oversee.length})</h2>
            <nav className="tabs no-print" aria-label="Status" style={{ marginBottom: 0 }}>
              <Link href="/follow-ups" className="tab" aria-current={!filter ? "page" : undefined}>All</Link>
              {Object.entries(STATUS).map(([k, [t]]) => <Link key={k} href={`/follow-ups?status=${k}`} className="tab" aria-current={filter === k ? "page" : undefined}>{t} ({oversee.filter((f) => f.status === k).length})</Link>)}
            </nav>
          </div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table>
              <thead><tr><th>Topic</th><th>From</th><th>For</th><th>Status</th><th>Who acts</th><th>Action taken</th></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={6} className="small-note">None.</td></tr>}
                {shown.map((f) => (
                  <tr key={f.id}>
                    <td><b>{f.targetTopic || f.topic}</b><div className="small-note">{KIND[f.kind] || f.kind}{f.studentsTotal ? ` · ${f.studentsBelow}/${f.studentsTotal} below` : ""}</div></td>
                    <td style={{ fontSize: 12 }}>{courseText(f.sourceCourseId, f.sourceCourseCode)}</td>
                    <td style={{ fontSize: 12 }}>{f.targetCourseId ? courseText(f.targetCourseId, f.targetCourseCode) : `${f.targetCourseCode} (next offering)`}</td>
                    <td><span className={`badge ${STATUS[f.status]?.[1] || "badge-neutral"}`}>{STATUS[f.status]?.[0] || f.status}</span></td>
                    <td>{canAssign ? <FollowUpAssign id={f.id} assignedToId={f.assignedToId} people={people} /> : f.assignedToId ? names.get(f.assignedToId) : (f.targetCourseId && courses.get(f.targetCourseId)?.instructor?.name) || "the course's teacher"}</td>
                    <td style={{ fontSize: 12, maxWidth: 320 }}>{f.actionTaken || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}
