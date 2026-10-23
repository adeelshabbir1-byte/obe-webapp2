import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { syncCourseFolders } from "./courseFile";

// Dream University: the courses of semesters 1–4 have their lectures recorded as taught (with dates), attendance for
// every class and the teacher's observations, so their course files are complete; semester 5 is still in progress, so
// its files show what is missing. Safe to run again: only empty things are filled.

function rng(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const NOTES = [
  "Students found recursion and pointers hard; two extra lab sessions were added in weeks 9 and 10 and the weaker group improved by the final.",
  "CLO-3 was below target last time; this term the project was split into two milestones with feedback in between.",
  "Class participation was good. Next time the quiz on topic 4 should come after the lab, not before it.",
  "The case studies worked well; students asked for more local examples, which will be added to the outline.",
];

export async function campusCourseFiles() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: head.id } }, select: { id: true, startTerm: true, startYear: true } });
  const courses = await prisma.course.findMany({ where: { batchId: { in: batches.map((b) => b.id) }, isOffered: true, semesterNumber: { gte: 1, lte: 4 } }, select: { id: true, code: true, batchId: true, coordinatorId: true, instructorId: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, instructorObservations: true } });
  let dated = 0, att = 0, notes = 0;
  for (const c of courses) {
    const b = batches.find((x) => x.id === c.batchId)!;
    // The term the course ran in: its own stamp, or the batch's start term plus the semester.
    let term = c.offeredTermName, year = c.offeredTermYear;
    if (!term || !year) {
      const k = (c.semesterNumber || 1) - 1, springStart = /spring/i.test(b.startTerm);
      term = (k % 2 === 0) === springStart ? "Spring" : "Fall";
      year = b.startYear + (springStart ? Math.floor(k / 2) : Math.floor((k + 1) / 2));
    }
    const start = new Date(Date.UTC(year, /spring/i.test(term) ? 1 : 8, 2));
    const rows = await prisma.lectureRow.findMany({ where: { courseId: c.id, source: "INSTRUCTOR" }, select: { id: true, week: true, lectureNumber: true, actualDate: true }, orderBy: [{ week: "asc" }, { lectureNumber: "asc" }] });
    for (const r of rows.filter((x) => !x.actualDate)) {
      const d = new Date(start.getTime() + ((r.week - 1) * 7 + (r.lectureNumber % 2 === 0 ? 2 : 0)) * 864e5);
      await prisma.lectureRow.update({ where: { id: r.id }, data: { actualDate: d } });
      dated++;
    }
    if (!(await prisma.attendanceRecord.count({ where: { courseId: c.id } }))) {
      const students = (await prisma.studentEnrollment.findMany({ where: { courseId: c.id }, select: { studentId: true } })).map((e) => e.studentId);
      const r = rng(`att-${c.id}`);
      const data = rows.flatMap((lr) => students.map((s) => { const x = r(); return { courseId: c.id, lectureRowId: lr.id, studentId: s, status: x < 0.86 ? "PRESENT" : x < 0.9 ? "LATE" : x < 0.93 ? "LEAVE" : "ABSENT", markedById: c.instructorId || c.coordinatorId }; }));
      for (let i = 0; i < data.length; i += 2000) await prisma.attendanceRecord.createMany({ data: data.slice(i, i + 2000) });
      att += data.length;
    }
    if (!c.instructorObservations?.trim() && !(await prisma.cqiRecord.count({ where: { courseId: c.id } }))) {
      await prisma.course.update({ where: { id: c.id }, data: { instructorObservations: NOTES[Math.floor(rng(c.code)() * NOTES.length)] } });
      notes++;
    }
  }
  const st = await syncCourseFolders(courses.map((c) => ({ id: c.id, coordinatorId: c.coordinatorId })));
  const complete = Array.from(st.values()).filter((s) => s.complete).length;
  const done: string[] = [];
  if (dated) done.push(`${dated} lectures recorded as taught`);
  if (att) done.push(`${att} attendance marks`);
  if (notes) done.push(`teacher's observations for ${notes} courses`);
  done.push(`${complete} of ${courses.length} course files of semesters 1–4 complete`);
  return done;
}
