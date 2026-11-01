import { randomUUID } from "crypto";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

// Settings held at a scope: INSTITUTE → DEPARTMENT → PROGRAM. A program's value beats its department's, which beats the
// institute's, which beats the built-in default. "Program" is the Program Lead (PROGRAM_COORDINATOR) who runs it.
// Rule (Adeel prompt §1, §15): the OMC sets the department default, the Program Lead sets his program's value (final).
// Table: prisma/migration_adeel_p1.sql. Before it is run every read falls back to the default.

const db = prisma as unknown as Record<string, any>;
export type Scope = "INSTITUTE" | "DEPARTMENT" | "PROGRAM";
export type ScopeUser = { id: string; role: string; managedById: string | null; departmentId?: string | null };
export type Chain = { chairmanId: string; departmentId: string | null; programId: string | null };

/** Where this person sits: their institute, department and program (their own Program Lead, or themselves). */
export async function chainFor(u: ScopeUser): Promise<Chain> {
  const chairmanId = await chairmanIdFor(u).catch(() => "");
  let programId: string | null = u.role === "PROGRAM_COORDINATOR" ? u.id : null;
  let departmentId = u.departmentId ?? null;
  if (!programId && u.managedById) {
    const m = await prisma.user.findUnique({ where: { id: u.managedById }, select: { id: true, role: true, departmentId: true } }).catch(() => null);
    if (m?.role === "PROGRAM_COORDINATOR") { programId = m.id; departmentId = departmentId || m.departmentId || null; }
  }
  if (departmentId == null) {
    const me = await prisma.user.findUnique({ where: { id: u.id }, select: { departmentId: true } }).catch(() => null);
    departmentId = me?.departmentId || null;
  }
  return { chairmanId, departmentId, programId };
}

type Row = { scopeType: string; scopeId: string; key: string; value: string; updatedById: string | null; updatedAt: Date };
async function rowsFor(c: Chain, key: string): Promise<Row[]> {
  if (!c.chairmanId) return [];
  const scopes = [{ scopeType: "INSTITUTE", scopeId: c.chairmanId }, ...(c.departmentId ? [{ scopeType: "DEPARTMENT", scopeId: c.departmentId }] : []), ...(c.programId ? [{ scopeType: "PROGRAM", scopeId: c.programId }] : [])];
  return ((await db.scopedSetting?.findMany({ where: { chairmanId: c.chairmanId, key, OR: scopes } }).catch(() => [])) || []) as Row[];
}

/** The value that applies along the chain (program > department > institute > default), and where it came from. */
export async function resolved(c: Chain, key: string, fallback: string) {
  const rows = await rowsFor(c, key);
  const by = (t: string) => rows.find((r) => r.scopeType === t);
  const hit = by("PROGRAM") || by("DEPARTMENT") || by("INSTITUTE");
  return { value: hit ? hit.value : fallback, from: (hit?.scopeType || "DEFAULT") as Scope | "DEFAULT", rows };
}
export async function numberSetting(c: Chain, key: string, fallback: number) {
  const v = Number((await resolved(c, key, String(fallback))).value);
  return Number.isFinite(v) ? v : fallback;
}

export async function saveSetting(chairmanId: string, scopeType: Scope, scopeId: string, key: string, value: string, byId: string) {
  if (!db.scopedSetting) throw new Error("Run prisma/migration_adeel_p1.sql in Supabase first.");
  const where = { chairmanId, scopeType, scopeId, key };
  const found = await db.scopedSetting.findFirst({ where });
  if (found) await db.scopedSetting.update({ where: { id: found.id }, data: { value, updatedById: byId, updatedAt: new Date() } });
  else await db.scopedSetting.create({ data: { id: randomUUID(), ...where, value, updatedById: byId } });
  await prisma.auditLog.create({ data: { actorUserId: byId, action: "SETTING_CHANGED", entityType: "ScopedSetting", entityId: key, metadata: { key, scopeType, scopeId, value } } }).catch(() => null);
}
export async function clearSetting(chairmanId: string, scopeType: Scope, scopeId: string, key: string) {
  await db.scopedSetting?.deleteMany({ where: { chairmanId, scopeType, scopeId, key } }).catch(() => null);
}
/** Every stored value of this institute, for the "Who decides what" page. */
export async function allStored(chairmanId: string): Promise<Row[]> {
  return ((await db.scopedSetting?.findMany({ where: { chairmanId } }).catch(() => [])) || []) as Row[];
}

// Per-person flags (What's new seen, digest choice, waiting items).
export async function getFlag(userId: string, key: string): Promise<string | null> {
  return ((await db.userFlag?.findUnique({ where: { userId_key: { userId, key } } }).catch(() => null)) as { value: string } | null)?.value ?? null;
}
export async function setFlag(userId: string, key: string, value: string | null) {
  if (!db.userFlag) throw new Error("Run prisma/migration_adeel_p1.sql in Supabase first.");
  if (value === null) { await db.userFlag.deleteMany({ where: { userId, key } }); return; }
  await db.userFlag.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, value }, update: { value, at: new Date() } });
}
export async function flagsLike(userId: string, prefix: string): Promise<{ key: string; value: string; at: Date }[]> {
  return ((await db.userFlag?.findMany({ where: { userId, key: { startsWith: prefix } } }).catch(() => [])) || []) as never;
}
