import { prisma } from "./db";

// Course split: within a department, a course (by code) can be given to one Program Lead - the "handling lead".
// Common courses go to one lead; specialised courses stay with their own program's lead. No row = not decided,
// and every lead keeps working on his own program's copy exactly as before.

export const courseKey = (code: string) => code.trim().toLowerCase();

/** The keys that can name this course's owner, most specific first. A lab ("<CODE>-L") follows its theory course. */
export function ownerKeys(c: { code: string; courseType?: string | null }): string[] {
  const k = courseKey(c.code);
  return c.courseType === "Lab" && k.endsWith("-l") ? [k, k.slice(0, -2)] : [k];
}

async function deptOf(coordinatorId: string) {
  const u = await prisma.user.findUnique({ where: { id: coordinatorId }, select: { managedById: true, departmentId: true } });
  return u && u.managedById && u.departmentId ? { chairmanId: u.managedById, departmentId: u.departmentId } : null;
}

/** The handling lead of this course, or null when nobody has been named. */
export async function ownerOfCourse(c: { code: string; courseType?: string | null; coordinatorId: string }): Promise<string | null> {
  const d = await deptOf(c.coordinatorId);
  if (!d) return null;
  const keys = ownerKeys(c);
  const rows = await prisma.courseOwner.findMany({ where: { ...d, status: "ACCEPTED", courseKey: { in: keys } } });
  for (const k of keys) { const hit = rows.find((r) => r.courseKey === k); if (hit) return hit.ownerId; }
  return null;
}

export type Handling = { ok: true } | { ok: false; status: number; error: string };

/** May this Program Lead set up (Subject Expert, Lab Engineer...) this course? Own program's course unless another lead
 * handles it; another program's course only when he is its handling lead. */
export async function handlingAccess(userId: string, c: { code: string; courseType?: string | null; coordinatorId: string }): Promise<Handling> {
  const owner = await ownerOfCourse(c);
  if (!owner) return c.coordinatorId === userId ? { ok: true } : { ok: false, status: 404, error: "not found" };
  if (owner === userId) return { ok: true };
  if (c.coordinatorId !== userId) return { ok: false, status: 404, error: "not found" };
  const o = await prisma.user.findUnique({ where: { id: owner }, select: { name: true } });
  return { ok: false, status: 403, error: `${c.code} is handled by ${o?.name || "another Program Lead"} (set by the Chairman). Ask them, or ask the Chairman to change it.` };
}

/** Courses of OTHER leads' programs (also in other departments) that this lead handles. */
export async function ownedElsewhereCourseIds(user: { id: string; managedById: string | null; departmentId?: string | null }): Promise<string[]> {
  if (!user.managedById) return [];
  const mine = await prisma.courseOwner.findMany({ where: { chairmanId: user.managedById, ownerId: user.id, status: "ACCEPTED" } });
  if (mine.length === 0) return [];
  const myKeys = new Set(mine.map((m) => `${m.departmentId}|${m.courseKey}`));
  const all = await prisma.courseOwner.findMany({ where: { chairmanId: user.managedById, status: "ACCEPTED", departmentId: { in: Array.from(new Set(mine.map((m) => m.departmentId))) } } });
  const ownerBy = new Map(all.map((o) => [`${o.departmentId}|${o.courseKey}`, o.ownerId]));
  const codes = mine.flatMap((m) => [m.courseKey, `${m.courseKey}-l`]);
  const rows = await prisma.course.findMany({
    where: { coordinatorId: { not: user.id }, coordinator: { managedById: user.managedById, departmentId: { in: Array.from(new Set(mine.map((m) => m.departmentId))) } }, OR: codes.map((k) => ({ code: { equals: k, mode: "insensitive" as const } })) },
    select: { id: true, code: true, courseType: true, coordinator: { select: { departmentId: true } } },
  });
  return rows.filter((r) => {
    for (const k of ownerKeys(r)) { const dk = `${r.coordinator.departmentId}|${k}`; const o = ownerBy.get(dk); if (o) return o === user.id && myKeys.has(dk); }
    return false;
  }).map((r) => r.id);
}

/** Every named owner in this lead's department, by course key. */
export async function loadOwnerMap(user: { managedById: string | null; departmentId?: string | null }): Promise<Map<string, string>> {
  if (!user.managedById || !user.departmentId) return new Map();
  const rows = await prisma.courseOwner.findMany({ where: { chairmanId: user.managedById, departmentId: user.departmentId, status: "ACCEPTED" } });
  return new Map(rows.map((r) => [r.courseKey, r.ownerId]));
}

export function ownerFromMap(c: { code: string; courseType?: string | null }, map: Map<string, string>): string | null {
  for (const k of ownerKeys(c)) { const o = map.get(k); if (o) return o; }
  return null;
}
