import Link from "next/link";
import { prisma } from "../lib/db";
import { chairmanIdFor } from "../lib/reportScope";

type U = { id: string; role: string; managedById: string | null };
const LEAD_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"];

// "Today": what needs this person's attention now — deadlines this week, marks still to enter, results waiting for approval.
export default async function TodayPanel({ user }: { user: U }) {
  const items: { text: string; href: string; tone: "red" | "amber" | "blue" }[] = [];
  const now = new Date(), week = new Date(Date.now() + 7 * 86400000);
  try {
    const [seCourses, myCourses] = await Promise.all([
      prisma.course.findMany({ where: { subjectExpertId: user.id }, select: { id: true } }),
      prisma.course.findMany({ where: { instructorId: user.id, isOffered: true }, select: { id: true, code: true } }),
    ]);
    const dl = await prisma.deadline.findMany({
      where: { completedAt: null, dueDate: { lte: week }, allCourses: false, OR: [{ assigneeId: user.id }, { courseId: { in: seCourses.map((c) => c.id) }, role: "SUBJECT_EXPERT" }, { courseId: { in: myCourses.map((c) => c.id) }, role: "INSTRUCTOR" }] } as never,
      select: { dueDate: true }, take: 200,
    });
    const overdue = dl.filter((d) => d.dueDate < now).length, soon = dl.length - overdue;
    if (overdue) items.push({ text: `${overdue} task${overdue > 1 ? "s" : ""} overdue`, href: "/deadlines", tone: "red" });
    if (soon) items.push({ text: `${soon} task${soon > 1 ? "s" : ""} due this week`, href: "/deadlines", tone: "amber" });
    // Marks to enter: assessments whose lectures have been held but some enrolled students have no mark.
    if (myCourses.length) {
      const insts = await prisma.assessmentInstrument.findMany({
        where: { courseId: { in: myCourses.map((c) => c.id) }, source: "INSTRUCTOR", lectureLinks: { some: { lectureRow: { actualDate: { lte: now } } } } },
        select: { id: true, courseId: true, _count: { select: { studentMarks: true } } },
      }).catch(() => []);
      if (insts.length) {
        const enrolled = await prisma.studentEnrollment.groupBy({ by: ["courseId"], where: { courseId: { in: myCourses.map((c) => c.id) }, status: "ACTIVE" }, _count: { _all: true } });
        const n = new Map(enrolled.map((e) => [e.courseId, e._count._all]));
        const pending = new Map<string, number>();
        for (const i of insts) if ((n.get(i.courseId) || 0) > i._count.studentMarks) pending.set(i.courseId, (pending.get(i.courseId) || 0) + 1);
        for (const [cid, k] of Array.from(pending.entries()).slice(0, 4)) {
          const c = myCourses.find((x) => x.id === cid)!;
          items.push({ text: `${c.code}: marks missing for ${k} assessment${k > 1 ? "s" : ""}`, href: `/instructor/courses/${cid}/marks`, tone: "blue" });
        }
      }
    }
    if (LEAD_ROLES.includes(user.role)) {
      const where = user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : { coordinator: { managedById: await chairmanIdFor(user) } };
      const ids = (await prisma.course.findMany({ where: where as never, select: { id: true } })).map((c) => c.id);
      const waiting = ids.length ? await (prisma as unknown as Record<string, any>).courseResult?.count({ where: { courseId: { in: ids }, status: "SUBMITTED" } }).catch(() => 0) : 0;
      if (waiting) items.push({ text: `${waiting} course result${waiting > 1 ? "s" : ""} waiting for approval`, href: "/results-approval", tone: "amber" });
    }
  } catch { return null; }
  const color = { red: ["#FBE9E7", "#B3261E"], amber: ["#FBF3E4", "#7A520C"], blue: ["#EAF1FB", "#1B4F8A"] };
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Today</h3>
      {items.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)", margin: 0 }}>Nothing is waiting for you right now. ✓</p> : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {items.map((i, k) => <Link key={k} href={i.href} style={{ background: color[i.tone][0], color: color[i.tone][1], padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>{i.text} →</Link>)}
        </div>
      )}
    </div>
  );
}
