import { prisma } from "./db";
import { notifyStudents } from "./studentNotices";

// "Exam tomorrow" (Adeel prompt §5): each scheduled exam paper dated tomorrow → its enrolled students (notice, and SMS /
// WhatsApp / push when those are on). Run daily from the cron.
export async function examTomorrow(now = new Date()) {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const papers = await prisma.examPaper.findMany({ where: { date: { gte: t, lt: new Date(t.getTime() + 864e5) } }, select: { courseId: true, slot: true, sessionId: true } }).catch(() => []);
  const sessions = new Map((await prisma.examSession.findMany({ where: { id: { in: papers.map((p) => p.sessionId).concat("none") } }, select: { id: true, chairmanId: true, name: true } })).map((s) => [s.id, s]));
  let n = 0;
  for (const p of papers) {
    const session = sessions.get(p.sessionId);
    const c = await prisma.course.findUnique({ where: { id: p.courseId }, select: { code: true, title: true } });
    const ids = (await prisma.studentEnrollment.findMany({ where: { courseId: p.courseId, status: "ACTIVE" }, select: { studentId: true } })).map((e) => e.studentId);
    await notifyStudents(ids, { kind: "EXAM_TOMORROW", title: `Exam tomorrow: ${c?.code} ${c?.title}`, body: `${session?.name || "Exam"}${p.slot != null ? `, slot ${p.slot + 1}` : ""}`, href: "/student/exams" }, session?.chairmanId || null);
    n += ids.length;
  }
  return n;
}
