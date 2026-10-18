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
    const row = await mdb.instituteLicense.findUnique({ where: { chairmanId } });
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
