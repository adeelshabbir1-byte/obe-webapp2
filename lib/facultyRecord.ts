import { prisma } from "./db";
import { computeResultMate, computeCloPloPassRates } from "./resultMate";
import { getPassingCriteria } from "./passingCriteria";
import { getCourseResult } from "./resultApproval";

// A teacher's course record: every course they taught, designed or ran as a lab, with its results and delivery.
export async function facultyRecord(userId: string) {
  const courses = await prisma.course.findMany({
    where: { OR: [{ instructorId: userId }, { subjectExpertId: userId }, { labEngineerId: userId }, { sectionAssignments: { some: { instructorId: userId } } }] },
    select: { id: true, code: true, title: true, creditHours: true, hasLab: true, isOffered: true, offeredTermName: true, offeredTermYear: true, instructorId: true, subjectExpertId: true, labEngineerId: true, templateStatus: true, createdAt: true,
      batch: { select: { degreeProgram: true, batchName: true } }, coordinator: { select: { managedById: true } },
      _count: { select: { studentEnrollments: true } } },
    orderBy: [{ offeredTermYear: "desc" }, { createdAt: "desc" }], take: 40,
  });
  const criteria = courses[0] ? await getPassingCriteria(courses[0].coordinator.managedById).catch(() => ({ cloPct: 50, ploPct: 50 })) : { cloPct: 50, ploPct: 50 };
  const out = [];
  for (const c of courses) {
    const roles = [c.instructorId === userId ? "Instructor" : "", c.subjectExpertId === userId ? "Subject Expert" : "", c.labEngineerId === userId ? "Lab" : ""].filter(Boolean);
    const teaches = c.instructorId === userId || c.labEngineerId === userId;
    const [mate, clo, planned, held, att, insts, result, ff] = await Promise.all([
      teaches ? computeResultMate(c.id).catch(() => null) : null,
      teaches ? computeCloPloPassRates(c.id, criteria).catch(() => null) : null,
      prisma.lectureRow.count({ where: { courseId: c.id, source: "INSTRUCTOR" } }),
      prisma.lectureRow.count({ where: { courseId: c.id, source: "INSTRUCTOR", actualDate: { not: null } } }),
      prisma.attendanceRecord.groupBy({ by: ["status"], where: { courseId: c.id }, _count: { _all: true } }),
      prisma.assessmentInstrument.findMany({ where: { courseId: c.id, source: "INSTRUCTOR" }, select: { id: true, _count: { select: { studentMarks: true } } } }),
      getCourseResult(c.id),
      prisma.feedForwardNote.count({ where: { courseId: c.id } }),
    ]);
    const rows = mate?.rows || [];
    const avg = rows.length ? Math.round((10 * rows.reduce((t, r) => t + r.totalPct, 0)) / rows.length) / 10 : null;
    const pass = rows.length ? Math.round((1000 * rows.filter((r) => r.grade !== "F").length) / rows.length) / 10 : null;
    const grades = rows.length ? ["A", "B", "C", "D", "F"].map((g) => [g, rows.filter((r) => r.grade === g).length] as [string, number]) : [];
    const cloReached = clo?.studentCount ? `${clo.cloStats.filter((s) => s.maxWeight > 0 && s.passCount / clo.studentCount >= 0.6).length}/${clo.cloStats.filter((s) => s.maxWeight > 0).length}` : null;
    const attTotal = att.reduce((t, a) => t + a._count._all, 0), attPresent = att.filter((a) => a.status === "PRESENT" || a.status === "LATE").reduce((t, a) => t + a._count._all, 0);
    const marksDone = insts.length ? insts.filter((i) => i._count.studentMarks > 0).length : 0;
    out.push({
      id: c.id, term: c.offeredTermName ? `${c.offeredTermName} ${c.offeredTermYear || ""}` : "—", batch: `${c.batch?.degreeProgram || ""} — ${c.batch?.batchName || ""}`,
      course: `${c.code} ${c.title}`, ch: c.creditHours, roles, students: c._count.studentEnrollments, avg, pass, grades, cloReached,
      lectures: planned ? `${held}/${planned}` : "—", coverage: planned ? Math.round((100 * held) / planned) : null,
      attendance: attTotal ? Math.round((100 * attPresent) / attTotal) : null, marks: insts.length ? `${marksDone}/${insts.length}` : "—",
      result: result ? `${result.status.toLowerCase()}${result.submittedAt ? ` ${result.submittedAt.toISOString().slice(0, 10)}` : ""}` : c.isOffered ? "not submitted" : "—",
      plan: c.subjectExpertId === userId ? c.templateStatus : null, feedForward: ff,
    });
  }
  return out;
}
