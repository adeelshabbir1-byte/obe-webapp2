import { prisma } from "./db";
import { rdb, type Who } from "./registers";

// Degree issuance: a graduating student is cleared by the library, the fee office, the hostel and the department; the
// degree audit must pass; then the degree gets the next serial number in the register and goes on a convocation list.
// Verification requests (HEC, employers, universities, embassies) are matched against the register and answered.

export const DEG_HINT = "Degree issuance needs prisma/migration_degrees.sql — run it in Supabase.";
export const OFFICES = [
  { key: "library", label: "Library", who: "the Librarian", can: (w: Who) => w.librarian || w.head },
  { key: "fee", label: "Fee office", who: "the Finance Officer", can: (w: Who) => w.finance || w.head },
  { key: "hostel", label: "Hostel", who: "Student Affairs", can: (w: Who) => w.affairs || w.head },
  { key: "department", label: "Department", who: "the HOD or Program Lead", can: (w: Who) => w.hod || w.lead || w.dean || w.head },
] as const;
export type OfficeKey = (typeof OFFICES)[number]["key"];
export type Clearance = Record<`${OfficeKey}At`, Date | null> & Record<`${OfficeKey}Note`, string | null> & { studentId: string };
export const REQUESTERS: Record<string, string> = { HEC: "HEC (degree attestation)", EMPLOYER: "Employer", UNIVERSITY: "Another university", EMBASSY: "Embassy / foreign body", OTHER: "Other" };
export const RESPONSES: Record<string, string> = { VERIFIED: "Verified — the degree is genuine", NOT_FOUND: "Not found in our register", MISMATCH: "Details do not match our register" };
export const canManageDegrees = (w: Who) => w.head || w.dean || w.exam;
export const allCleared = (c: Partial<Clearance> | null | undefined) => !!c && OFFICES.every((o) => !!c[`${o.key}At`]);

/** Next serial in the register: <PREFIX>-<YEAR>-<0001>. The prefix is the institute's HEMIS code when set, else DEG. */
export async function nextSerial(chairmanId: string, year: number) {
  const code = (await rdb.hemisCode.findFirst({ where: { chairmanId, program: "" }, select: { code: true } }).catch(() => null))?.code;
  const prefix = (code || "DEG").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) || "DEG";
  const like = `${prefix}-${year}-`;
  const rows = (await rdb.degreeIssue.findMany({ where: { chairmanId, serialNo: { startsWith: like } }, select: { serialNo: true } })) as { serialNo: string }[];
  const max = rows.reduce((m, r) => Math.max(m, Number(r.serialNo.slice(like.length)) || 0), 0);
  return `${like}${String(max + 1).padStart(4, "0")}`;
}

/** Final-year and graduated students of an institute (candidates for clearance). */
export async function candidates(chairmanId: string, batchId?: string) {
  return prisma.student.findMany({ where: { batch: { coordinator: { managedById: chairmanId }, ...(batchId ? { id: batchId } : {}) }, OR: [{ status: "GRADUATED" }, { currentSemesterNumber: { gte: 8 } }] } as never, select: { id: true, name: true, rollNumber: true, status: true, currentSemesterNumber: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { rollNumber: "asc" }, take: 400 });
}

/** Match a verification request against the register: by serial first, then by roll number (and name when given). */
export async function matchRequest(chairmanId: string, q: { serialNo?: string | null; rollNumber?: string | null; studentName?: string | null }) {
  const norm = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const bySerial = q.serialNo ? await rdb.degreeIssue.findFirst({ where: { chairmanId, serialNo: { equals: q.serialNo.trim(), mode: "insensitive" }, cancelledAt: null } }) : null;
  const byRoll = !bySerial && q.rollNumber ? await rdb.degreeIssue.findFirst({ where: { chairmanId, rollNumber: { equals: q.rollNumber.trim(), mode: "insensitive" }, cancelledAt: null } }) : null;
  const hit = (bySerial || byRoll) as { id: string; studentName: string; rollNumber: string; serialNo: string } | null;
  if (!hit) return { issue: null, suggest: "NOT_FOUND" as const };
  const nameOk = !q.studentName || norm(q.studentName) === norm(hit.studentName);
  const rollOk = !q.rollNumber || norm(q.rollNumber) === norm(hit.rollNumber);
  return { issue: hit, suggest: nameOk && rollOk ? ("VERIFIED" as const) : ("MISMATCH" as const) };
}
