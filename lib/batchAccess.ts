import { prisma } from "./db";
import { omcOfBatch, isMember } from "./omcMembers";

// Who may look at a batch's set-up, comparison and OMC record: its Program Lead, the department's OMC, and the
// institute's leadership (Institute Head, Dean, HOD). Only the Program Lead changes the set-up.
export async function batchAccess(user: { id: string; role: string; managedById: string | null; realUserId?: string }, batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, coordinatorId: true, degreeProgram: true, batchName: true, coordinator: { select: { managedById: true, departmentId: true } } } });
  if (!b) return null;
  const chairmanId = b.coordinator.managedById || "";
  const isLead = b.coordinatorId === user.id;
  const omc = await omcOfBatch(batchId);
  const member = !!omc && isMember(omc, user.realUserId || user.id);
  const sameInstitute = user.role === "CHAIRMAN" ? user.id === chairmanId : user.managedById === chairmanId;
  const lead = sameInstitute && ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC"].includes(user.role);
  if (!isLead && !member && !lead) return null;
  return { batch: b, chairmanId, isLead, member, convener: !!omc && omc.convenerId === (user.realUserId || user.id), omc };
}
