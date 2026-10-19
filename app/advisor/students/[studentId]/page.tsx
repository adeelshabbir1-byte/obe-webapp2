import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { roleLabel } from "../../../../lib/reportScope";
import { navForRole } from "../../../../components/reportNav";
import Shell from "../../../../components/Shell";
import AdvisorStudentPlanner from "../../../../components/AdvisorStudentPlanner";
import { computeCgpa, standingFromCgpa } from "../../../../lib/academicStanding";
import { computeCurrentSemesterNumber } from "../../../../lib/termLogic";
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
            <h1 style={{ fontSize: 21, margin: 0 }}>{s.name}</h1>
            <div style={{ fontSize: 13, color: "var(--slate)" }}>{s.rollNumber} · {s.batch ? `${s.batch.degreeProgram} — ${s.batch.batchName}` : ""} · Semester {s.currentSemesterNumber}</div>
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
          The student&apos;s record says <b>semester {s.currentSemesterNumber}</b>, but by the calendar ({ct!.termName} {ct!.year}) this batch is in <b>semester {expected}</b>.
          {s.currentSemesterNumber < expected ? " If the student is not held back, the Program Lead should advance the batch (Students → Advance semester); the degree plan below uses the recorded semester." : ""}
        </div>
      )}
      <AdvisorCourseStatus courses={live} history={history} />
      {live.length > 0 && <div style={{ marginTop: 8 }}><ActionButton url={`/api/advisor/students/${s.id}/freeze-grades`} body={{}} label="Save target grades as this semester's plan" className="btn btn-secondary btn-sm" done="Saved (only courses without a saved plan)." /></div>}
      <h2 style={{ fontSize: 16, margin: "18px 0 8px" }}>Degree plan</h2>
      <AdvisorStudentPlanner studentId={s.id} />
    </Shell>
  );
}
