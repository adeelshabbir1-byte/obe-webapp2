import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import PersonAvatar from "../../../../components/PersonAvatar";
import { studentPhotos } from "../../../../lib/studentPhotos";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { roleLabel } from "../../../../lib/reportScope";
import { navForRole } from "../../../../components/reportNav";
import Shell from "../../../../components/Shell";
import AdvisorStudentPlanner from "../../../../components/AdvisorStudentPlanner";
import { computeCgpa, standingFromCgpa } from "../../../../lib/academicStanding";
import { computeCurrentSemesterNumber } from "../../../../lib/termLogic";
import { syncSemesters, holdBacks } from "../../../../lib/semesterSync";
import KeyButton from "../../../../components/KeyButton";
import AdvisorCourseStatus from "../../../../components/AdvisorCourseStatus";
import { liveCourseStatus, plannedVsActual } from "../../../../lib/studentCourseStatus";
import { ActionButton } from "../../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

const STANDING: Record<string, [string, string]> = { PROBATION: ["Probation", "badge-no"], WARNING: ["Warning", "badge-warn"], GOOD_STANDING: ["Good standing", "badge-ok"] };

/** One advisee: who they are, where they stand, their current courses, and their degree plan to manage. */
export default async function AdvisorStudentPage({ params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const s = await prisma.student.findUnique({
    where: { id: params.studentId },
    include: { batch: true, enrollments: { where: { course: { isOffered: true } }, include: { course: { select: { code: true, title: true, creditHours: true } } } } },
  });
  if (!s || s.batch?.advisorId !== user.id) notFound();
  // The student's semester follows the calendar (unless held back) — bring it up to date before showing anything.
  if (s.batch && (await syncSemesters([s.batch.coordinatorId])) > 0) s.currentSemesterNumber = (await prisma.student.findUnique({ where: { id: s.id }, select: { currentSemesterNumber: true } }))?.currentSemesterNumber ?? s.currentSemesterNumber;
  const held = (await holdBacks([s.id])).get(s.id);
  const cgpa = await computeCgpa(s.id);
  const [label, tone] = STANDING[standingFromCgpa(cgpa)] || ["—", "badge-neutral"];
  const ct = s.batch ? await prisma.currentTerm.findUnique({ where: { coordinatorId: s.batch.coordinatorId } }) : null;
  const expected = s.batch && ct ? computeCurrentSemesterNumber(s.batch, ct) : null;
  const pending = await prisma.registrationApprovalRequest.count({ where: { studentId: s.id, status: "PENDING" } });
  const [live, history] = await Promise.all([liveCourseStatus(s.id).catch(() => []), plannedVsActual(s.id).catch(() => [])]);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <Link href="/advisor/dashboard" style={{ fontSize: 13 }}>← All advisees</Link>
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 21, margin: 0 }}><PersonAvatar name={s.name} photo={(await studentPhotos([s.id])).get(s.id)} size={44} />{s.name}</h1>
            <div style={{ fontSize: 13, color: "var(--slate)" }}>{s.rollNumber} · {s.batch ? `${s.batch.degreeProgram} — ${s.batch.batchName}` : ""} · Semester {s.currentSemesterNumber} · <Link href={`/prediction/student/${s.id}`}>Prediction</Link></div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 18, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 11.5, color: "var(--slate)" }}>CGPA</div><div style={{ fontSize: 22, fontWeight: 700 }}>{cgpa !== null ? cgpa.toFixed(2) : "—"}</div></div>
            <span className={`badge ${tone}`}>{label}</span>
            {pending > 0 && <Link href="/advisor/dashboard" className="badge badge-warn">{pending} request{pending > 1 ? "s" : ""} waiting</Link>}
          </div>
        </div>
        <div style={{ fontSize: 12.5, marginTop: 10 }}>
          <b>This semester:</b> {s.enrollments.length ? s.enrollments.map((e) => `${e.course.code} ${e.course.title} (${e.course.creditHours})`).join(" · ") : <span style={{ color: "var(--slate)" }}>not enrolled in any course</span>}
        </div>
      </div>
      {expected !== null && expected > 0 && expected !== s.currentSemesterNumber && (
        <div className="err" style={{ background: "#FFF8EC", color: "#7A5208" }}>
          The student is in <b>semester {s.currentSemesterNumber}</b>; by the calendar ({ct!.termName} {ct!.year}) the batch is in <b>semester {expected}</b>{held ? <> — held back by the Program Lead{held.reason ? ` (${held.reason})` : ""}.</> : "."}
        </div>
      )}
      <div style={{ marginTop: 8 }}><KeyButton url="/api/parent-link" body={{ studentId: s.id, action: "create" }} label="Parent / guardian link" /></div>
      <AdvisorCourseStatus courses={live} history={history} />
      {live.length > 0 && <div style={{ marginTop: 8 }}><ActionButton url={`/api/advisor/students/${s.id}/freeze-grades`} body={{}} label="Save target grades as this semester's plan" className="btn btn-secondary btn-sm" done="Saved (only courses without a saved plan)." /></div>}
      <h2 style={{ fontSize: 16, margin: "18px 0 8px" }}>Degree plan</h2>
      <AdvisorStudentPlanner studentId={s.id} />
    </Shell>
  );
}
