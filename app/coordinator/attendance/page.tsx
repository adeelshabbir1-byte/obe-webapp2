import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { OVERVIEW_ROLES, leadsInScope } from "../../../lib/readinessScope";
import { STANDING_LABEL, attendancePolicy, closeDueSessions, coursesAttendance } from "../../../lib/attendance";
import LogCqiButton from "../../../components/attendance/LogCqiButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance report" };

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${warn ? "var(--rust)" : "var(--line)"}`, borderRadius: 12, padding: "12px 16px", minWidth: 150, flex: "1 1 150px" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: warn ? "var(--rust)" : "var(--ink)" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{label}</div>
    </div>
  );
}

// Attendance across a program's offered courses: averages, students below the institute's minimum and those who can
// no longer reach it, courses where attendance isn't being taken, and (for the Institute Head and OMC) a one-click CQI finding.
export default async function AttendanceReportPage({ searchParams }: { searchParams: { lead?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  // Programs this person may look at, by role; anyone named a batch advisor also sees their batches.
  let leads: { id: string; label: string }[] = [];
  if (user.role === "PROGRAM_COORDINATOR") leads = [{ id: user.id, label: user.leadProgram || user.name }];
  else if (user.role === "OMC") leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "none", isActive: true }, select: { id: true, name: true, leadProgram: true } })).map((l) => ({ id: l.id, label: l.leadProgram || l.name }));
  else if (OVERVIEW_ROLES.includes(user.role)) leads = (await leadsInScope(user)).leads.map((l) => ({ id: l.id, label: l.leadProgram || l.name }));
  const advised = await prisma.batch.findMany({ where: { advisorId: user.realUserId || user.id }, select: { id: true } });
  if (!leads.length && !advised.length) redirect("/dashboard");

  const chosen = leads.find((l) => l.id === searchParams.lead);
  const leadIds = chosen ? [chosen.id] : leads.map((l) => l.id);
  const offered = await prisma.course.findMany({
    where: { isOffered: true, OR: [{ coordinatorId: { in: leadIds.length ? leadIds : ["none"] } }, ...(advised.length && !chosen ? [{ batchId: { in: advised.map((b) => b.id) } }] : [])] },
    select: { id: true },
  });
  await closeDueSessions().catch(() => 0);
  const p = await attendancePolicy((await chairmanIdFor(user)) || null);
  const { courses, shortages } = await coursesAttendance(offered.map((c) => c.id), p);
  const canLogCqi = user.role === "CHAIRMAN" || user.role === "OMC";
  const stale = courses.filter((c) => c.enrolled > 0 && (!c.lastMarked || Date.now() - c.lastMarked.getTime() > 14 * 864e5)).length;
  const avgs = courses.map((c) => c.average).filter((x): x is number => x !== null);
  const overall = avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : null;
  const studentsShort = new Set(shortages.map((s) => s.studentId)).size;
  const cannot = shortages.filter((s) => s.standing === "CANNOT_RECOVER").length;
  const advisorIds = Array.from(new Set(courses.map((c) => c.advisorId).filter((x): x is string => !!x)));
  const advisors = new Map((advisorIds.length ? await prisma.user.findMany({ where: { id: { in: advisorIds } }, select: { id: true, name: true } }) : []).map((a) => [a.id, a.name]));
  const courseOf = new Map(courses.map((c) => [c.courseId, c]));
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "never");

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Attendance report</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, margin: "0 0 14px", maxWidth: 900 }}>
        Attendance in every offered course against the institute&apos;s minimum of {p.minPct}% (set by the OMC under Passing Criteria &amp; Attendance).
        “Can no longer reach” means even attending every remaining planned lecture leaves the student below the minimum. You and the batch advisor are notified when a student first falls below it.
      </p>
      {leads.length > 1 && (
        <form className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="lead" style={{ fontSize: 13 }}>Program</label>
          <select id="lead" name="lead" defaultValue={chosen?.id || ""} style={{ padding: "6px 8px" }}>
            <option value="">All my programs</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <button className="btn btn-brass btn-sm">Show</button>
        </form>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "0 0 14px" }}>
        <Stat label="Average attendance" value={overall === null ? "—" : `${overall}%`} warn={overall !== null && overall < p.minPct} />
        <Stat label={`Students below ${p.minPct}%`} value={studentsShort} warn={studentsShort > 0} />
        <Stat label="Can no longer reach the minimum" value={cannot} warn={cannot > 0} />
        <Stat label="Courses with no attendance in 14 days" value={stale} warn={stale > 0} />
        <Stat label="Courses using QR attendance" value={`${courses.filter((c) => c.qrSessions > 0).length} of ${courses.length}`} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Courses</h3>
        {courses.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No offered courses.</p> : (
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Course</th><th>Batch</th><th>Instructor</th><th>Lectures held</th><th>Average</th><th>Below {p.minPct}%</th><th>Close to it</th><th>Last marked</th><th>QR sessions</th>{canLogCqi && <th></th>}</tr></thead>
            <tbody>{courses.map((c) => (
              <tr key={c.courseId}>
                <td><b>{c.code}</b> {c.title}</td><td>{c.batchLabel}</td><td>{c.instructor || "—"}</td><td>{c.held}{c.planned ? ` of ${c.planned}` : ""}</td>
                <td style={{ fontWeight: 700, color: c.average !== null && c.average < p.minPct ? "var(--rust)" : undefined }}>{c.average === null ? "—" : `${c.average}%`}</td>
                <td style={{ color: c.short ? "var(--rust)" : undefined, fontWeight: c.short ? 700 : 400 }}>{c.short}{c.cannotRecover ? ` (${c.cannotRecover} can't recover)` : ""}</td>
                <td>{c.atRisk}</td><td>{day(c.lastMarked)}</td><td>{c.qrSessions}</td>
                {canLogCqi && <td>{(c.short > 0 || (c.average !== null && c.average < p.minPct)) && <LogCqiButton courseId={c.courseId} batchId={c.batchId} code={c.code} average={c.average} short={c.short} minPct={p.minPct} />}</td>}
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Students below the minimum ({shortages.length})</h3>
        {shortages.length === 0 ? <p className="small-note" style={{ margin: 0 }}>Nobody is below {p.minPct}% in any course.</p> : (
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Student</th><th>Roll #</th><th>Course</th><th>Attendance</th><th>Standing</th><th>Best still possible</th><th>Advisor</th></tr></thead>
            <tbody>{shortages.map((s) => (
              <tr key={`${s.studentId}-${s.courseId}`}>
                <td>{s.name}</td><td>{s.rollNumber}</td><td>{s.code}</td><td style={{ fontWeight: 700, color: "var(--rust)" }}>{s.pct}%</td>
                <td><span className={`badge ${s.standing === "CANNOT_RECOVER" ? "badge-no" : "badge-neutral"}`}>{STANDING_LABEL[s.standing]}</span></td>
                <td>{s.best === null ? "—" : `${s.best}%`}</td><td>{advisors.get(courseOf.get(s.courseId)?.advisorId || "") || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {canLogCqi && <p className="small-note">Logged findings appear on <Link href="/chairman/cqi">CQI Records</Link>, where the action taken and the result are recorded.</p>}
    </Shell>
  );
}
