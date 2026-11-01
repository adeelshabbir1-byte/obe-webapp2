import { prisma } from "./db";

// Data quality (Adeel prompt §9): problems with a count and a "Fix" link to the exact place. Worked out on demand (cached
// 10 minutes) and nightly from the cron; a Program Lead sees his program's part, leaders the whole institute.
export type Problem = { key: string; label: string; count: number; samples: { text: string; href: string }[]; fix: string };
const cache = new Map<string, { at: number; v: Problem[] }>();

export async function dataQuality(scope: { chairmanId: string; plId?: string | null }, fresh = false): Promise<Problem[]> {
  const ck = `${scope.chairmanId}|${scope.plId || ""}`;
  const c = cache.get(ck);
  if (!fresh && c && Date.now() - c.at < 600_000) return c.v;
  const coord = scope.plId ? { id: scope.plId } : { managedById: scope.chairmanId };
  const out: Problem[] = [];
  const add = (p: Problem) => { if (p.count) out.push(p); };

  // Students
  const students = await prisma.student.findMany({ where: { status: "ACTIVE", batch: { coordinator: coord } }, select: { id: true, name: true, rollNumber: true, batchId: true } });
  const byRoll = new Map<string, typeof students>();
  for (const s of students) { const k = (s.rollNumber || "").trim().toLowerCase(); if (!k) continue; byRoll.set(k, [...(byRoll.get(k) || []), s]); }
  const dup = Array.from(byRoll.values()).filter((x) => x.length > 1);
  add({ key: "dupStudents", label: "Duplicate students (same roll number)", count: dup.length, fix: "Open the student and merge or correct the roll number.", samples: dup.slice(0, 5).map((x) => ({ text: `${x[0].rollNumber}: ${x.map((s) => s.name).join(" / ")}`, href: `/coordinator/students?q=${encodeURIComponent(x[0].rollNumber)}` })) });
  const noRoll = students.filter((s) => !(s.rollNumber || "").trim());
  add({ key: "noRoll", label: "Students without a roll number", count: noRoll.length, fix: "Add the roll number.", samples: noRoll.slice(0, 5).map((s) => ({ text: s.name, href: `/coordinator/students?q=${encodeURIComponent(s.name)}` })) });

  // Batches
  const batches = await prisma.batch.findMany({ where: { coordinator: coord }, select: { id: true, batchName: true, degreeProgram: true, studentCount: true, _count: { select: { students: true } } } });
  const noCount = batches.filter((b) => !b.studentCount && !b._count.students);
  add({ key: "batchCount", label: "Batches with no students and no student count", count: noCount.length, fix: "Enter the student count or upload the students.", samples: noCount.slice(0, 5).map((b) => ({ text: `${b.degreeProgram} ${b.batchName}`, href: `/coordinator/batches?batchId=${b.id}` })) });

  // Courses offered now
  const courses = await prisma.course.findMany({ where: { isOffered: true, coordinator: coord }, select: { id: true, code: true, title: true, subjectExpertId: true, instructorId: true, contentSyncMember: { select: { isBase: true } }, _count: { select: { scheduleSections: true, lectureRows: true } } } });
  const noSe = courses.filter((c) => !c.subjectExpertId && (!c.contentSyncMember || c.contentSyncMember.isBase));
  add({ key: "noSe", label: "Offered courses with no Subject Expert", count: noSe.length, fix: "Name the SE (Assign Subject Experts).", samples: noSe.slice(0, 5).map((c) => ({ text: `${c.code} ${c.title}`, href: "/coordinator/assign-subject-experts" })) });
  const noIns = courses.filter((c) => !c.instructorId);
  add({ key: "noInstructor", label: "Offered courses with no instructor", count: noIns.length, fix: "Assign the instructor (Course Assigner).", samples: noIns.slice(0, 5).map((c) => ({ text: `${c.code} ${c.title}`, href: "/assigner" })) });
  const noSec = courses.filter((c) => !c._count.scheduleSections);
  add({ key: "noSections", label: "Offered courses with no sections", count: noSec.length, fix: "Create sections (Timetable).", samples: noSec.slice(0, 5).map((c) => ({ text: `${c.code} ${c.title}`, href: "/coordinator/timetable" })) });
  const noPlan = courses.filter((c) => !c._count.lectureRows && (!c.contentSyncMember || c.contentSyncMember.isBase));
  add({ key: "noPlan", label: "Offered courses with no lecture plan", count: noPlan.length, fix: "The SE fills the lecture plan (or imports it from Excel).", samples: noPlan.slice(0, 5).map((c) => ({ text: `${c.code} ${c.title}`, href: "/coordinator/courses" })) });

  // CLOs not mapped to a GA
  const ids = courses.map((c) => c.id).concat("none");
  const unmapped = await prisma.cLO.findMany({ where: { courseId: { in: ids }, source: "SE", mappedPloId: null }, select: { code: true, course: { select: { id: true, code: true } } }, take: 200 });
  add({ key: "cloNoGa", label: "CLOs not mapped to a GA", count: unmapped.length, fix: "Map each CLO to its GA.", samples: unmapped.slice(0, 5).map((x) => ({ text: `${x.course.code} ${x.code}`, href: "/coordinator/courses" })) });

  // Mid / final questions without a CLO
  const qs = await prisma.paperDistributionItem.findMany({ where: { cloId: null, courseId: { in: ids }, examType: { in: ["Midterm", "Final"] } }, select: { courseId: true }, take: 300 });
  const qCourses = Array.from(new Set(qs.map((q) => q.courseId)));
  add({ key: "qNoClo", label: "Mid / final questions not mapped to a CLO", count: qs.length, fix: "Map each question to a CLO in the paper.", samples: qCourses.slice(0, 5).map((id) => ({ text: courses.find((c) => c.id === id)?.code || "course", href: "/coordinator/courses" })) });

  // Teachers without a department (institute view only)
  if (!scope.plId) {
    const t = await prisma.user.findMany({ where: { isActive: true, departmentId: null, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER"] }, OR: [{ managedBy: { managedById: scope.chairmanId } }, { managedById: scope.chairmanId }] }, select: { id: true, name: true }, take: 200 });
    add({ key: "noDept", label: "Teachers without a department", count: t.length, fix: "Set the teacher's department.", samples: t.slice(0, 5).map((u) => ({ text: u.name, href: `/chairman/people?q=${encodeURIComponent(u.name)}` })) });
  }
  cache.set(ck, { at: Date.now(), v: out });
  return out;
}
