import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { getLinkedSections } from "../../../../../lib/linkedSections";
import { shortSectionCode } from "../../../../../lib/shortSectionCode";
import { computeResultMate } from "../../../../../lib/resultMate";
import { getPassingCriteria } from "../../../../../lib/passingCriteria";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import SimpleBarChart from "../../../../../components/SimpleBarChart";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import MarksEntryManager from "../../../../../components/MarksEntryManager";
import CombinedMarksEntryManager from "../../../../../components/CombinedMarksEntryManager";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }, { href: "/omc/reports", label: "Reports" }];

export default async function MarksEntryPage({ params, searchParams }: { params: { courseId: string }; searchParams: { combined?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { batch: true } });
  if (!course || course.instructorId !== user.id) notFound();

  const linkedSections = await getLinkedSections(user.id, course.id);
  const wantsCombined = searchParams.combined === "1" && linkedSections.length > 0;

  // Histograms — grade distribution and CLO attainment, visible right here
  // while entering/reviewing marks, not just later in Result Mate.
  const passCriteria = await getPassingCriteria(await chairmanIdFor(user));
  const result = await computeResultMate(course.id);
  const gradeBuckets = new Map<string, number>();
  for (const r of result.rows) gradeBuckets.set(r.grade, (gradeBuckets.get(r.grade) || 0) + 1);
  const gradeOrder = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];
  const gradeHistogram = gradeOrder.filter((g) => gradeBuckets.has(g)).map((g) => ({ label: g, value: gradeBuckets.get(g)! }));
  const cloHistogram = result.cloCodes.map((code) => {
    const max = result.cloMaxWeight[code] || 0;
    const threshold = max * (passCriteria.cloPct / 100);
    const passCount = result.rows.filter((r) => (r.byClo[code] || 0) >= threshold).length;
    return { label: code, value: passCount };
  });

  const [instruments, enrollments, batchStudentCount] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: [{ type: "asc" }, { label: "asc" }] }),
    prisma.studentEnrollment.findMany({ where: { courseId: course.id }, include: { student: true, } }),
    course.batchId ? prisma.student.count({ where: { batchId: course.batchId } }) : Promise.resolve(0),
  ]);

  const marks = await prisma.studentMark.findMany({ where: { courseId: course.id } });
  const marksByStudent = new Map<string, Record<string, number>>();
  for (const m of marks) {
    const existing = marksByStudent.get(m.studentId) || {};
    existing[m.instrumentId] = m.score;
    marksByStudent.set(m.studentId, existing);
  }

  // For the combined view: gather every linked section's own instruments,
  // students, and marks, so they can be shown together in one roster.
  let combinedData: { instruments: { id: string; type: string; label: string; maxScore: number }[]; sections: { courseId: string; sectionLabel: string; sectionFullLabel: string; students: { id: string; name: string; rollNumber: string; isRepeat: boolean; marks: Record<string, number> }[] }[]; instrumentIdBySlot: Record<string, Record<string, string>> } | null = null;

  if (wantsCombined) {
    try {
      const allCourseIds = [course.id, ...linkedSections.map((s) => s.id)];
      const [allInstrumentsRaw, allEnrollments, allMarks] = await Promise.all([
        prisma.assessmentInstrument.findMany({ where: { courseId: { in: allCourseIds }, source: "INSTRUCTOR" } }),
        prisma.studentEnrollment.findMany({ where: { courseId: { in: allCourseIds } }, include: { student: true } }),
        prisma.studentMark.findMany({ where: { courseId: { in: allCourseIds } } }),
      ]);

      // Unify instrument "slots" by (type, label) — assumes linked sections
      // share the same instrument setup, which is the normal case since
      // settings are meant to be synced across them.
      const slotKey = (type: string, label: string) => `${type}::${label}`;
      const slotsSeen = new Map<string, { type: string; label: string; maxScore: number }>();
      for (const i of allInstrumentsRaw) {
        const key = slotKey(i.type, i.label);
        if (!slotsSeen.has(key)) slotsSeen.set(key, { type: i.type, label: i.label, maxScore: i.maxScore });
      }
      const unifiedInstruments = Array.from(slotsSeen.values()).map((s) => ({ id: slotKey(s.type, s.label), type: s.type, label: s.label, maxScore: s.maxScore }));

      // Map: courseId -> slotKey -> actual instrumentId (for saving marks against the right record)
      const instrumentIdBySlot = new Map<string, Map<string, string>>();
      for (const cid of allCourseIds) instrumentIdBySlot.set(cid, new Map());
      for (const i of allInstrumentsRaw) {
        const bucket = instrumentIdBySlot.get(i.courseId);
        if (bucket) bucket.set(slotKey(i.type, i.label), i.id);
      }

      const marksByStudentAll = new Map<string, Record<string, number>>(); // studentId -> instrumentId -> score
      for (const m of allMarks) {
        const existing = marksByStudentAll.get(m.studentId) || {};
        existing[m.instrumentId] = m.score;
        marksByStudentAll.set(m.studentId, existing);
      }

      const allCoursesById = new Map<string, typeof course>([[course.id, course], ...linkedSections.map((c) => [c.id, c] as [string, typeof course])]);
      const sections = allCourseIds.map((cid) => {
        const c = allCoursesById.get(cid);
        const slotMap = instrumentIdBySlot.get(cid) || new Map<string, string>();
        const studentsInCourse = allEnrollments.filter((e) => e.courseId === cid);
        return {
          courseId: cid,
          sectionLabel: c?.batch ? shortSectionCode(c.batch.degreeProgram, c.offeredTermName, c.offeredTermYear) : (c?.code || cid),
          sectionFullLabel: c?.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : (c?.code || cid),
          students: studentsInCourse.map((e) => {
            const rawMarks = marksByStudentAll.get(e.studentId) || {};
            const marksBySlot: Record<string, number> = {};
            for (const [slot, instId] of slotMap.entries()) if (rawMarks[instId] !== undefined) marksBySlot[slot] = rawMarks[instId];
            return { id: e.student.id, name: e.student.name, rollNumber: e.student.rollNumber, isRepeat: e.isRepeat, marks: marksBySlot };
          }),
        };
      });

      combinedData = { instruments: unifiedInstruments, sections, instrumentIdBySlot: Object.fromEntries(Array.from(instrumentIdBySlot.entries()).map(([cid, m]) => [cid, Object.fromEntries(m)])) };
    } catch (err) {
      console.error("Combined marks view failed to build, falling back to single-section view:", err);
      combinedData = null;
    }
  }

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={NAV}>
      <InstructorCourseSubNav courseId={course.id} active="marks" code={course.code} title={course.title} />
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Marks Entry</h2>
      <div className="card" style={{ borderColor: "var(--brass)" }}>
        <p style={{ fontSize: 12.5, marginBottom: 8 }}>Once marks are entered, view computed grades, CLO/PLO attainment, and set grade cutoffs for this course.</p>
        <a href={`/omc/reports/result-mate?courseId=${course.id}`} className="btn btn-brass" style={{ textDecoration: "none", display: "inline-block" }}>View Results for This Course</a>
      </div>

      {result.rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 4 }}>Grades Histogram</h3>
            <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 10 }}>How many students landed in each letter grade, based on marks entered so far.</p>
            {gradeHistogram.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No grades computed yet.</p>
            ) : (
              <SimpleBarChart bars={gradeHistogram} />
            )}
          </div>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 4 }}>CLO Attainment Histogram</h3>
            <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 10 }}>How many students passed each CLO (out of {result.rows.length}), at the {passCriteria.cloPct}% threshold.</p>
            {cloHistogram.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No CLOs with marks yet.</p>
            ) : (
              <SimpleBarChart bars={cloHistogram} maxValue={result.rows.length} />
            )}
          </div>
        </div>
      )}

      {linkedSections.length > 0 && (
        <div className="card no-print" style={{ borderColor: "var(--brass)" }}>
          <p style={{ fontSize: 12.5, marginBottom: 8 }}>
            You teach {linkedSections.length + 1} section(s) of this course this semester.
            {wantsCombined ? " Showing all sections together below." : " Grade them together in one roster instead of switching between courses."}
          </p>
          {wantsCombined && !combinedData && (
            <p style={{ fontSize: 12, color: "var(--rust)", marginBottom: 8 }}>
              Couldn't build the combined view just now — showing this section only below instead. This usually means the sections' assessment setups have diverged; try syncing them from the Weights tab.
            </p>
          )}
          <a href={wantsCombined ? `/instructor/courses/${course.id}/marks` : `/instructor/courses/${course.id}/marks?combined=1`} className="btn btn-brass" style={{ textDecoration: "none", display: "inline-block" }}>
            {wantsCombined ? "Show This Section Only" : "Grade All Sections Together"}
          </a>
        </div>
      )}

      {wantsCombined && combinedData ? (
        <CombinedMarksEntryManager instruments={combinedData.instruments} sections={combinedData.sections} instrumentIdBySlot={combinedData.instrumentIdBySlot} />
      ) : (
        <MarksEntryManager
          courseId={course.id}
          instruments={instruments.map((i) => ({ id: i.id, type: i.type, label: i.label, maxScore: i.maxScore }))}
          students={enrollments.map((e) => ({ id: e.student.id, name: e.student.name, rollNumber: e.student.rollNumber, isRepeat: e.isRepeat, marks: marksByStudent.get(e.student.id) || {} }))}
          hasUnenrolledBatchStudents={batchStudentCount > enrollments.length}
        />
      )}
    </Shell>
  );
}
