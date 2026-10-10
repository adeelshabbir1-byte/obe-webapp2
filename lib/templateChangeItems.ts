import { prisma } from "./db";
import type { ChangeItem } from "../components/TemplateChangeHistory";

export async function loadChangeItems(where: Record<string, unknown>): Promise<ChangeItem[]> {
  const rows = await prisma.templateChangeRequest.findMany({ where: where as never, orderBy: { createdAt: "desc" } });
  const courseIds = Array.from(new Set<string>(rows.map((r: { courseId: string }) => r.courseId)));
  const userIds = Array.from(new Set<string>(rows.map((r: { requestedById: string }) => r.requestedById)));
  const [courses, users] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, code: true, title: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const cm = new Map<string, { code: string; title: string }>(courses.map((c: { id: string; code: string; title: string }) => [c.id, c]));
  const um = new Map<string, string>(users.map((u: { id: string; name: string }) => [u.id, u.name]));
  return rows.map((r: any) => ({
    id: r.id, courseCode: cm.get(r.courseId)?.code || "—", courseTitle: cm.get(r.courseId)?.title || "", termLabel: r.termLabel || "No semester set",
    reason: r.reason, requestedBy: um.get(r.requestedById) || "—", status: r.status, omcComment: r.omcComment,
    date: new Date(r.completedAt || r.createdAt).toISOString().slice(0, 10), changes: r.changesJson ? JSON.parse(r.changesJson) : [],
  }));
}
