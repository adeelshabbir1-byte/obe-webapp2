import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

// The IT Manager: a duty (hat) the Institute Head gives to one staff member. They run backups, see the subscription and
// invoices, and keep the institute's systems linked (Moodle, SMS / WhatsApp) and staff passwords reset. The Institute
// Head sees these read-only; until an IT Manager is named the Institute Head can still act.
export const IT_MANAGER = "IT_MANAGER";
type U = { id: string; role: string; managedById?: string | null; extraRoles?: string[] | null };

export async function itManagerOf(chairmanId: string) {
  return prisma.user.findFirst({ where: { isActive: true, extraRoles: { has: IT_MANAGER }, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true, name: true } });
}
/** The institute whose IT this person may see, and whether they may act (null = no access). */
export async function itAccess(u: U): Promise<{ chairmanId: string; canAct: boolean; manager: { id: string; name: string } | null } | null> {
  if ((u.extraRoles || []).includes(IT_MANAGER)) {
    const cid = u.role === "CHAIRMAN" ? u.id : await chairmanIdFor(u as never).catch(() => null);
    return cid ? { chairmanId: cid, canAct: true, manager: { id: u.id, name: "you" } } : null;
  }
  if (u.role === "CHAIRMAN") { const m = await itManagerOf(u.id); return { chairmanId: u.id, canAct: !m, manager: m }; }
  return null;
}
