import { prisma } from "./db";
import { universityOf } from "./curriculumLibrary";

// Gates that the affiliation records put on a college's own work (Adeel prompt §28.1, §29.A, §30.3, §30.6):
// an expired / withdrawn affiliation blocks new batches; unpaid university fees block results (setting aff.duesBlock);
// a teacher not approved by the university for a course can't be allocated to it (only once the university keeps
// faculty approvals for this college).
const db = prisma as unknown as Record<string, any>;
const J = (s: string) => { try { return JSON.parse(s) as Record<string, any>; } catch { return {} as Record<string, any>; } };

export async function newBatchBlock(collegeId: string): Promise<string | null> {
  const uni = await universityOf(collegeId).catch(() => null);
  if (!uni) return null;
  const link = await db.instituteAffiliation?.findUnique({ where: { collegeId } }).catch(() => null);
  if (link && link.status !== "ACTIVE") return `The affiliation is ${String(link.status).toLowerCase()} — new batches are blocked until the university restores it.`;
  const apps = ((await db.affRecord?.findMany({ where: { collegeId, kind: "APPLICATION", status: { in: ["APPROVED", "CONDITIONAL"] } }, orderBy: { updatedAt: "desc" }, take: 20 }).catch(() => [])) || []) as { dataJson: string }[];
  const until = apps.map((a) => J(a.dataJson).validUntil).filter(Boolean).sort().pop();
  if (until && new Date(until) < new Date()) return `The affiliation expired on ${until} — apply for renewal; new batches are blocked.`;
  return null;
}
export async function duesBlock(collegeId: string): Promise<string | null> {
  const uni = await universityOf(collegeId).catch(() => null);
  if (!uni) return null;
  const on = await import("./scopedSettings").then(async (m) => (await m.allStored(uni)).find((r) => r.key === "aff.duesBlock")?.value === "1").catch(() => false);
  if (!on) return null;
  const due = ((await db.affRecord?.count({ where: { collegeId, kind: "FEE", status: "DUE" } }).catch(() => 0)) || 0) as number;
  return due ? `${due} university fee challan(s) are unpaid — results are held until they are paid (university setting).` : null;
}
/** null = allowed. Only enforced when the university keeps faculty approvals for this college. */
export async function facultyBlock(collegeId: string, teacherName: string, code: string): Promise<string | null> {
  const uni = await universityOf(collegeId).catch(() => null);
  if (!uni) return null;
  const recs = ((await db.affRecord?.findMany({ where: { collegeId, kind: "FACULTY" }, take: 2000 }).catch(() => [])) || []) as { status: string; dataJson: string }[];
  if (!recs.length) return null;
  const n = (s: string) => s.toLowerCase().replace(/^(dr|mr|ms|mrs|engr|prof)\.?\s+/g, "").replace(/\s+/g, " ").trim();
  const ok = recs.some((r) => { const d = J(r.dataJson); return r.status === "APPROVED" && n(String(d.teacher || "")) === n(teacherName) && String(d.courses || "").toUpperCase().split(/[\s,;]+/).includes(code.toUpperCase()) && (!d.validUntil || new Date(d.validUntil) >= new Date()); });
  return ok ? null : `${teacherName} is not approved by the university for ${code} (or the approval has expired).`;
}
