import { prisma } from "./db";

// Accounts records for accreditation (NCEAC / NBEAC ask for these): the fee each program charges per intake session,
// and the scholarships / financial aid given each fiscal year. Kept by the Finance Officer and the Institute Head.

export const SCHOLARSHIP_SCHEMES = [
  "Merit scholarship", "Need-based scholarship", "HEC need-based", "Ehsaas / BISP undergraduate", "PM laptop / fee reimbursement",
  "Kinship (sibling) discount", "Employee children", "Sports scholarship", "Hafiz-e-Quran", "Disabled students", "Orphan / Shaheed family", "Other",
];
export type FeeRow = { id: string; degreeProgram: string; session: string; admissionFee: number; tuitionPerSemester: number; perCreditHour: number | null; labFee: number; examFee: number; otherFee: number; notes: string | null };
export type ScholarshipRow = { id: string; fiscalYear: string; scheme: string; degreeProgram: string | null; students: number; amount: number; notes: string | null };

/** Every program of the institute (from departments and batches). */
export async function programsOf(chairmanId: string) {
  const [dp, batches] = await Promise.all([
    prisma.departmentProgram.findMany({ where: { chairmanId }, select: { degreeProgram: true } }),
    prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { degreeProgram: true }, distinct: ["degreeProgram"] }),
  ]);
  return Array.from(new Set([...dp.map((d) => d.degreeProgram), ...batches.map((b) => b.degreeProgram)])).filter(Boolean).sort();
}

export async function loadAccounts(chairmanId: string, fiscalYear: string) {
  const [fees, scholarships, students] = await Promise.all([
    prisma.feeStructure.findMany({ where: { chairmanId }, orderBy: [{ session: "desc" }, { degreeProgram: "asc" }] }),
    prisma.scholarshipRecord.findMany({ where: { chairmanId, fiscalYear }, orderBy: [{ scheme: "asc" }] }),
    prisma.student.count({ where: { batch: { coordinator: { managedById: chairmanId } } } }),
  ]);
  return { fees: fees as FeeRow[], scholarships: scholarships as ScholarshipRow[], students };
}

/** Fee for a whole program of 8 semesters (admission once + tuition and charges each semester), for comparison. */
export const programCost = (f: { admissionFee: number; tuitionPerSemester: number; labFee: number; examFee: number; otherFee: number }, semesters = 8) =>
  f.admissionFee + semesters * (f.tuitionPerSemester + f.labFee + f.examFee + f.otherFee);
