import { prisma } from "./db";
import { writeAuditLog } from "./audit";

// How long an institute keeps data of inactive staff accounts and graduated students' detailed records (marks and
// attendance; transcripts are always kept). Default: keep everything. Nothing is removed automatically — the Super Admin
// sees exactly what would go and confirms it.

const db = prisma as unknown as Record<string, any>;
export type Retention = { inactiveUserMonths: number | null; graduatedDetailYears: number | null };

export async function getRetention(chairmanId: string): Promise<Retention> {
  const r = await db.privacySetting.findUnique({ where: { chairmanId } }).catch(() => null);
  return { inactiveUserMonths: r?.inactiveUserMonths ?? null, graduatedDetailYears: r?.graduatedDetailYears ?? null };
}
export async function setRetention(chairmanId: string, v: Retention, by: string) {
  const data = { inactiveUserMonths: v.inactiveUserMonths, graduatedDetailYears: v.graduatedDetailYears, updatedById: by, updatedAt: new Date() };
  await db.privacySetting.upsert({ where: { chairmanId }, create: { chairmanId, ...data }, update: data });
  await writeAuditLog({ actorUserId: by, action: "RETENTION_SET", entityType: "Institute", entityId: chairmanId, metadata: { ...v } as never });
}

/** What the current setting would remove now. */
export async function retentionPreview(chairmanId: string, v?: Retention) {
  const s = v || (await getRetention(chairmanId));
  const out = { users: [] as { id: string; role: string; lastSignIn: Date | null }[], students: 0, marks: 0, attendance: 0, studentIds: [] as string[] };
  if (s.inactiveUserMonths) {
    const cutoff = new Date(Date.now() - s.inactiveUserMonths * 30 * 864e5);
    const staff = await prisma.user.findMany({ where: { isActive: false, updatedAt: { lt: cutoff }, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }], NOT: { username: { startsWith: "removed-" } } }, select: { id: true, role: true } });
    const last = await prisma.session.groupBy({ by: ["userId"], where: { userId: { in: staff.map((u) => u.id).concat("none") } }, _max: { createdAt: true } });
    const lastOf = new Map(last.map((l) => [l.userId, l._max.createdAt]));
    out.users = staff.filter((u) => !lastOf.get(u.id) || lastOf.get(u.id)! < cutoff).map((u) => ({ id: u.id, role: u.role, lastSignIn: lastOf.get(u.id) || null }));
  }
  if (s.graduatedDetailYears) {
    const cutoff = new Date(Date.now() - s.graduatedDetailYears * 365 * 864e5);
    const studs = await prisma.student.findMany({ where: { status: "GRADUATED", statusDate: { lt: cutoff }, batch: { coordinator: { managedById: chairmanId } } }, select: { id: true } });
    out.studentIds = studs.map((x) => x.id);
    out.students = studs.length;
    if (studs.length) {
      out.marks = await prisma.studentMark.count({ where: { studentId: { in: out.studentIds } } });
      out.attendance = await prisma.attendanceRecord.count({ where: { studentId: { in: out.studentIds } } });
    }
  }
  return out;
}

/** Super Admin only, after seeing the preview: anonymise the inactive accounts and remove the graduated students' detailed records. */
export async function applyRetention(chairmanId: string, by: string) {
  const p = await retentionPreview(chairmanId);
  for (const u of p.users) {
    await prisma.user.update({ where: { id: u.id }, data: { name: "Former staff member", email: `removed-${u.id}@removed.invalid`, username: `removed-${u.id}`, isActive: false } });
    await db.facultyProfile.deleteMany({ where: { userId: u.id } }).catch(() => null);
    await db.staffDetail.deleteMany({ where: { userId: u.id } }).catch(() => null);
  }
  if (p.studentIds.length) {
    await prisma.studentMark.deleteMany({ where: { studentId: { in: p.studentIds } } });
    await prisma.attendanceRecord.deleteMany({ where: { studentId: { in: p.studentIds } } });
    await db.studentDetail.deleteMany({ where: { studentId: { in: p.studentIds } } }).catch(() => null);
  }
  await writeAuditLog({ actorUserId: by, action: "RETENTION_APPLIED", entityType: "Institute", entityId: chairmanId, metadata: { users: p.users.length, students: p.students, marks: p.marks, attendance: p.attendance } as never });
  return { users: p.users.length, students: p.students, marks: p.marks, attendance: p.attendance };
}
