import { prisma } from "./db";
import { courseKey } from "./courseOwners";

export type SplitRow = {
  key: string; code: string; title: string; semester: number | null;
  leads: { id: string; name: string; programs: string[] }[];
  ownerId: string | null; shared: boolean;
};
export type SplitData = { leads: { id: string; name: string; program: string | null }[]; rows: SplitRow[] };

/** Every course of the department grouped by code, with the leads whose programs run it and who handles it. */
export async function loadSplit(chairmanId: string, departmentId: string): Promise<SplitData> {
  const [leads, courses, owners] = await Promise.all([
    prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, departmentId, isActive: true }, select: { id: true, name: true, leadProgram: true }, orderBy: { name: "asc" } }),
    prisma.course.findMany({
      where: { courseType: { not: "Lab" }, coordinator: { managedById: chairmanId, departmentId } },
      select: { code: true, title: true, semesterNumber: true, coordinatorId: true, coordinator: { select: { name: true } }, batch: { select: { degreeProgram: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.courseOwner.findMany({ where: { chairmanId, departmentId } }),
  ]);
  const ownerBy = new Map(owners.map((o) => [o.courseKey, o.ownerId]));
  const groups = new Map<string, SplitRow>();
  for (const c of courses) {
    const key = courseKey(c.code);
    const g = groups.get(key) || { key, code: c.code, title: c.title, semester: c.semesterNumber, leads: [], ownerId: ownerBy.get(key) || null, shared: false };
    let lead = g.leads.find((l) => l.id === c.coordinatorId);
    if (!lead) { lead = { id: c.coordinatorId, name: c.coordinator.name, programs: [] }; g.leads.push(lead); }
    const prog = c.batch?.degreeProgram;
    if (prog && !lead.programs.includes(prog)) lead.programs.push(prog);
    groups.set(key, g);
  }
  const rows = Array.from(groups.values()).map((g) => ({ ...g, shared: g.leads.length >= 2 }));
  rows.sort((a, b) => Number(b.shared) - Number(a.shared) || a.code.localeCompare(b.code));
  return { leads: leads.map((l) => ({ id: l.id, name: l.name, program: l.leadProgram || null })), rows };
}
