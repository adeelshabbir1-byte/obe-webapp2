import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { departmentsOf } from "./fyp";
import { KINDS, SECTIONS, VIEW_ROLES, type AreaKey, type KindDef, type SectionDef } from "./sarRegistry";
import { activeGrants } from "./accreditation/grants";

// Who sees and keeps which accreditation data. The Institute Head sees the whole institute; a Dean the departments of
// their faculty; a department's Chairman, coordinators and Program Leads their own department; the finance, facilities,
// student-affairs and library offices the whole institute for their own kinds. Faculty keep their own consultancy,
// executive education, outside engagement, funded projects and research-impact records. Someone assigned an NBEAC
// accreditation task may, while it is open, keep the registers and sections that task names in its department.

type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null; name?: string };
const INSTITUTE_WIDE = ["CHAIRMAN", "FINANCE_OFFICER", "FACILITIES_MANAGER", "STUDENT_AFFAIRS", "LIBRARIAN"];

export async function sarScope(user: Who) {
  const chairmanId = await chairmanIdFor(user);
  const all = await prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true, facultyId: true }, orderBy: { name: "asc" } });
  let departments: { id: string; name: string }[];
  if (INSTITUTE_WIDE.includes(user.role)) departments = all;
  else if (user.role === "DEAN") departments = all.filter((d) => d.facultyId && d.facultyId === user.facultyId);
  else {
    const mine = new Set(await departmentsOf(user.id));
    departments = all.filter((d) => mine.has(d.id));
  }
  const instituteWide = INSTITUTE_WIDE.includes(user.role);
  const grants = await activeGrants(user.id);
  for (const g of [...grants.kinds, ...grants.sections]) {
    const d = all.find((x) => x.id === g.departmentId);
    if (d && !departments.some((x) => x.id === d.id)) departments = [...departments, d];
  }
  const deptIds = new Set(departments.map((d) => d.id));
  const grantedDepts = (k: KindDef) => grants.kinds.filter((g) => g.kind === k.kind).map((g) => g.departmentId);
  return {
    chairmanId, departments: departments.map((d) => ({ id: d.id, name: d.name })), instituteWide,
    /** May this person see records of this department (null = institute-wide records)? */
    seesDept: (departmentId: string | null) => departmentId === null || instituteWide || deptIds.has(departmentId),
    canEditKind: (k: KindDef) => k.editors.includes(user.role),
    /** Departments where an open accreditation task lets this person keep records of this kind. */
    grantedKindDepts: grantedDepts,
    canSelfServe: (k: KindDef) => !!k.selfService?.includes(user.role),
    canViewKind: (k: KindDef) => k.editors.includes(user.role) || !!k.selfService?.includes(user.role) || (!k.confidential && VIEW_ROLES.includes(user.role)) || grantedDepts(k).length > 0,
    canEditSection: (s: SectionDef, scopeKey: string) =>
      (s.editors.includes(user.role) && (s.scope === "HEI" ? scopeKey === "HEI" : scopeKey !== "HEI" && (instituteWide || deptIds.has(scopeKey))))
      || grants.sections.some((g) => g.section === s.key && g.departmentId === scopeKey),
    canViewSection: (s: SectionDef, scopeKey: string) =>
      ((VIEW_ROLES.includes(user.role) || s.editors.includes(user.role)) && (s.scope === "HEI" || instituteWide || deptIds.has(scopeKey)))
      || grants.sections.some((g) => g.section === s.key && g.departmentId === scopeKey),
  };
}
export type SarScope = Awaited<ReturnType<typeof sarScope>>;

/** Areas this person has something to see in. */
export function areasFor(scope: SarScope): AreaKey[] {
  const keys = new Set<AreaKey>();
  for (const k of KINDS) if (scope.canViewKind(k)) keys.add(k.area);
  for (const s of SECTIONS) if (scope.canViewSection(s, s.scope === "HEI" ? "HEI" : scope.departments[0]?.id || "none")) keys.add(s.area);
  return Array.from(keys);
}

/** The profile document of a scope ("HEI" or a department id). */
export async function loadProfile(chairmanId: string, scopeKey: string): Promise<Record<string, Record<string, unknown>>> {
  const row = await prisma.sarProfile.findUnique({ where: { chairmanId_scopeKey: { chairmanId, scopeKey } } });
  try { return row ? JSON.parse(row.dataJson) : {}; } catch { return {}; }
}

/** Records of the given kinds that this person may see, for one department (plus institute-wide ones) or all of theirs. */
export async function loadRecords(user: Who, scope: SarScope, kinds: string[], departmentId: string | "ALL") {
  const visibleKinds = kinds.filter((k) => { const d = KINDS.find((x) => x.kind === k); return d && scope.canViewKind(d); });
  if (!visibleKinds.length) return [];
  const deptFilter = departmentId === "ALL"
    ? (scope.instituteWide ? {} : { OR: [{ departmentId: null }, { departmentId: { in: scope.departments.map((d) => d.id).concat(["none"]) } }] })
    : { OR: [{ departmentId: null }, { departmentId }] };
  const rows = await prisma.accreditationRecord.findMany({
    where: { chairmanId: scope.chairmanId, kind: { in: visibleKinds }, ...deptFilter },
    select: { id: true, kind: true, departmentId: true, title: true, recordDate: true, year: true, dataJson: true, fileName: true, mimeType: true, createdById: true, updatedAt: true },
    orderBy: [{ recordDate: "desc" }, { year: "desc" }, { updatedAt: "desc" }],
  });
  // Someone who only keeps their own records (faculty) sees their own.
  return rows.filter((r) => {
    const d = KINDS.find((x) => x.kind === r.kind)!;
    return scope.canEditKind(d) || (!d.confidential && VIEW_ROLES.includes(user.role)) || r.createdById === user.id || (!!r.departmentId && scope.grantedKindDepts(d).includes(r.departmentId));
  }).map((r) => ({ ...r, data: (() => { try { return JSON.parse(r.dataJson) as Record<string, unknown>; } catch { return {}; } })() }));
}
export type RecordRow = Awaited<ReturnType<typeof loadRecords>>[number];
