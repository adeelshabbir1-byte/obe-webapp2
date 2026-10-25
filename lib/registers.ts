import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { QEC_INCHARGE } from "./duties";
import { EXAM_CONTROLLER } from "./academicRules";

// Who someone is for the institute registers (QAA cycle, plagiarism, degrees, committees, refunds, disabilities,
// policy history, faculty development funding, benefits): their institute, position and duties.

export const rdb = prisma as unknown as Record<string, any>;
export type Who = { id: string; name: string; role: string; chairmanId: string; head: boolean; dean: boolean; hod: boolean; lead: boolean; qec: boolean; exam: boolean; finance: boolean; affairs: boolean; librarian: boolean; leader: boolean };
type U = { id: string; name: string; role: string; managedById: string | null; extraRoles?: string[] | null };

export async function whoIs(user: U): Promise<Who | null> {
  const chairmanId = await chairmanIdFor(user).catch(() => null);
  if (!chairmanId) return null;
  const extra = new Set(user.extraRoles || []);
  const head = user.role === "CHAIRMAN", dean = user.role === "DEAN", hod = user.role === "HEAD_OF_DEPARTMENT";
  return { id: user.id, name: user.name, role: user.role, chairmanId, head, dean, hod, lead: user.role === "PROGRAM_COORDINATOR", qec: extra.has(QEC_INCHARGE), exam: extra.has(EXAM_CONTROLLER) || head, finance: user.role === "FINANCE_OFFICER", affairs: user.role === "STUDENT_AFFAIRS", librarian: user.role === "LIBRARIAN", leader: head || dean || hod };
}

/** Staff of an institute (for pickers). */
export async function staffOf(chairmanId: string) {
  return prisma.user.findMany({ where: { isActive: true, OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
}
/** Programs of an institute. */
export async function programsOf(chairmanId: string) {
  const bs = await prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { degreeProgram: true } });
  return Array.from(new Set(bs.map((b) => b.degreeProgram))).sort();
}
export const day = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const dateOrNull = (v: unknown) => { if (typeof v !== "string" || !v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };
export const str = (v: unknown, n = 2000) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export const num = (v: unknown) => { const x = Number(v); return v === "" || v == null || !Number.isFinite(x) ? null : x; };
export const parseJ = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
