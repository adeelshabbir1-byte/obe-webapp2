import { prisma } from "./db";
import { ROLE_TEXT } from "./institutePeople";

export type Recipient = { id: string; name: string; roleLabel: string };

/** Who an accreditation gap of one program can be sent to: its Program Lead, the department's Chairman, the faculty's Dean and the Program Lead's team. */
export async function requestRecipients(chairmanId: string, lead: { id: string; name: string; departmentId: string | null }): Promise<Recipient[]> {
  const dept = lead.departmentId ? await prisma.department.findUnique({ where: { id: lead.departmentId }, select: { facultyId: true } }) : null;
  const [hods, deans, team] = await Promise.all([
    lead.departmentId ? prisma.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT", managedById: chairmanId, departmentId: lead.departmentId, isActive: true }, select: { id: true, name: true, role: true } }) : Promise.resolve([]),
    dept?.facultyId ? prisma.user.findMany({ where: { role: "DEAN", managedById: chairmanId, facultyId: dept.facultyId, isActive: true }, select: { id: true, name: true, role: true } }) : Promise.resolve([]),
    prisma.user.findMany({ where: { managedById: lead.id, isActive: true, isVisitingPlaceholder: false, role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER"] as never } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);
  const out: Recipient[] = [{ id: lead.id, name: lead.name, roleLabel: "Program Lead" }];
  for (const u of [...hods, ...deans, ...team]) out.push({ id: u.id as string, name: u.name as string, roleLabel: ROLE_TEXT[u.role as string] || String(u.role) });
  return out;
}
