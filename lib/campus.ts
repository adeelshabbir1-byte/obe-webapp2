import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

// Multi-campus: one university, several campuses. Curriculum, rules and committees are shared; batches (and so their
// students, courses and timetables), rooms and staff each belong to a campus (CampusLink; no link = main campus).
// A campus filter (cookie "campus") narrows the student lists, results and reports that use visibleBatchIds.

const cdb = prisma as unknown as Record<string, any>;
export const CAMPUS_HINT = "Campuses need prisma/migration_batch5.sql — run it in Supabase.";
export const MAIN = "main";
export type Campus = { id: string; name: string; city: string | null; code: string | null };

export async function campusesOf(cid: string): Promise<Campus[] | null> {
  return (await cdb.campus.findMany({ where: { chairmanId: cid }, orderBy: { name: "asc" } }).catch(() => null)) as Campus[] | null;
}
export async function addCampus(cid: string, name: string, city: string, code: string) {
  if (!name.trim()) throw new Error("Name the campus.");
  await cdb.campus.create({ data: { id: randomUUID(), chairmanId: cid, name: name.trim().slice(0, 120), city: city.trim().slice(0, 80) || null, code: code.trim().toUpperCase().slice(0, 12) || null } });
}
export async function linksOf(kind: "BATCH" | "ROOM" | "USER", ids: string[]) {
  const rows = (await cdb.campusLink.findMany({ where: { kind, refId: { in: ids.concat("none") } } }).catch(() => [])) as { refId: string; campusId: string }[];
  return new Map(rows.map((r) => [r.refId, r.campusId]));
}
export async function setCampus(cid: string, kind: "BATCH" | "ROOM" | "USER", ids: string[], campusId: string) {
  if (campusId !== MAIN && !(await cdb.campus.findFirst({ where: { id: campusId, chairmanId: cid } }))) throw new Error("Unknown campus.");
  for (const refId of ids) {
    if (campusId === MAIN) await cdb.campusLink.deleteMany({ where: { kind, refId } });
    else await cdb.campusLink.upsert({ where: { kind_refId: { kind, refId } }, create: { kind, refId, campusId }, update: { campusId } });
  }
}

/** The campus chosen in the filter (null = all campuses). */
export function chosenCampus(): string | null {
  try { return cookies().get("campus")?.value || null; } catch { return null; }
}
/** Keep only batches of the chosen campus (all when no campus is chosen or campuses are not set up). */
export async function filterBatchesByCampus(batchIds: string[]): Promise<string[]> {
  const c = chosenCampus();
  if (!c) return batchIds;
  const m = await linksOf("BATCH", batchIds);
  return batchIds.filter((id) => (m.get(id) || MAIN) === c);
}

/** Figures per campus: batches, active students, offered courses, rooms, staff. */
export async function campusSummary(cid: string) {
  const cs = (await campusesOf(cid)) || [];
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: cid } }, select: { id: true, _count: { select: { students: true } } } });
  const rooms = await prisma.room.findMany({ where: { chairmanId: cid }, select: { id: true } });
  const staff = await prisma.user.findMany({ where: { isActive: true, OR: [{ managedById: cid }, { managedBy: { managedById: cid } }] }, select: { id: true } });
  const [bl, rl, ul] = await Promise.all([linksOf("BATCH", batches.map((b) => b.id)), linksOf("ROOM", rooms.map((r) => r.id)), linksOf("USER", staff.map((u) => u.id))]);
  const offered = await prisma.course.groupBy({ by: ["batchId"], where: { batchId: { in: batches.map((b) => b.id).concat("none") }, isOffered: true }, _count: { _all: true } });
  const off = new Map(offered.map((o) => [o.batchId, o._count._all]));
  const all = [{ id: MAIN, name: "Main campus", city: null, code: null } as Campus, ...cs];
  return all.map((c) => {
    const bs = batches.filter((b) => (bl.get(b.id) || MAIN) === c.id);
    return { ...c, batches: bs.length, students: bs.reduce((a, b) => a + b._count.students, 0), offered: bs.reduce((a, b) => a + (off.get(b.id) || 0), 0), rooms: rooms.filter((r) => (rl.get(r.id) || MAIN) === c.id).length, staff: staff.filter((u) => (ul.get(u.id) || MAIN) === c.id).length };
  });
}

/** Rooms on the campuses of these batches (no campus set up = all rooms). */
export async function campusRooms<T extends { id: string }>(rooms: T[], batchIds: string[]): Promise<T[]> {
  const bl = await linksOf("BATCH", batchIds);
  const rl = await linksOf("ROOM", rooms.map((r) => r.id));
  if (!bl.size && !rl.size) return rooms;
  const want = new Set(batchIds.map((b) => bl.get(b) || MAIN));
  return rooms.filter((r) => want.has(rl.get(r.id) || MAIN));
}
