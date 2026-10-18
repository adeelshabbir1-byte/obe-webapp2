import { prisma } from "./db";
import { MODULE_KEYS, moduleForPath, type ModuleKey } from "./modules";

// Which modules each institute has switched off. Stored per Institute Head (the institute's id throughout OBEHUB).
// No row = everything on, so institutes set up before licensing keep working as they did.

const mdb = prisma as unknown as Record<string, any>;
const TTL = 60_000;
const lockCache = new Map<string, { at: number; locked: Set<string> }>();
const instCache = new Map<string, { at: number; id: string }>();

export async function lockedModules(chairmanId: string | null | undefined): Promise<Set<string>> {
  if (!chairmanId) return new Set();
  const hit = lockCache.get(chairmanId);
  if (hit && Date.now() - hit.at < TTL) return hit.locked;
  let locked = new Set<string>();
  try {
    const row = await mdb.instituteLicense.findUnique({ where: { chairmanId }, select: { lockedJson: true } });
    if (row) { const xs = JSON.parse(row.lockedJson || "[]") as string[]; locked = new Set(xs.filter((k) => MODULE_KEYS.includes(k as ModuleKey))); }
  } catch { /* migration_modules.sql not run yet: nothing locked */ }
  lockCache.set(chairmanId, { at: Date.now(), locked });
  return locked;
}

export function forgetLocks(chairmanId?: string) { if (chairmanId) lockCache.delete(chairmanId); else lockCache.clear(); }

/** The institute (Institute Head id) a staff member belongs to, cached for a minute. */
export async function instituteOfUser(u: { id: string; role: string; managedById: string | null }): Promise<string | null> {
  if (u.role === "SUPER_USER") return null;
  if (u.role === "CHAIRMAN") return u.id;
  const hit = instCache.get(u.id);
  if (hit && Date.now() - hit.at < TTL * 5) return hit.id || null;
  let cur: { id: string; role: string; managedById: string | null } | null = u, id = "";
  for (let i = 0; i < 6 && cur; i++) {
    if (cur.role === "CHAIRMAN") { id = cur.id; break; }
    if (!cur.managedById) break;
    cur = (await prisma.user.findUnique({ where: { id: cur.managedById }, select: { id: true, role: true, managedById: true } })) as typeof cur;
  }
  instCache.set(u.id, { at: Date.now(), id });
  return id || null;
}

/** The institute a student belongs to: their batch's Program Lead's Institute Head. */
export async function instituteOfBatch(batchId: string): Promise<string | null> {
  const key = `b:${batchId}`;
  const hit = instCache.get(key);
  if (hit && Date.now() - hit.at < TTL * 5) return hit.id || null;
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinator: { select: { id: true, role: true, managedById: true } } } }).catch(() => null);
  const id = b?.coordinator ? (await instituteOfUser(b.coordinator as { id: string; role: string; managedById: string | null })) || "" : "";
  instCache.set(key, { at: Date.now(), id });
  return id || null;
}

/** If this path belongs to a module the institute has switched off, that module's key. */
export async function lockedModuleForPath(chairmanId: string | null, path: string): Promise<string | null> {
  if (!chairmanId || !path) return null;
  const m = moduleForPath(path);
  if (!m) return null;
  return (await lockedModules(chairmanId)).has(m.key) ? m.key : null;
}

export async function isModuleOn(chairmanId: string | null | undefined, key: ModuleKey) {
  return !(await lockedModules(chairmanId)).has(key);
}

/* ---------------- Licensed programs ---------------- */

const normProg = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The degree programs the institute is licensed for (empty = any program). */
export async function licensedPrograms(chairmanId: string | null | undefined): Promise<string[]> {
  if (!chairmanId) return [];
  try {
    const row = await mdb.instituteLicense.findUnique({ where: { chairmanId }, select: { programsJson: true } });
    const xs = JSON.parse(row?.programsJson || "[]");
    return Array.isArray(xs) ? xs.map(String).filter(Boolean) : [];
  } catch { return []; } // column not added yet: no program limit
}

/** null when the program may be used; otherwise the message to show. */
export async function programNotLicensed(chairmanId: string | null | undefined, program: string): Promise<string | null> {
  const list = await licensedPrograms(chairmanId);
  if (!list.length || !program) return null;
  if (list.some((p) => normProg(p) === normProg(program))) return null;
  return `Your institution is licensed for ${list.join(", ")} only. "${program}" is not part of the licence; contact the OBEHUB team to add it. New batches of a licensed program can be added freely.`;
}
