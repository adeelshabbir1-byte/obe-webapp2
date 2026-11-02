import { prisma } from "./db";
import { gaAverages } from "./skillsTranscriptCore";

const db = prisma as unknown as Record<string, any>;
/** Everything on one student's skills transcript. */
export async function skillsOf(studentId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, rollNumber: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true, coordinator: { select: { managedById: true } } } } } });
  if (!st) return null;
  const [recs, plos, members, fyp] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, ploAttainmentJson: true, termName: true, termYear: true } }),
    prisma.pLO.findMany({ where: { batchId: st.batchId }, select: { number: true, title: true } }),
    (db.societyMember?.findMany({ where: { studentId }, select: { societyId: true, position: true, term: true } }).catch(() => []) || []) as Promise<{ societyId: string; position: string; term: string }[]>,
    (db.fypGroupMember?.findMany({ where: { studentId }, select: { groupId: true } }).catch(() => []) || []) as Promise<{ groupId: string }[]>,
  ]);
  const socs = members.length ? ((await db.studentSociety.findMany({ where: { id: { in: members.map((m) => m.societyId) } }, select: { id: true, name: true, category: true } }).catch(() => [])) as { id: string; name: string; category: string }[]) : [];
  const groups = fyp.length ? ((await db.fypGroup.findMany({ where: { id: { in: fyp.map((f) => f.groupId) } }, select: { id: true, name: true, proposalId: true } }).catch(() => [])) as { id: string; name: string; proposalId: string | null }[]) : [];
  const props = groups.some((g) => g.proposalId) ? ((await db.fypProposal.findMany({ where: { id: { in: groups.map((g) => g.proposalId).filter(Boolean) } }, select: { id: true, title: true } }).catch(() => [])) as { id: string; title: string }[]) : [];
  const res = ((await db.fypResult?.findMany({ where: { studentId, status: "APPROVED" }, select: { grade: true } }).catch(() => [])) || []) as { grade: string }[];
  const title = new Map<number, string>(plos.map((p) => [p.number as number, p.title as string]));
  const inst = await prisma.user.findUnique({ where: { id: st.batch.coordinator.managedById || "none" }, select: { instituteName: true, name: true } }).catch(() => null);
  return {
    student: { id: st.id as string, name: st.name as string, roll: st.rollNumber as string, program: st.batch.degreeProgram as string, batch: st.batch.batchName as string },
    institute: String((inst as { instituteName?: string | null; name?: string } | null)?.instituteName || (inst as { name?: string } | null)?.name || ""),
    gas: gaAverages(recs).map((g) => ({ ...g, title: title.get(g.number) || "" })),
    courses: recs.length as number,
    activities: members.map((m) => { const s = socs.find((x) => x.id === m.societyId); return { society: s?.name || "Society", category: s?.category || "", position: m.position, term: m.term }; }),
    fyp: groups.map((g) => ({ group: g.name, title: props.find((p) => p.id === g.proposalId)?.title || "", grade: res[0]?.grade || null })),
  };
}
