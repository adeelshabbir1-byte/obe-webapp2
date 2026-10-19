import { randomBytes, randomUUID } from "crypto";
import { prisma } from "./db";

// A read-only link for a student's parent or guardian: attendance, marks so far, results and fees. Made by the student
// or the advisor, sent by WhatsApp to the guardian's number; it can be turned off at any time.
const pdb = prisma as unknown as Record<string, any>;
export async function parentLink(studentId: string, by: string) {
  const ex = await pdb.parentLink.findFirst({ where: { studentId, revokedAt: null } });
  if (ex) return ex.token as string;
  const token = randomBytes(18).toString("base64url");
  await pdb.parentLink.create({ data: { id: randomUUID(), studentId, token, createdById: by, createdAt: new Date() } });
  return token;
}
export async function studentOfParentToken(token: string): Promise<string | null> {
  try { const r = await pdb.parentLink.findUnique({ where: { token } }); return r && !r.revokedAt ? r.studentId : null; } catch { return null; }
}
export async function revokeParentLinks(studentId: string) { await pdb.parentLink.updateMany({ where: { studentId, revokedAt: null }, data: { revokedAt: new Date() } }); }
