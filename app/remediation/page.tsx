import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { omcCourseScope } from "../../lib/omcScope";
import Shell from "../../components/Shell";
import RemediationPlanner from "../../components/RemediationPlanner";
import { facultyOf } from "../../lib/fyp";
import { money, PLAN_STATUS, plansFor, remediationScope, REMEDIATION_KINDS, topicScoresByStudent } from "../../lib/remediation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Remediation" };
const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;

// Remediation instead of retakes: find the students who did not attain topics of a course, plan a tutorial or a junior
// class sitting with a micro-assessment, and track fees and the teacher's pay.
export default async function RemediationPage({ searchParams }: { searchParams: { tab?: string; course?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const scope = await remediationScope(user);
  let missing = false;
  const plans = await plansFor(user, scope).catch(() => { missing = true; return []; });
  if (!scope.seesAll && !plans.length && !missing) {
    // A teacher with no remediation to teach has nothing here.
    if (!["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER"].includes(user.role)) redirect("/dashboard");
  }
  const tabs: [string, string][] = [["plans", "Plans"], ...(scope.canPlan ? [["find", "Find students"] as [string, string]] : []), ...(scope.seesAll ? [["fees", "Fees and teacher pay"] as [string, string]] : [])];
  // The finance office comes here for the fees.
  const tab = tabs.some(([k]) => k === searchParams.tab) ? searchParams.tab! : scope.canCollect && !scope.canPlan ? "fees" : "plans";
  const enrolments = plans.length ? await prisma.remediationEnrollment.findMany({ where: { planId: { in: plans.map((p) => p.id) } } }) : [];
  const people = new Map((await prisma.user.findMany({ where: { id: { in: plans.map((p) => p.instructorId).filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const of = (planId: string) => enrolments.filter((e) => e.planId === planId && e.status !== "WITHDRAWN");

  // Find students: courses with marks in the person's programs.
  const courses = tab === "find" ? await prisma.course.findMany({
    where: { coordinator: { managedById: scope.chairmanId }, ...(scope.programs ? { coordinatorId: { in: scope.programs.concat(["none"]) } } : {}), ...omcCourseScope(user), studentMarks: { some: {} } },
    select: { id: true, code: true, title: true, isOffered: true, offeredTermName: true, offeredTermYear: true, batch: { select: { degreeProgram: true, batchName: true } } },
    orderBy: [{ isOffered: "desc" }, { code: "asc" }], take: 400,
  }) : [];
  const course = tab === "find" ? courses.find((c) => c.id === searchParams.course) || null : null;
  const scores = course ? await topicScoresByStudent(course.id, scope.chairmanId) : null;
  // Students already in remediation for this course (so they aren't enrolled twice by accident).
  const notes: Record<string, string> = {};
  if (course && scores) {
    const earlier = await prisma.remediationPlan.findMany({ where: { chairmanId: scope.chairmanId, courseCode: course.code, status: { not: "CANCELLED" } }, select: { id: true, title: true, topics: true } });
    const enr = earlier.length ? await prisma.remediationEnrollment.findMany({ where: { planId: { in: earlier.map((p) => p.id) }, status: { not: "WITHDRAWN" }, studentId: { in: scores.students.map((s) => s.id) } } }) : [];
    for (const e of enr) {
      const p = earlier.find((x) => x.id === e.planId)!;
      notes[e.studentId] = e.status === "CLEARED" ? `Cleared ${p.topics.join(", ")} in remediation` : e.status === "NOT_CLEARED" ? `Not cleared in "${p.title}"` : `Enrolled in "${p.title}"`;
    }
  }
  const faculty = course ? (await facultyOf(scope.chairmanId)).map((f) => [f.id, `${f.name}${f.department ? ` — ${f.department}` : ""}`] as [string, string]) : [];
  const hosts = course ? (await prisma.course.findMany({
    where: { coordinator: { managedById: scope.chairmanId }, isOffered: true, id: { not: course.id }, OR: [{ code: course.code }, { title: { equals: course.title, mode: "insensitive" } }] },
    select: { id: true, code: true, batch: { select: { degreeProgram: true, batchName: true } }, instructor: { select: { name: true } } },
  })).map((h) => [h.id, `${h.code} — ${h.batch?.degreeProgram || ""} ${h.batch?.batchName || ""}${h.instructor ? ` (${h.instructor.name})` : ""}`] as [string, string]) : [];

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Remediation</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12, maxWidth: 940 }}>
        Instead of retaking a whole course, students who did not attain some of its topics take a short remediation — a dedicated tutorial, or sitting
        the lectures that teach those topics in a junior class — then a micro-assessment. Passing it raises their CLO and GA attainment on the transcript
        (the grade stays) and releases any strong prerequisite those topics held up. Students pay a small fee; the teacher is paid a share of it.
      </p>
      {missing && <div className="err">Remediation is not set up in the database yet — run prisma/migration_master_spec.sql in Supabase.</div>}
      <nav className="tabs no-print" aria-label="Remediation" style={{ marginBottom: 14 }}>
        {tabs.map(([k, t]) => <Link key={k} href={`/remediation?tab=${k}`} className="tab" aria-current={tab === k ? "page" : undefined}>{t}</Link>)}
      </nav>

      {tab === "plans" && (
        <div className="card">
          {plans.length === 0 ? <p className="small-note" style={{ margin: 0 }}>{scope.canPlan ? "No remediation planned yet. Use Find students to start one." : "No remediation yet."}</p> : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Plan</th><th>Course · topics</th><th>Teacher</th><th>Students</th><th>Cleared</th><th>Status</th><th /></tr></thead>
                <tbody>{plans.map((p) => {
                  const e = of(p.id);
                  return (
                    <tr key={p.id}>
                      <td><b>{p.title}</b><div className="small-note">{REMEDIATION_KINDS[p.kind]}{p.startDate ? ` · from ${p.startDate.toISOString().slice(0, 10)}` : ""}</div></td>
                      <td>{p.courseCode}<div className="small-note">{p.topics.join(", ")}</div></td>
                      <td>{p.instructorId ? people.get(p.instructorId) : "—"}</td>
                      <td>{e.length}</td>
                      <td>{e.filter((x) => x.status === "CLEARED").length}{e.some((x) => x.status === "NOT_CLEARED") ? <div className="small-note">{e.filter((x) => x.status === "NOT_CLEARED").length} not cleared</div> : null}</td>
                      <td><span className={`badge ${p.status === "COMPLETED" ? "badge-ok" : p.status === "CANCELLED" ? "badge-neutral" : "badge-warn"}`}>{PLAN_STATUS[p.status]}</span></td>
                      <td><Link href={`/remediation/${p.id}`} className="act act-primary">Open</Link></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "find" && (
        <>
          <form className="card no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input type="hidden" name="tab" value="find" />
            <label style={{ fontSize: 12, display: "grid", gap: 4 }}>Course offering (with marks)
              <select name="course" defaultValue={course?.id || ""} style={{ minWidth: 340 }}>
                <option value="">— choose —</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title} ({c.batch?.degreeProgram} {c.batch?.batchName}){c.isOffered ? " · running" : ""}</option>)}
              </select>
            </label>
            <button className="btn btn-brass" type="submit">Open</button>
            {courses.length === 0 && <span className="small-note">No course in your programs has marks yet.</span>}
          </form>
          {course && scores && (
            <div className="card">
              {scores.topics.length === 0 ? <p className="small-note">No topic of this course is linked to an assessed item yet, so topic results can&apos;t be worked out. Link the quizzes, assignments and exam questions to lectures first.</p>
                : <RemediationPlanner courseId={course.id} courseCode={course.code} topics={scores.topics} students={scores.students} notes={notes} passPct={scores.passPct} faculty={faculty} hosts={hosts} />}
            </div>
          )}
        </>
      )}

      {tab === "fees" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Fees and teacher pay</h3>
          {(() => {
            const rows = plans.map((p) => ({ p, m: money(p, enrolments.filter((e) => e.planId === p.id)) }));
            const t = rows.reduce((a, r) => ({ collected: a.collected + r.m.collected, due: a.due + r.m.due, share: a.share + r.m.share, paid: a.paid + r.m.paidOut }), { collected: 0, due: 0, share: 0, paid: 0 });
            return (
              <>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, marginBottom: 10 }}>
                  <span>Collected: <b>{pkr(t.collected)}</b></span><span>Still due: <b>{pkr(t.due)}</b></span><span>Teachers&apos; share: <b>{pkr(t.share)}</b></span><span>Paid to teachers: <b>{pkr(t.paid)}</b></span>
                </div>
                {rows.length === 0 ? <p className="small-note">No remediation yet.</p> : (
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead><tr><th>Plan</th><th>Teacher</th><th>Fee</th><th>Collected</th><th>Due</th><th>Teacher&apos;s share</th><th>Paid out</th></tr></thead>
                      <tbody>{rows.map(({ p, m }) => (
                        <tr key={p.id}>
                          <td><Link href={`/remediation/${p.id}`}>{p.title}</Link></td><td>{p.instructorId ? people.get(p.instructorId) : "—"}</td>
                          <td>{pkr(p.feePerStudent)}</td><td>{pkr(m.collected)}</td><td>{pkr(m.due)}</td>
                          <td>{pkr(m.share)} <span className="small-note">({p.instructorSharePct}%)</span></td>
                          <td>{m.paidOut ? pkr(m.paidOut) : "—"}{m.owed > 0 && <div className="small-note" style={{ color: "var(--rust)" }}>{pkr(m.owed)} owed</div>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </Shell>
  );
}
