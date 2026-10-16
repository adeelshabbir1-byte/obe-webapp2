import { prisma } from "../db";
import { CATALOGUE } from "./catalogue";

// The temporary data-entry rights an accreditation task gives its assignee: only the NBEAC registers and profile sections
// that task names, only in that program's department, and only while the assignment is open (not yet signed off,
// approved or revoked, and before its access ends).

export type Grants = { kinds: { kind: string; departmentId: string }[]; sections: { section: string; departmentId: string }[] };
export const NO_GRANTS: Grants = { kinds: [], sections: [] };

export async function activeGrants(userId: string): Promise<Grants> {
  const tasks = await prisma.accreditationTask.findMany({
    where: { assigneeId: userId, status: { in: ["ASSIGNED", "RETURNED"] }, OR: [{ accessUntil: null }, { accessUntil: { gt: new Date() } }] },
    select: { code: true, cycleId: true },
  }).catch(() => []);
  if (!tasks.length) return NO_GRANTS;
  const cycles = await prisma.accreditationCycle.findMany({ where: { id: { in: tasks.map((t) => t.cycleId) }, status: "OPEN", body: "NBEAC", departmentId: { not: null } }, select: { id: true, departmentId: true } });
  const deptOf = new Map(cycles.map((c) => [c.id, c.departmentId as string]));
  const g: Grants = { kinds: [], sections: [] };
  for (const t of tasks) {
    const dept = deptOf.get(t.cycleId);
    const def = dept ? CATALOGUE.NBEAC.tasks.find((d) => d.code === t.code) : null;
    if (!def || !dept) continue;
    for (const kind of def.sarKinds || []) g.kinds.push({ kind, departmentId: dept });
    for (const section of def.sarSections || []) g.sections.push({ section, departmentId: dept });
  }
  return g;
}
