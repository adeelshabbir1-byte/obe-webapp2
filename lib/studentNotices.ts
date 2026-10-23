import { randomUUID } from "crypto";
import { prisma } from "./db";

// In-app notices for students: the bell in the student portal. Creating one never throws — a missing table must never
// block the action that caused it. Any module can tell students something with notifyStudents().

const ndb = prisma as unknown as Record<string, any>;
export type StudentNoticeRow = { id: string; kind: string; title: string; body: string | null; href: string | null; readAt: Date | null; createdAt: Date };

export async function notifyStudents(studentIds: (string | null | undefined)[], n: { kind: string; title: string; body?: string; href?: string }, chairmanId?: string | null) {
  const ids = Array.from(new Set(studentIds.filter((x): x is string => !!x)));
  if (!ids.length) return;
  try { await ndb.studentNotice.createMany({ data: ids.map((studentId) => ({ id: randomUUID(), studentId, kind: n.kind, title: n.title.slice(0, 300), body: n.body?.slice(0, 2000) || null, href: n.href || null })) }); } catch { return; }
  // SMS / WhatsApp too, when the institute has a gateway and this kind of alert turned on.
  if (chairmanId) { try { const m = await import("./messaging"); await Promise.race([m.alertStudents(chairmanId, ids, n.kind, n.title, n.body), new Promise((r) => setTimeout(r, 4000))]); } catch { /* best effort */ } }
}
export async function noticesFor(studentId: string, take = 30): Promise<StudentNoticeRow[]> {
  try { return (await ndb.studentNotice.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take })) as StudentNoticeRow[]; } catch { return []; }
}
export async function unreadNotices(studentId: string): Promise<number> {
  try { return await ndb.studentNotice.count({ where: { studentId, readAt: null } }); } catch { return 0; }
}
export async function markNoticesRead(studentId: string, id?: string) {
  try { await ndb.studentNotice.updateMany({ where: { studentId, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } }); } catch { /* table missing */ }
}
