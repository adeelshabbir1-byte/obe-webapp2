import { prisma } from "./db";
import { buildSnapshot, applySnapshot } from "./publicCourse";
import { writeAuditLog } from "./audit";

// The same course taught before in this institute: when, which batch, who taught it and who designed it — and
// importing a particular teacher's plan (a Subject Expert into their plan; a teacher their own plan from last time).

export async function previousOfferings(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, masterCourseId: true, coordinator: { select: { managedById: true } } } });
  if (!c) return [];
  const rows = await prisma.course.findMany({
    where: { id: { not: c.id }, coordinator: { managedById: c.coordinator.managedById }, OR: [...(c.masterCourseId ? [{ masterCourseId: c.masterCourseId }] : []), { code: c.code }, { title: { equals: c.title, mode: "insensitive" } }] },
    select: { id: true, code: true, title: true, offeredTermName: true, offeredTermYear: true, batch: { select: { degreeProgram: true, batchName: true } }, instructor: { select: { id: true, name: true } }, subjectExpert: { select: { id: true, name: true } }, templateStatus: true, _count: { select: { studentEnrollments: true, studentMarks: true } }, clos: { select: { source: true } } },
    orderBy: [{ offeredTermYear: "desc" }, { createdAt: "desc" }], take: 40,
  });
  return rows.map((r) => ({ ...r, sePlan: r.clos.filter((x) => x.source === "SE").length, insPlan: r.clos.filter((x) => x.source === "INSTRUCTOR").length }));
}

/** Import one earlier offering's plan into this course. SE → the Subject Expert plan; INSTRUCTOR → the teacher's delivery copy. */
export async function importPlan(user: { id: string; role: string }, targetId: string, sourceId: string, fromPlan: "SE" | "INSTRUCTOR") {
  const t = await prisma.course.findUnique({ where: { id: targetId }, select: { id: true, subjectExpertId: true, instructorId: true, templateStatus: true, coordinator: { select: { managedById: true } } } });
  const s = await prisma.course.findUnique({ where: { id: sourceId }, select: { id: true, instructorId: true, coordinator: { select: { managedById: true } } } });
  if (!t || !s || t.coordinator.managedById !== s.coordinator.managedById) throw new Error("Course not found.");
  if (await prisma.studentMark.count({ where: { courseId: t.id } })) throw new Error("Marks are already entered in this course, so its plan can't be replaced.");
  let into: "SE" | "INSTRUCTOR";
  if (t.subjectExpertId === user.id) {
    if (t.templateStatus === "approved" || t.templateStatus === "submitted") throw new Error("Your plan is submitted / approved. Ask the OMC to reopen it (a template change) before replacing it.");
    into = "SE";
  } else if (t.instructorId === user.id) {
    if (s.instructorId !== user.id || fromPlan !== "INSTRUCTOR") throw new Error("As the teacher you can start from your own plan of a previous offering; the Subject Expert's plan comes with the course.");
    if (await prisma.attendanceRecord.count({ where: { courseId: t.id } })) throw new Error("Attendance has been taken, so the delivery plan can't be replaced. Edit it tab by tab.");
    into = "INSTRUCTOR";
  } else throw new Error("Only this course's Subject Expert or teacher imports a plan.");
  const snap = await buildSnapshot(s.id, fromPlan);
  if (!snap || !snap.clos.length) throw new Error("That offering has no plan of that kind.");
  await applySnapshot(snap, t.id, into, user.id);
  await writeAuditLog({ actorUserId: user.id, action: "COURSE_PLAN_IMPORTED_FROM_HISTORY", entityType: "Course", entityId: t.id, metadata: { sourceId: s.id, fromPlan, into } });
  return into === "SE" ? "Imported into your Subject Expert plan." : "Your own plan from last time is now this class's delivery copy. Differences from the Subject Expert's plan show to them for review.";
}
