import { createHash, randomUUID } from "crypto";
import { prisma } from "./db";
import { degreeAudit } from "./transcriptPlus";
import { notifyStudents } from "./studentNotices";
import { notifyUsers } from "./notifications";

// Queue item 16: the degree audit frozen and signed when a degree is issued, run for a whole batch, and sent early.
const db = prisma as unknown as Record<string, any>;
type Audit = NonNullable<Awaited<ReturnType<typeof degreeAudit>>>;
const hashOf = (a: Audit) => createHash("sha256").update(JSON.stringify({ g: a.graduation, r: a.required, p: a.passed, c: a.cgpa, groups: a.groups })).digest("hex").slice(0, 16);

/** Called when a degree is issued: the audit it was issued on, signed by the Controller. */
export async function snapshotAtIssue(chairmanId: string, studentId: string, issueId: string, by: { id: string; name: string }) {
  const a = await degreeAudit(studentId); if (!a) return;
  await db.degreeAuditSnapshot?.create({ data: { id: randomUUID(), chairmanId, studentId, issueId, auditJson: JSON.stringify(a), hash: hashOf(a), signedById: by.id, signedByName: by.name } }).catch(() => null);
}
/** The signed snapshot and whether the transcript has changed since. */
export async function snapshotOf(studentId: string) {
  const s = (await db.degreeAuditSnapshot?.findFirst({ where: { studentId }, orderBy: { at: "desc" } }).catch(() => null)) as { auditJson: string; hash: string; signedByName: string; at: Date; issueId: string | null } | null;
  if (!s) return null;
  const now = await degreeAudit(studentId);
  return { ...s, audit: JSON.parse(s.auditJson) as Audit, changed: !!now && hashOf(now) !== s.hash };
}
/** The audit for every student of a batch (no limit), in small parallel chunks. */
export async function batchAudit(batchId: string) {
  const st = await prisma.student.findMany({ where: { batchId, status: { in: ["ACTIVE", "GRADUATED"] } }, select: { id: true, name: true, rollNumber: true }, orderBy: { rollNumber: "asc" } });
  const out: { id: string; name: string; roll: string; eligible: boolean; cgpa: number | null; failing: string[]; missing: number }[] = [];
  for (let i = 0; i < st.length; i += 15) {
    const part = await Promise.all(st.slice(i, i + 15).map(async (s) => {
      const a = await degreeAudit(s.id).catch(() => null);
      return { id: s.id, name: s.name, roll: s.rollNumber, eligible: !!a?.eligible, cgpa: a?.cgpa ?? null, failing: (a?.graduation || []).filter((g) => !g.ok).map((g) => `${g.label}${g.detail ? ` (${g.detail})` : ""}`), missing: a ? Math.max(0, a.required - a.passed - a.inProgress) : 0 };
    }));
    out.push(...part);
  }
  return out;
}
/** Early warning at the start of the final year: each student who would not pass today hears what is missing; so does the adviser. */
export async function earlyWarnings(batchId: string, chairmanId: string) {
  const rows = (await batchAudit(batchId)).filter((r) => !r.eligible);
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { advisorId: true, degreeProgram: true, batchName: true } });
  for (const r of rows) await notifyStudents([r.id], { kind: "DEGREE_EARLY_WARNING", title: "Your degree audit: still to do", body: r.failing.slice(0, 4).join("; "), href: "/student/transcript" }, chairmanId).catch(() => null);
  if (b?.advisorId && rows.length) await notifyUsers([b.advisorId], { kind: "DEGREE_EARLY_WARNING", title: `${rows.length} of your advisees would not graduate today`, body: `${b.degreeProgram} ${b.batchName}: ${rows.slice(0, 6).map((r) => r.roll).join(", ")}${rows.length > 6 ? "…" : ""}`, href: `/degrees/audit?batch=${batchId}` }).catch(() => null);
  return rows.length;
}
