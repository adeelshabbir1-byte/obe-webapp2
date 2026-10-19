import { randomBytes, randomUUID } from "crypto";
import { prisma } from "./db";

// Read-only access for a visiting accreditation panel: a link that expires, for one visit cycle. It opens the SAR, the
// evidence dossier and the program's course results — nothing can be changed, and every download is logged.
const vdb = prisma as unknown as Record<string, any>;
export async function createPass(cycleId: string, days: number, by: string, label: string) {
  const token = randomBytes(20).toString("base64url");
  await vdb.visitorPass.create({ data: { id: randomUUID(), cycleId, token, label, expiresAt: new Date(Date.now() + days * 86400000), createdById: by, createdAt: new Date() } });
  return token;
}
export async function passByToken(token: string) {
  try {
    const p = await vdb.visitorPass.findUnique({ where: { token } });
    if (!p || p.revokedAt || new Date(p.expiresAt) < new Date()) return null;
    return p as { id: string; cycleId: string; label: string; expiresAt: Date };
  } catch { return null; }
}
export async function passesOf(cycleId: string) {
  try { return (await vdb.visitorPass.findMany({ where: { cycleId, revokedAt: null }, orderBy: { createdAt: "desc" } })) as { id: string; label: string; expiresAt: Date; token: string }[]; } catch { return []; }
}
export async function revokePass(id: string) { await vdb.visitorPass.update({ where: { id }, data: { revokedAt: new Date() } }); }
