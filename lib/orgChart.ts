import { prisma } from "./db";

export const ORG_ROLES: { value: string; label: string; scope: "none" | "faculty" | "department" | "program" }[] = [
  { value: "NONE", label: "Title only (no system role)", scope: "none" },
  { value: "DEAN", label: "Dean", scope: "faculty" },
  { value: "HEAD_OF_DEPARTMENT", label: "Chairman / HoD", scope: "department" },
  { value: "DEPARTMENT_COORDINATOR", label: "Department Program Coordinator", scope: "department" },
  { value: "PROGRAM_LEAD", label: "Program Lead", scope: "program" },
  { value: "OMC", label: "OMC member", scope: "none" },
  { value: "COURSE_ASSIGNER", label: "Course Assigner", scope: "none" },
];
export const roleLabelOf = (r: string) => ORG_ROLES.find((x) => x.value === r)?.label || r;

export type Position = { id: string; parentId: string | null; title: string; role: string; facultyId: string | null; departmentId: string | null; program: string | null; holderId: string | null; covers: string[]; orderIndex: number };
const odb = prisma as unknown as Record<string, any>;

export async function loadChart(chairmanId: string) {
  let rows: (Omit<Position, "covers"> & { coversJson: string })[] = [], missing = false;
  try { rows = await odb.orgPosition.findMany({ where: { chairmanId }, orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] }); } catch { missing = true; }
  const positions: Position[] = rows.map(({ coversJson, ...p }) => { let covers: string[] = []; try { covers = JSON.parse(coversJson); } catch { covers = []; } return { ...p, covers }; });
  const [faculties, departments, programs, people] = await Promise.all([
    prisma.faculty.findMany({ where: { chairmanId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true, facultyId: true }, orderBy: { name: "asc" } }),
    prisma.degreeProgram.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { name: true, coordinator: { select: { departmentId: true } } } }),
    prisma.user.findMany({
      where: { isActive: true, isVisitingPlaceholder: false, OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] },
      select: { id: true, name: true, email: true, role: true, departmentId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const profs = await prisma.facultyProfile.findMany({ where: { userId: { in: people.map((p) => p.id) } }, select: { userId: true, designation: true, employmentType: true } });
  const prof = new Map(profs.map((p) => [p.userId, p]));
  const progs = Array.from(new Map(programs.map((p) => [p.name, { name: p.name, departmentId: p.coordinator.departmentId }])).values());
  return { missing, positions, faculties, departments, programs: progs, people: people.map((p) => ({ id: p.id, name: p.name, email: p.email, role: p.role, departmentId: p.departmentId, designation: prof.get(p.id)?.designation || null, employmentType: prof.get(p.id)?.employmentType || null })) };
}

/** Duties every institute needs covered; for each, who covers it now or a suggestion (the nearest position above). */
export function dutyCheck(chart: Awaited<ReturnType<typeof loadChart>>) {
  const { positions, departments, programs, faculties } = chart;
  const byId = new Map(positions.map((p) => [p.id, p]));
  const holds = (role: string, ok: (p: Position) => boolean) => positions.filter((p) => (p.role === role || p.covers.includes(role)) && ok(p));
  const above = (p: Position | undefined) => { let x = p?.parentId ? byId.get(p.parentId) : undefined; while (x && !x.holderId) x = x.parentId ? byId.get(x.parentId) : undefined; return x; };
  const root = positions.find((p) => !p.parentId);
  const out: { duty: string; scope: string; coveredBy: string | null; vacant: boolean; suggest: { positionId: string; role: string; title: string } | null }[] = [];
  for (const d of departments) {
    const hod = holds("HEAD_OF_DEPARTMENT", (p) => p.departmentId === d.id)[0];
    out.push({ duty: "Chairman / HoD", scope: d.name, coveredBy: hod ? hod.title : null, vacant: !!hod && !hod.holderId, suggest: hod ? null : root ? { positionId: root.id, role: "HEAD_OF_DEPARTMENT", title: root.title } : null });
    for (const pr of programs.filter((x) => x.departmentId === d.id)) {
      const pl = holds("PROGRAM_LEAD", (p) => p.program === pr.name)[0];
      const near = hod || root;
      out.push({ duty: "Program Lead", scope: pr.name, coveredBy: pl ? pl.title : null, vacant: !!pl && !pl.holderId, suggest: pl || !near ? null : { positionId: near.id, role: "PROGRAM_LEAD", title: near.title } });
    }
  }
  if (faculties.length) for (const f of faculties) {
    const dean = holds("DEAN", (p) => p.facultyId === f.id)[0];
    out.push({ duty: "Dean", scope: f.name, coveredBy: dean ? dean.title : null, vacant: !!dean && !dean.holderId, suggest: dean || !root ? null : { positionId: root.id, role: "DEAN", title: root.title } });
  }
  for (const [role, label] of [["OMC", "OMC member"], ["COURSE_ASSIGNER", "Course Assigner"]] as const) {
    const h = holds(role, () => true);
    const hod = positions.find((p) => p.role === "HEAD_OF_DEPARTMENT" && p.holderId);
    const sug = hod || root;
    out.push({ duty: label, scope: "Institute", coveredBy: h.length ? h.map((p) => p.title).join(", ") : null, vacant: h.length > 0 && h.every((p) => !p.holderId), suggest: h.length || !sug ? null : { positionId: sug.id, role, title: sug.title } });
  }
  void above;
  return out;
}
