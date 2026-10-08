import { prisma } from "./db";
import { courseKey } from "./courseOwners";

export type SplitLead = { id: string; name: string; program: string | null; departmentId: string | null; departmentName: string };
export type SplitRow = {
  key: string; code: string; title: string; semester: number | null;
  leads: { id: string; name: string; programs: string[] }[];
  ownerId: string | null; ownerStatus: "ACCEPTED" | "PENDING" | null; shared: boolean;
};
export type Incoming = { id: string; code: string; title: string; fromDepartment: string; ownerName: string };
export type SplitData = { leads: SplitLead[]; rows: SplitRow[]; incoming: Incoming[]; departmentName: string };

/** Every course of the department grouped by code, with the leads whose programs run it and who handles it.
 * Any Program Lead of the institute can be picked (another department can take a course); `incomingDepartmentId` null = all requests. */
export async function loadSplit(chairmanId: string, departmentId: string, incomingDepartmentId: string | null = departmentId): Promise<SplitData> {
  const [leads, courses, owners, depts, pending] = await Promise.all([
    prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, isActive: true, departmentId: { not: null } }, select: { id: true, name: true, leadProgram: true, departmentId: true }, orderBy: { name: "asc" } }),
    prisma.course.findMany({
      where: { courseType: { not: "Lab" }, coordinator: { managedById: chairmanId, departmentId } },
      select: { code: true, title: true, semesterNumber: true, coordinatorId: true, coordinator: { select: { name: true } }, batch: { select: { degreeProgram: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.courseOwner.findMany({ where: { chairmanId, departmentId } }),
    prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true } }),
    prisma.courseOwner.findMany({ where: { chairmanId, status: "PENDING", ...(incomingDepartmentId ? { ownerDepartmentId: incomingDepartmentId } : {}) } }),
  ]);
  const deptName = new Map<string, string>(depts.map((d) => [d.id, d.name]));
  const nameOf = new Map<string, string>(leads.map((l) => [l.id, l.name]));
  const ownerBy = new Map(owners.map((o) => [o.courseKey, o]));
  const groups = new Map<string, SplitRow>();
  for (const c of courses) {
    const key = courseKey(c.code);
    const o = ownerBy.get(key);
    const g: SplitRow = groups.get(key) || { key, code: c.code, title: c.title, semester: c.semesterNumber, leads: [], ownerId: o?.ownerId || null, ownerStatus: (o?.status as "ACCEPTED" | "PENDING" | undefined) || null, shared: false };
    let lead = g.leads.find((l) => l.id === c.coordinatorId);
    if (!lead) { lead = { id: c.coordinatorId, name: c.coordinator.name, programs: [] }; g.leads.push(lead); }
    const prog = c.batch?.degreeProgram;
    if (prog && !lead.programs.includes(prog)) lead.programs.push(prog);
    groups.set(key, g);
  }
  const rows = Array.from(groups.values()).map((g) => ({ ...g, shared: g.leads.length >= 2 }));
  rows.sort((a, b) => Number(b.shared) - Number(a.shared) || a.code.localeCompare(b.code));

  const incoming: Incoming[] = [];
  for (const p of pending) {
    const c = await prisma.course.findFirst({ where: { code: { equals: p.courseKey, mode: "insensitive" }, coordinator: { managedById: chairmanId, departmentId: p.departmentId } }, select: { code: true, title: true } });
    incoming.push({ id: p.id, code: c?.code || p.courseKey, title: c?.title || "", fromDepartment: deptName.get(p.departmentId) || "another department", ownerName: nameOf.get(p.ownerId) || "a Program Lead" });
  }
  return {
    leads: leads.map((l) => ({ id: l.id, name: l.name, program: l.leadProgram || null, departmentId: l.departmentId, departmentName: l.departmentId ? deptName.get(l.departmentId) || "" : "" })),
    rows, incoming, departmentName: deptName.get(departmentId) || "",
  };
}
