import { prisma } from "./db";
import { standingOf } from "./fyp";
import { chairmanIdFor } from "./reportScope";

const cdb = prisma as unknown as Record<string, any>;
export type CvData = {
  headline: string; summary: string; phone: string; email: string; city: string; linkedin: string; github: string; portfolio: string;
  skills: string[]; languages: string[];
  projects: { title: string; text: string; link: string }[];
  experience: { role: string; org: string; from: string; to: string; text: string }[];
  certifications: { name: string; by: string; year: string }[];
  achievements: string[];
};
export const EMPTY_CV: CvData = { headline: "", summary: "", phone: "", email: "", city: "", linkedin: "", github: "", portfolio: "", skills: [], languages: [], projects: [], experience: [], certifications: [], achievements: [] };

export async function cvOf(studentId: string) {
  const row = (await cdb.studentCv.findUnique({ where: { studentId } }).catch(() => null)) as { dataJson: string; showCgpa: boolean; published: boolean; status: string; reviewerNote: string | null } | null;
  let data: CvData = EMPTY_CV;
  try { data = { ...EMPTY_CV, ...(row ? JSON.parse(row.dataJson) : {}) }; } catch { data = EMPTY_CV; }
  return { row, data };
}

/** Everything the printable CV shows: the student's own sections plus what the app already knows (program, CGPA if allowed, FYP). */
export async function cvView(studentId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, rollNumber: true, batch: { select: { id: true, degreeProgram: true, batchName: true, startYear: true, coordinator: { select: { managedById: true } } } } } });
  if (!st) return null;
  const [{ row, data }, standing, fyp] = await Promise.all([
    cvOf(studentId), standingOf(studentId),
    prisma.fypGroupMember.findFirst({ where: { studentId, status: "JOINED" }, orderBy: { createdAt: "desc" }, select: { groupId: true } }),
  ]);
  const group = fyp ? await prisma.fypGroup.findUnique({ where: { id: fyp.groupId }, select: { name: true, proposalId: true, supervisorId: true } }) : null;
  const proposal = group?.proposalId ? await prisma.fypProposal.findUnique({ where: { id: group.proposalId }, select: { title: true, abstract: true, domain: true } }) : null;
  const head = st.batch.coordinator.managedById;
  const inst = head ? await prisma.user.findUnique({ where: { id: head }, select: { instituteName: true, name: true } }) : null;
  return { student: st, data, row, cgpa: row?.showCgpa ? standing.cgpa : null, fyp: proposal ? { title: proposal.title, abstract: proposal.abstract, domain: proposal.domain } : null, institute: inst?.instituteName || "", chairmanId: head };
}

/** Staff of the same institute may view any CV of it; reviewers: the batch's advisor, the Program Lead, or the FYP supervisor. */
export async function canReviewCv(user: { id: string; role: string; managedById: string | null }, studentId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { advisorId: true, coordinatorId: true } } } });
  if (!st) return false;
  if (st.batch.advisorId === user.id || st.batch.coordinatorId === user.id) return true;
  const g = await prisma.fypGroupMember.findFirst({ where: { studentId, status: "JOINED" }, select: { groupId: true } });
  return !!g && (await prisma.fypGroup.count({ where: { id: g.groupId, supervisorId: user.id } })) > 0;
}
export async function sameInstitute(user: { id: string; role: string; managedById: string | null }, chairmanId: string | null) {
  if (!chairmanId) return false;
  if (user.role === "SUPER_USER") return true;
  return (await chairmanIdFor(user).catch(() => "")) === chairmanId;
}
