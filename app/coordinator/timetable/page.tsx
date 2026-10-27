import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import { latestRunFor } from "../../../lib/timetableView";
import TimetableManager from "../../../components/TimetableManager";
import { getAuthenticatedUser } from "../../../lib/session";
import { timetableActor, scopeBatches, scopeFaculty, READ_ONLY } from "../../../lib/timetableAccess";
import { getMaxSection, retiredSectionIds, sectionsOfBatches } from "../../../lib/studentSections";
import { LIST_TYPES } from "../../../lib/autoCopyPreviousBatch";

export const dynamic = "force-dynamic";

// The department timetable. The Department Coordinator owns it: every program and batch of the department in one
// timetable. A Program Lead sees it read-only, filtered to their own batches (or runs it themselves when the department
// has no Department Coordinator).
export default async function TimetablePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const actor = await timetableActor();
  if (!actor) {
    return (
      <Shell roleLabel={user.role.replace(/_/g, " ").toLowerCase()} userName={user.name} navLinks={navForRole(user.role)}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Timetable</h1>
        <div className="card"><p style={{ fontSize: 13 }}>The timetable is run by the department&apos;s <b>Department Coordinator</b> (or a Program Lead where there is none). You are signed in as {user.role.replace(/_/g, " ").toLowerCase()}.</p></div>
      </Shell>
    );
  }
  const { scope, chairmanId } = actor;
  const [rooms, batches, faculty, latestRun, max] = await Promise.all([
    prisma.room.findMany({ where: scope.roomWhere, orderBy: { name: "asc" } }),
    scopeBatches(scope),
    scopeFaculty(scope),
    latestRunFor(chairmanId, scope.key),
    getMaxSection(chairmanId, scope.key),
  ]);
  const batchIds = batches.map((b) => b.id);
  const sectionsByBatch = await sectionsOfBatches(batchIds, max);

  // Per-program check: anything that would leave a program (or a batch) out of the timetable is red.
  const courses = await prisma.course.findMany({ where: { batchId: { in: batchIds.concat("none") }, isOffered: true, courseType: { notIn: LIST_TYPES } }, select: { id: true, batchId: true, instructorId: true, semesterNumber: true, creditHours: true, _count: { select: { sectionAssignments: true } }, equivalenceMember: { select: { group: { select: { _count: { select: { sectionAssignments: true } } } } } } } });
  const sections = await prisma.scheduleSection.findMany({ where: { OR: [{ courseId: { in: courses.map((c) => c.id).concat("none") } }, { group: { members: { some: { courseId: { in: courses.map((c) => c.id).concat("none") } } } } }] }, select: { id: true, courseId: true, group: { select: { members: { select: { courseId: true } } } } } });
  const retired = await retiredSectionIds(sections.map((s) => s.id));
  const withSection = new Set(sections.filter((s) => !retired.has(s.id)).flatMap((s) => (s.courseId ? [s.courseId] : (s.group?.members || []).map((m) => m.courseId))));
  const programs = Array.from(new Set(batches.map((b) => b.degreeProgram))).sort();
  const own = new Set(actor.ownBatchIds || batchIds);
  const checks = programs.map((program) => {
    const bs = batches.filter((b) => b.degreeProgram === program);
    const cs = courses.filter((c) => bs.some((b) => b.id === c.batchId));
    const noTeacher = cs.filter((c) => !c.instructorId && !c._count.sectionAssignments && !c.equivalenceMember?.group._count.sectionAssignments).length;
    const red = [
      ...bs.filter((b) => !courses.some((c) => c.batchId === b.id)).map((b) => `${b.batchName}: semester not offered`),
      ...bs.filter((b) => !b.studentCount).map((b) => `${b.batchName}: no student count`),
      // Courses of several semesters offered at once (a past semester never taken off) can't fit in one week.
      ...bs.map((b) => ({ b, sems: Array.from(new Set(courses.filter((c) => c.batchId === b.id).map((c) => c.semesterNumber || 0))).sort((x, y) => x - y) }))
        .filter((x) => x.sems.length > 1).map((x) => `${x.b.batchName}: courses of ${x.sems.length} semesters are offered (S${x.sems.join(", S")}) — offer only the current semester`),
      ...bs.map((b) => ({ b, ch: courses.filter((c) => c.batchId === b.id).reduce((a, c) => a + c.creditHours, 0) })).filter((x) => x.ch > 24).map((x) => `${x.b.batchName}: ${x.ch} credit hours offered this term`),
    ];
    return { program, offered: cs.length, withSections: cs.filter((c) => withSection.has(c.id)).length, noTeacher, noCount: bs.filter((b) => !b.studentCount).length, red, mine: bs.some((b) => own.has(b.id)), split: bs.filter((b) => (sectionsByBatch.get(b.id) || []).length > 1).map((b) => `${b.batchName} (${(sectionsByBatch.get(b.id) || []).map((s) => `${s.label} ${s.size}`).join(" · ")})`) };
  });
  const roleName = actor.isDeptCoordinator ? "Department Coordinator" : "Program Lead";

  return (
    <Shell roleLabel={roleName} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Timetable</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        One timetable for every program and batch of the department. Set up rooms, batch windows and teacher availability,
        auto-generate the sections, then generate a clash-free timetable. Currently planning: <b>{scope.label}</b>{scope.mode === "SHARED" ? " (shared with the other departments on the common timetable)" : " (this department only, with its own rooms)"}.
      </p>
      {!actor.canEdit && <div className="card" style={{ borderLeft: "5px solid #1565C0" }}><b>Read-only.</b> {READ_ONLY(actor)} You still set your courses&apos; offering and instructors as usual.</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginTop: 0 }}>Programs on this timetable</h3>
        <table className="table" style={{ fontSize: 12.5 }}>
          <thead><tr><th>Program</th><th>Offered courses</th><th>With sections</th><th>No instructor</th><th>Batches with no student count</th><th>Batches in sections (≤ {max})</th><th>Needs attention</th></tr></thead>
          <tbody>{checks.length === 0 ? <tr><td colSpan={7} className="small-note">No batches on this timetable yet.</td></tr> : checks.map((c) => (
            <tr key={c.program} style={{ background: c.mine && !actor.isDeptCoordinator ? "rgba(21,101,192,.06)" : undefined }}>
              <td><b>{c.program}</b></td><td>{c.offered}</td>
              <td style={{ color: c.withSections < c.offered ? "#B3261E" : "#1E6B34", fontWeight: 600 }}>{c.withSections} of {c.offered}</td>
              <td style={{ color: c.noTeacher ? "#B3261E" : undefined, fontWeight: c.noTeacher ? 700 : 400 }}>{c.noTeacher}</td>
              <td style={{ color: c.noCount ? "#B3261E" : undefined, fontWeight: c.noCount ? 700 : 400 }}>{c.noCount}</td>
              <td style={{ fontSize: 11.5 }}>{c.split.join("; ") || "—"}</td>
              <td style={{ color: "#B3261E", fontWeight: 600 }}>{c.red.length ? c.red.map((r) => `${c.program} ${r}`).join(" · ") : <span style={{ color: "#1E6B34" }}>ready</span>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <TimetableManager
        rooms={rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, capacity: r.capacity }))}
        batches={batches.map((b) => ({
          id: b.id, label: `${b.degreeProgram} — ${b.batchName}`,
          workingDays: b.scheduleConfig ? JSON.parse(b.scheduleConfig.workingDaysJson) : ["Mon", "Tue", "Wed", "Thu", "Fri"],
          dailyStartHour: b.scheduleConfig?.dailyStartHour ?? 8, dailyEndHour: b.scheduleConfig?.dailyEndHour ?? 16,
        }))}
        faculty={faculty.map((f) => ({ id: f.id, name: f.name }))}
        latestRunId={latestRun?.id || null}
        canEdit={actor.canEdit}
        ownBatchIds={actor.ownBatchIds}
        maxSection={max}
        batchSections={Object.fromEntries(Array.from(sectionsByBatch.entries()).map(([b, s]) => [b, s.map((x) => x.label)]))}
      />
    </Shell>
  );
}
