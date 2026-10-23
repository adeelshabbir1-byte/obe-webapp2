import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { courseScopeFor, roleLabel } from "../../lib/reportScope";
import ResultDecision from "../../components/ResultDecision";
import { db, RESULT_VIEW_ROLES, APPROVER_ROLES, type CourseResultRow, type GradeChangeRow, type ResultSummary } from "../../lib/resultApproval";
import { StatusBadge } from "../../components/Meaning";

const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const RESULT_MEANING: Record<string, string> = {
  DRAFT: "The teacher has not submitted this course's result yet; marks can still change.",
  RETURNED: "Sent back to the teacher with a note; marks are open again until it is resubmitted.",
  SUBMITTED: "The teacher has submitted the result. Marks and grade cut-offs are locked until it is approved or returned. Grades shown are provisional.",
  APPROVED: "Final. Marks and cut-offs are locked; a grade now changes only through a grade change request with a reason.",
};
const STATUS: Record<string, [string, string]> = { DRAFT: ["Not submitted", "badge-neutral"], RETURNED: ["Returned", "badge-no"], SUBMITTED: ["Waiting for approval", "badge-warn"], APPROVED: ["Approved", "badge-ok"] };

export default async function ResultsApprovalPage({ searchParams }: { searchParams: { show?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!RESULT_VIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const canAct = APPROVER_ROLES.includes(user.role);

  const courses = await prisma.course.findMany({
    where: { AND: [courseScopeFor(user), { isOffered: true }, { instructorId: { not: null } }] },
    select: { id: true, code: true, title: true, instructorId: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } }, _count: { select: { studentEnrollments: true } } },
    orderBy: { code: "asc" }, take: 1500,
  });
  const ids = courses.map((c) => c.id);
  let results: CourseResultRow[] = [], changes: GradeChangeRow[] = [], tablesMissing = false;
  try {
    [results, changes] = await Promise.all([
      db.courseResult.findMany({ where: { courseId: { in: ids } } }) as Promise<CourseResultRow[]>,
      db.gradeChangeRequest.findMany({ where: { courseId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 500 }) as Promise<GradeChangeRow[]>,
    ]);
  } catch { tablesMissing = true; }
  const resultOf = new Map(results.map((r) => [r.courseId, r]));
  const cOf = new Map(courses.map((c) => [c.id, c]));
  const people = Array.from(new Set([...results.flatMap((r) => [r.decidedById, r.submittedById]), ...changes.flatMap((g) => [g.requestedById, g.decidedById])].filter((x): x is string => !!x)));
  const names = new Map((people.length ? await prisma.user.findMany({ where: { id: { in: people } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const studentIds = Array.from(new Set(changes.map((g) => g.studentId)));
  const students = new Map((studentIds.length ? await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true, rollNumber: true } }) : []).map((s) => [s.id, s]));

  const statusOf = (id: string) => resultOf.get(id)?.status || "DRAFT";
  const pending = courses.filter((c) => statusOf(c.id) === "SUBMITTED");
  const pendingChanges = changes.filter((g) => g.status === "PENDING");
  const counts = { DRAFT: 0, RETURNED: 0, SUBMITTED: 0, APPROVED: 0 } as Record<string, number>;
  for (const c of courses) counts[statusOf(c.id)]++;
  const show = searchParams.show || "";
  const listed = courses.filter((c) => !show || statusOf(c.id) === show).sort((a, b) => ["SUBMITTED", "RETURNED", "DRAFT", "APPROVED"].indexOf(statusOf(a.id)) - ["SUBMITTED", "RETURNED", "DRAFT", "APPROVED"].indexOf(statusOf(b.id)) || a.code.localeCompare(b.code));
  const summary = (r?: CourseResultRow) => { try { return r?.summaryJson ? (JSON.parse(r.summaryJson) as ResultSummary) : null; } catch { return null; } };

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Result Approval</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Instructors submit each course result here. Approving it locks the marks and grade cutoffs; after that a student&apos;s grade can
        only change through a grade change request with a reason, decided here. Every step is recorded in the audit log.
        {!canAct && " You can see the status; the Chairman of the department or the Institute Head decides."}
      </p>
      {tablesMissing && <div className="err">The result approval tables are not in the database yet — run prisma/migration_result_approval.sql in Supabase.</div>}

      <div className="stat-grid">
        {(["SUBMITTED", "RETURNED", "DRAFT", "APPROVED"] as const).map((k) => (
          <Link key={k} href={show === k ? "/results-approval" : `/results-approval?show=${k}`} className={`stat ${k === "SUBMITTED" && counts[k] ? "stat-warn" : ""}`} style={{ textDecoration: "none", color: "inherit", outline: show === k ? "2px solid var(--brass)" : undefined }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{counts[k]}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>{STATUS[k][0]}</div>
          </Link>
        ))}
        <div className={`stat ${pendingChanges.length ? "stat-warn" : ""}`}><div style={{ fontSize: 24, fontWeight: 700 }}>{pendingChanges.length}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Grade changes waiting</div></div>
      </div>

      {pending.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Waiting for your decision ({pending.length})</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {pending.map((c) => {
              const r = resultOf.get(c.id)!; const s = summary(r);
              return (
                <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <b>{c.code} {c.title}</b>
                    <span style={{ fontSize: 12, color: "var(--slate)" }}>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : ""} · {c.instructor?.name || "—"} · submitted {day(r.submittedAt)}</span>
                    <span style={{ marginLeft: "auto" }}>{canAct ? <ResultDecision url="/api/results/decide" body={{ courseId: c.id }} okLabel="Approve & lock" okAction="approve" noLabel="Return with note" noAction="return" /> : null}</span>
                  </div>
                  {s && (
                    <div style={{ fontSize: 12.5, marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span>{s.students} students</span><span>mean <b>{s.mean}%</b> (SD {s.sd})</span>
                      <span style={{ color: s.passRate < 70 ? "var(--rust)" : undefined }}>pass rate <b>{s.passRate}%</b> ({s.failed} F)</span>
                      <span>{Object.entries(s.distribution).sort().map(([g, n]) => `${g}: ${n}`).join("   ")}</span>
                      {!s.cutoffsSet && <span style={{ color: "#95650F" }}>cutoffs not saved — suggested grading used</span>}
                      <Link href={`/omc/reports/result-mate?courseId=${c.id}`}>Open Result Mate →</Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pendingChanges.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Grade changes waiting ({pendingChanges.length})</h3>
          <table>
            <thead><tr><th>Course</th><th>Student</th><th>Change</th><th>Reason</th><th>Asked by</th><th></th></tr></thead>
            <tbody>{pendingChanges.map((g) => {
              const c = cOf.get(g.courseId); const st = students.get(g.studentId);
              return (
                <tr key={g.id}>
                  <td>{c?.code} {c?.title}</td>
                  <td>{st?.rollNumber} — {st?.name}<div style={{ fontSize: 11, color: "var(--slate)" }}>total {g.totalPct ?? "—"}%</div></td>
                  <td style={{ whiteSpace: "nowrap" }}><b>{g.oldGrade}</b> → <b>{g.newGrade}</b></td>
                  <td style={{ maxWidth: 340, fontSize: 12.5 }}>{g.reason}</td>
                  <td style={{ fontSize: 12.5 }}>{names.get(g.requestedById) || "—"}<div style={{ fontSize: 11, color: "var(--slate)" }}>{day(g.createdAt)}</div></td>
                  <td>{canAct ? <ResultDecision url={`/api/results/grade-change/${g.id}`} body={{}} okLabel="Approve" okAction="approve" noLabel="Reject" noAction="reject" /> : null}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>All offered courses {show ? `— ${STATUS[show]?.[0] || show}` : ""}</h3>
        <table>
          <thead><tr><th>Course</th><th>Batch</th><th>Instructor</th><th style={{ textAlign: "center" }}>Students</th><th>Status</th><th>Decided</th><th>Grade changes</th></tr></thead>
          <tbody>
            {listed.length === 0 && <tr><td colSpan={7} style={{ color: "var(--slate)" }}>No courses.</td></tr>}
            {listed.map((c) => {
              const r = resultOf.get(c.id); const k = statusOf(c.id); const gcs = changes.filter((g) => g.courseId === c.id);
              return (
                <tr key={c.id}>
                  <td><b>{c.code}</b> {c.title}</td>
                  <td style={{ fontSize: 12.5 }}>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</td>
                  <td style={{ fontSize: 12.5 }}>{c.instructor?.name || "—"}</td>
                  <td style={{ textAlign: "center" }}>{c._count.studentEnrollments}</td>
                  <td><StatusBadge status={k} label={STATUS[k][0]} meaning={RESULT_MEANING[k]} />{k === "RETURNED" && r?.note ? <div style={{ fontSize: 11, color: "var(--slate)", maxWidth: 240 }}>{r.note}</div> : null}</td>
                  <td style={{ fontSize: 12 }}>{r?.decidedAt ? `${names.get(r.decidedById || "") || "—"}, ${day(r.decidedAt)}` : "—"}</td>
                  <td style={{ fontSize: 12 }}>{gcs.length ? `${gcs.filter((g) => g.status === "APPROVED").length} approved · ${gcs.filter((g) => g.status === "PENDING").length} waiting · ${gcs.filter((g) => g.status === "REJECTED").length} rejected` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
