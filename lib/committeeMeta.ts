import { allStored, saveSetting } from "./scopedSettings";

// Extra facts about a committee kept beside the engine (UX review): each member's role in the committee and term, the
// Secretary (named by the Dean / Institute Head; he manages members like the Convener), the committee's own
// composition rule (entered by the university — never invented here) and the history of replacements.
export const CMT_ROLES = ["Convener", "Secretary", "Member", "External expert", "Student member", "Ex-officio member"];
export type Meta = { secretaryId?: string; secretaryName?: string; roles: Record<string, { role: string; from?: string; until?: string }>; rules: { role: string; min: number }[]; history: { at: string; by: string; out?: string; in?: string; note?: string }[] };
const EMPTY: Meta = { roles: {}, rules: [], history: [] };
export async function metaOf(chairmanId: string, committeeId: string): Promise<Meta> {
  const v = (await allStored(chairmanId).catch(() => [])).find((r) => r.key === `cmt.meta.${committeeId}` && r.scopeType === "INSTITUTE")?.value;
  try { return v ? { ...EMPTY, ...(JSON.parse(v) as Meta) } : { ...EMPTY }; } catch { return { ...EMPTY }; }
}
export async function saveMeta(chairmanId: string, committeeId: string, m: Meta, byId: string) {
  await saveSetting(chairmanId, "INSTITUTE", chairmanId, `cmt.meta.${committeeId}`, JSON.stringify({ ...m, history: m.history.slice(-200) }), byId);
}
/** Composition check against the committee's own rule: each role's count vs its minimum. Pure. */
export function composition(m: Meta, members: { id: string; external: boolean; userId: string | null }[], convenerId: string | null) {
  const roleOf = (x: { id: string; external: boolean; userId: string | null }) => m.roles[x.id]?.role || (x.userId && x.userId === convenerId ? "Convener" : x.userId && x.userId === m.secretaryId ? "Secretary" : x.external ? "External expert" : "Member");
  const counts = new Map<string, number>(); for (const x of members) counts.set(roleOf(x), (counts.get(roleOf(x)) || 0) + 1);
  return { roleOf, rows: m.rules.map((r) => ({ ...r, have: counts.get(r.role) || 0, ok: (counts.get(r.role) || 0) >= r.min })), counts };
}
/** Members whose term ends within `days` (for reminders). Pure. */
export function endingSoon(m: Meta, days: number, now = new Date()) {
  return Object.entries(m.roles).filter(([, r]) => r.until && new Date(r.until).getTime() - now.getTime() <= days * 864e5 && new Date(r.until).getTime() >= now.getTime() - 864e5).map(([id, r]) => ({ memberId: id, until: r.until! }));
}
