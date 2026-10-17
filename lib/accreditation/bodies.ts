import { prisma } from "../db";
import { NCEAC_DEFAULTS, type ReadinessStandards } from "../readiness";

// Which accreditation council governs each program, and the thresholds the institute applies to that council's programs.
//
// Every program is bound to exactly one council (DepartmentProgram.accreditationBody). Until the Institute Head confirms
// it, the council is inferred from the program's name — computing programs to NCEAC, business and management to NBEAC,
// everything else to HEC's general framework — and the screens say it is only inferred.

import { BODY_KEYS, BODIES, inferBody, isBody, type BodyKey } from "./bodyInfer";
export { BODY_KEYS, BODIES, inferBody, isBody, type BodyKey };

export type ProgramBinding = { program: string; departmentId: string | null; body: BodyKey; explicit: boolean };

/** Every program of the institute (the Institute Head's register, plus any a Program Lead runs) with its council. */
export async function programBindings(chairmanId: string): Promise<ProgramBinding[]> {
  const [rows, leads] = await Promise.all([
    prisma.departmentProgram.findMany({ where: { chairmanId }, select: { degreeProgram: true, departmentId: true, accreditationBody: true } }),
    prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, leadProgram: { not: null } }, select: { leadProgram: true, departmentId: true } }),
  ]);
  const out = new Map<string, ProgramBinding>();
  for (const r of rows) out.set(r.degreeProgram, { program: r.degreeProgram, departmentId: r.departmentId, body: isBody(r.accreditationBody) ? r.accreditationBody : inferBody(r.degreeProgram), explicit: isBody(r.accreditationBody) });
  for (const l of leads) if (l.leadProgram && !out.has(l.leadProgram)) out.set(l.leadProgram, { program: l.leadProgram, departmentId: l.departmentId, body: inferBody(l.leadProgram), explicit: false });
  return Array.from(out.values()).sort((a, b) => a.program.localeCompare(b.program));
}

export async function bodyOfProgram(chairmanId: string | null | undefined, program: string | null | undefined): Promise<{ body: BodyKey; explicit: boolean }> {
  if (!program) return { body: "HEC", explicit: false };
  const row = chairmanId ? await prisma.departmentProgram.findUnique({ where: { chairmanId_degreeProgram: { chairmanId, degreeProgram: program } }, select: { accreditationBody: true } }).catch(() => null) : null;
  return isBody(row?.accreditationBody) ? { body: row!.accreditationBody as BodyKey, explicit: true } : { body: inferBody(program), explicit: false };
}

/** The council whose pages a Program Lead's program sees; a lead with no program named yet keeps NCEAC's, as before. */
export async function leadCouncil(chairmanId: string | null | undefined, program: string | null | undefined): Promise<{ body: BodyKey; explicit: boolean }> {
  return program ? bodyOfProgram(chairmanId, program) : { body: "NCEAC", explicit: false };
}

/** The council of a Program Lead's program. */
export async function bodyOfLead(lead: { leadProgram: string | null; managedById: string | null }) {
  return bodyOfProgram(lead.managedById, lead.leadProgram);
}

// ---------------------------------------------------------------------------------------------------- standards

export type Standards = ReadinessStandards & { maxStudentFacultyRatio: number | null; ploTargetPct: number; cloPassPct: number | null; ploPassPct: number | null };
export type StandardKey = keyof Standards;

// Starting points only: an institute replaces them with the figures in its council's current manual. NCEAC's are the
// numbers this system has always checked against (so existing readiness scores don't change).
export const DEFAULT_STANDARDS: Record<BodyKey, Standards> = {
  NCEAC: { ...NCEAC_DEFAULTS, maxStudentFacultyRatio: 25, ploTargetPct: 60, cloPassPct: null, ploPassPct: null },
  NBEAC: { minCreditHours: 120, maxStudentsPerComputer: 10, minFullTimeFaculty: 6, minPhdFaculty: 1, maxFacultyLoadCh: 12, maxClassSize: 50, maxStudentFacultyRatio: 40, ploTargetPct: 60, cloPassPct: null, ploPassPct: null },
  PEC: { minCreditHours: 130, maxStudentsPerComputer: 3, minFullTimeFaculty: 10, minPhdFaculty: 2, maxFacultyLoadCh: 12, maxClassSize: 50, maxStudentFacultyRatio: 20, ploTargetPct: 60, cloPassPct: null, ploPassPct: null },
  HEC: { minCreditHours: 120, maxStudentsPerComputer: 5, minFullTimeFaculty: 6, minPhdFaculty: 1, maxFacultyLoadCh: 12, maxClassSize: 50, maxStudentFacultyRatio: 30, ploTargetPct: 60, cloPassPct: null, ploPassPct: null },
};

export const STANDARD_FIELDS: { key: StandardKey; label: string; unit: string; min: number; max: number; nullable?: boolean; hint: string }[] = [
  { key: "minCreditHours", label: "Minimum credit hours (4-year program)", unit: "credit hours", min: 60, max: 200, hint: "Checked for every batch's curriculum." },
  { key: "maxStudentsPerComputer", label: "Lab standard: students per working computer", unit: "students", min: 1, max: 50, hint: "Lab inventory against the program's students." },
  { key: "maxStudentFacultyRatio", label: "Maximum students per full-time faculty member", unit: ": 1", min: 5, max: 100, nullable: true, hint: "Visiting faculty count as a quarter." },
  { key: "minFullTimeFaculty", label: "Minimum full-time faculty for the program", unit: "faculty", min: 1, max: 100, hint: "" },
  { key: "minPhdFaculty", label: "Minimum full-time faculty with a PhD", unit: "faculty", min: 0, max: 50, hint: "" },
  { key: "maxFacultyLoadCh", label: "Maximum teaching load per teacher", unit: "credit hours / semester", min: 3, max: 30, hint: "" },
  { key: "maxClassSize", label: "Maximum students per section", unit: "students", min: 10, max: 200, hint: "" },
  { key: "ploTargetPct", label: "PLO attainment benchmark: students attaining each PLO", unit: "%", min: 1, max: 100, hint: "A PLO attained by fewer students is shown as a gap." },
  { key: "cloPassPct", label: "CLO passing mark for this council's programs", unit: "%", min: 1, max: 100, nullable: true, hint: "Empty = the institute's Passing Criteria (OMC)." },
  { key: "ploPassPct", label: "PLO passing mark for this council's programs", unit: "%", min: 1, max: 100, nullable: true, hint: "Empty = the institute's Passing Criteria (OMC)." },
];

/** The thresholds for one council's programs: the institute's own figures over the defaults. */
export async function standardsFor(chairmanId: string | null | undefined, body: BodyKey): Promise<Standards & { customised: StandardKey[] }> {
  const base = { ...DEFAULT_STANDARDS[body] };
  const row = chairmanId ? await prisma.accreditationStandard.findUnique({ where: { chairmanId_body: { chairmanId, body } } }).catch(() => null) : null;
  const customised: StandardKey[] = [];
  if (row) for (const f of STANDARD_FIELDS) {
    const v = (row as Record<string, unknown>)[f.key];
    if (v !== null && v !== undefined) { (base as Record<string, unknown>)[f.key] = v; customised.push(f.key); }
  }
  return { ...base, customised };
}
