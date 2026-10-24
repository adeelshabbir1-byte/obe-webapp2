import { prisma } from "./db";
import { countedCredits } from "./courseTypes";

// Course home: the department whose subject a course belongs to (Course.subjectHomeDepartmentId; when not set, the
// department that offers the program). "Courses in my degree" groups a batch's courses by home department; "Where my
// courses are used" lists every program and batch that includes a department's courses.

export async function coursesInDegree(batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { degreeProgram: true, batchName: true, coordinator: { select: { departmentId: true, department_: { select: { name: true } } } } } });
  if (!b) return null;
  const cs = await prisma.course.findMany({ where: { batchId }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, creditHours: true, courseType: true, semesterNumber: true, subjectHomeDepartmentId: true, subjectHomeDepartment: { select: { name: true } }, subjectExpert: { select: { name: true } }, instructor: { select: { name: true } } } });
  const own = b.coordinator.department_?.name || "Own department";
  const groups = new Map<string, { home: string; set: boolean; courses: typeof cs; ch: number }>();
  for (const c of cs) {
    const home = c.subjectHomeDepartment?.name || own;
    const k = `${home}|${c.subjectHomeDepartmentId ? 1 : 0}`;
    const g = groups.get(k) || { home, set: !!c.subjectHomeDepartmentId, courses: [], ch: 0 };
    g.courses.push(c); g.ch += c.creditHours; groups.set(k, g);
  }
  const total = countedCredits(cs);
  return { program: b.degreeProgram, batch: b.batchName, ownDepartment: own, total, unset: cs.filter((c) => !c.subjectHomeDepartmentId).length, groups: Array.from(groups.values()).sort((a, b2) => b2.ch - a.ch) };
}

export async function whereUsed(departmentId: string, chairmanId: string) {
  const cs = await prisma.course.findMany({
    where: { coordinator: { managedById: chairmanId }, OR: [{ subjectHomeDepartmentId: departmentId }, { subjectHomeDepartmentId: null, coordinator: { departmentId } }] },
    select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, isOffered: true, coordinator: { select: { departmentId: true, department_: { select: { name: true } } } }, batch: { select: { degreeProgram: true, batchName: true } }, sectionAssignments: { select: { sectionCount: true } }, _count: { select: { studentEnrollments: true } } },
    orderBy: { code: "asc" },
  });
  const by = new Map<string, { code: string; title: string; uses: { program: string; batch: string; department: string; semester: number | null; offered: boolean; sections: number; students: number; other: boolean }[] }>();
  for (const c of cs) {
    const k = c.code.trim().toUpperCase();
    const x = by.get(k) || { code: c.code, title: c.title, uses: [] };
    x.uses.push({ program: c.batch?.degreeProgram || "—", batch: c.batch?.batchName || "", department: c.coordinator.department_?.name || "", semester: c.semesterNumber, offered: c.isOffered, sections: c.sectionAssignments.reduce((a, s) => a + s.sectionCount, 0) || (c.isOffered ? 1 : 0), students: c._count.studentEnrollments, other: c.coordinator.departmentId !== departmentId });
    by.set(k, x);
  }
  const list = Array.from(by.values()).map((x) => ({ ...x, programs: Array.from(new Set(x.uses.map((u) => u.program))), otherPrograms: Array.from(new Set(x.uses.filter((u) => u.other).map((u) => u.program))) }));
  return { courses: list.sort((a, b) => b.otherPrograms.length - a.otherPrograms.length || a.code.localeCompare(b.code)), servedPrograms: Array.from(new Set(list.flatMap((x) => x.otherPrograms))) };
}
