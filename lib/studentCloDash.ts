import { prisma } from "./db";
import { courseItems, courseMarks, courseSettings } from "./cloMethods";
import { studentClo } from "./cloMethodCore";

// The student's own CLO dashboard (Adeel prompt §7): per current course, each CLO cleared / not yet / not assessed (by
// the course's own method), the topics he is weak in (items below the pass mark, via the lectures they cover) and what
// to practise. Only his own data; no question-bank content.
export async function studentCloDash(studentId: string) {
  const en = await prisma.studentEnrollment.findMany({ where: { studentId, status: "ACTIVE", course: { isOffered: true } }, select: { course: { select: { id: true, code: true, title: true } } } });
  const out = [];
  for (const e of en) {
    try {
      const { items, clos } = await courseItems(e.course.id, "INSTRUCTOR");
      const settings = await courseSettings(e.course.id);
      const mine = (await courseMarks(e.course.id, items)).find((s) => s.studentId === studentId);
      if (!mine) continue;
      const res = clos.map((c) => ({ code: (c as { code?: string }).code || "CLO", statement: (c as { statement?: string }).statement || "", ...studentClo(settings, items, c.id, mine.marks) }));
      // Weak items: marked and below the pass mark → the lectures they cover.
      const weak = items.filter((i) => typeof mine.marks[i.id] === "number" && (100 * (mine.marks[i.id] as number)) / (i.maxMarks || 1) < settings.passPct);
      const links = weak.length ? await prisma.lectureRowInstrument.findMany({ where: { instrumentId: { in: weak.map((w) => w.id) } }, select: { lectureRow: { select: { topic: true, lectureNumber: true } } } }) : [];
      const topics = Array.from(new Map(links.map((l) => [l.lectureRow.topic, l.lectureRow.lectureNumber])).entries()).sort((a, b) => a[1] - b[1]).map(([t]) => t);
      out.push({ courseId: e.course.id, code: e.course.code, title: e.course.title, method: settings.method, clos: res, weakTopics: topics.slice(0, 8), weakItems: weak.map((w) => w.label).slice(0, 8) });
    } catch { /* a course without a plan yet */ }
  }
  return out;
}
