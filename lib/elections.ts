import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers, holdersOf } from "./notifications";
import { computeCgpa } from "./academicStanding";
import { sessionNow } from "./studentActivities";

// Society elections. The Societies Head (Student Affairs) opens an election for a society: the positions, who may vote
// (the society's members, the society's department, or all students), the dates and the eligibility. Students apply
// with a 2-minute speech (a video link) and their plan for the year; the society's faculty advisor approves the
// candidate and the material, then the Societies Head gives final approval. Voting is online and secret — a ballot only
// records that a student voted for a position; the count is kept on the candidate. After the Societies Head publishes
// the result, the winners become the society's office holders for the term and get the office holders' tools.
// Office holders submit a plan for the year and, after each event, its report; the society's advisor approves both.

const edb = prisma as unknown as Record<string, any>;
export const ELECTION_HINT = "Elections need prisma/migration_fyp_elections.sql — run it in Supabase.";
export const SCOPES: Record<string, string> = { SOCIETY: "Members of the society", DEPARTMENT: "Students of the society's department", ALL: "All students" };

export type Election = { id: string; chairmanId: string; societyId: string; title: string; positions: string[]; voterScope: string; term: string; applyFrom: Date; applyTo: Date; voteFrom: Date; voteTo: Date; minCgpa: number | null; minSemester: number | null; published: boolean; createdById: string };
export type Candidate = { id: string; electionId: string; studentId: string; position: string; manifesto: string; plan: string; videoUrl: string | null; advisorStatus: string; headStatus: string; note: string | null; votes: number };

const parse = (e: any): Election => ({ ...e, positions: JSON.parse(e.positionsJson || "[]") });

export function phase(e: Election, now = new Date()): "UPCOMING" | "APPLY" | "REVIEW" | "VOTING" | "COUNTED" | "PUBLISHED" {
  if (e.published) return "PUBLISHED";
  if (now < e.applyFrom) return "UPCOMING";
  if (now <= e.applyTo) return "APPLY";
  if (now < e.voteFrom) return "REVIEW";
  if (now <= e.voteTo) return "VOTING";
  return "COUNTED";
}
export const PHASE_TEXT: Record<string, string> = { UPCOMING: "Opens soon", APPLY: "Applications open", REVIEW: "Candidates being approved", VOTING: "Voting open", COUNTED: "Voting closed — result not published yet", PUBLISHED: "Result published" };

export async function electionsOf(chairmanId: string): Promise<Election[]> {
  try { return (await edb.societyElection.findMany({ where: { chairmanId }, orderBy: { voteFrom: "desc" } })).map(parse); } catch { return []; }
}
export async function electionById(id: string): Promise<Election | null> {
  try { const e = await edb.societyElection.findUnique({ where: { id } }); return e ? parse(e) : null; } catch { return null; }
}
export async function candidatesOf(electionIds: string[]): Promise<Candidate[]> {
  try { return await edb.electionCandidate.findMany({ where: { electionId: { in: electionIds.concat(["none"]) } }, orderBy: { createdAt: "asc" } }); } catch { return []; }
}

export async function saveElection(chairmanId: string, d: Omit<Election, "id" | "chairmanId" | "published" | "createdById"> & { id?: string }, by: string) {
  const data = { societyId: d.societyId, title: d.title, positionsJson: JSON.stringify(d.positions), voterScope: d.voterScope, term: d.term, applyFrom: d.applyFrom, applyTo: d.applyTo, voteFrom: d.voteFrom, voteTo: d.voteTo, minCgpa: d.minCgpa, minSemester: d.minSemester };
  if (d.id) { await edb.societyElection.updateMany({ where: { id: d.id, chairmanId, published: false }, data }); return d.id; }
  const id = randomUUID();
  await edb.societyElection.create({ data: { id, chairmanId, ...data, published: false, createdById: by, createdAt: new Date() } });
  return id;
}

/** The student's institute and department. */
export async function studentPlace(studentId: string) {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, rollNumber: true, currentSemesterNumber: true, batch: { select: { coordinator: { select: { managedById: true, departmentId: true } } } } } });
  return s ? { ...s, chairmanId: s.batch?.coordinator.managedById || "", departmentId: s.batch?.coordinator.departmentId || null } : null;
}

export async function mayVote(studentId: string, e: Election) {
  const p = await studentPlace(studentId);
  if (!p || p.chairmanId !== e.chairmanId) return false;
  if (e.voterScope === "ALL") return true;
  if (e.voterScope === "DEPARTMENT") {
    const soc = await prisma.studentSociety.findUnique({ where: { id: e.societyId }, select: { departmentId: true } });
    return !soc?.departmentId || soc.departmentId === p.departmentId;
  }
  return !!(await prisma.societyMember.findFirst({ where: { societyId: e.societyId, studentId } }));
}

export async function apply(studentId: string, electionId: string, d: { position: string; manifesto: string; plan: string; videoUrl: string | null }) {
  const e = await electionById(electionId);
  if (!e || phase(e) !== "APPLY") throw new Error("Applications are not open for this election.");
  if (!e.positions.includes(d.position)) throw new Error("Choose one of the positions.");
  const p = await studentPlace(studentId);
  if (!p || p.chairmanId !== e.chairmanId) throw new Error("This election is not for your institute.");
  if (e.minSemester && p.currentSemesterNumber < e.minSemester) throw new Error(`Candidates must be in semester ${e.minSemester} or later.`);
  if (e.minCgpa) { const c = await computeCgpa(studentId); if (c === null || c < e.minCgpa) throw new Error(`Candidates need a CGPA of at least ${e.minCgpa.toFixed(2)}.`); }
  if (await edb.electionCandidate.findFirst({ where: { electionId, studentId } })) throw new Error("You have already applied in this election.");
  await edb.electionCandidate.create({ data: { id: randomUUID(), electionId, studentId, position: d.position, manifesto: d.manifesto, plan: d.plan, videoUrl: d.videoUrl, advisorStatus: "PENDING", headStatus: "PENDING", votes: 0, createdAt: new Date() } });
  const soc = await prisma.studentSociety.findUnique({ where: { id: e.societyId }, select: { advisorId: true, name: true } });
  await notifyUsers([soc?.advisorId], { kind: "SOCIETY", title: `Election candidate — ${soc?.name}`, body: `${p.name} (${p.rollNumber}) applied for ${d.position}. Review the speech and plan.`, href: "/societies/elections" });
}

/** The society's advisor (or Student Affairs where the society has none) approves first; then the Societies Head. */
export async function decideCandidate(candidateId: string, stage: "ADVISOR" | "HEAD", approve: boolean, note: string | null, user: { id: string; role: string; managedById: string | null }) {
  const c = (await edb.electionCandidate.findUnique({ where: { id: candidateId } })) as Candidate | null;
  const e = c ? await electionById(c.electionId) : null;
  if (!c || !e) throw new Error("Not found.");
  const soc = await prisma.studentSociety.findUnique({ where: { id: e.societyId }, select: { advisorId: true, chairmanId: true } });
  const isHead = ["STUDENT_AFFAIRS", "CHAIRMAN"].includes(user.role) && (user.role === "CHAIRMAN" ? user.id : user.managedById) === e.chairmanId;
  if (stage === "ADVISOR" && !(soc?.advisorId === user.id || (!soc?.advisorId && isHead))) throw new Error("Only the society's faculty advisor approves at this stage.");
  if (stage === "HEAD" && !isHead) throw new Error("Only the Societies Head gives final approval.");
  if (stage === "HEAD" && c.advisorStatus !== "APPROVED") throw new Error("The society's advisor has to approve first.");
  await edb.electionCandidate.update({ where: { id: candidateId }, data: stage === "ADVISOR" ? { advisorStatus: approve ? "APPROVED" : "REJECTED", note } : { headStatus: approve ? "APPROVED" : "REJECTED", note } });
  if (stage === "ADVISOR" && approve) await notifyUsers(await holdersOf(e.chairmanId, "STUDENT_AFFAIRS"), { kind: "SOCIETY", title: "Candidate ready for final approval", body: e.title, href: "/societies/elections" });
}

export const onBallot = (c: Candidate) => c.advisorStatus === "APPROVED" && c.headStatus === "APPROVED";

export async function castVote(studentId: string, electionId: string, position: string, candidateId: string) {
  const e = await electionById(electionId);
  if (!e || phase(e) !== "VOTING") throw new Error("Voting is not open.");
  if (!(await mayVote(studentId, e))) throw new Error("You are not a voter in this election.");
  const c = (await edb.electionCandidate.findUnique({ where: { id: candidateId } })) as Candidate | null;
  if (!c || c.electionId !== electionId || c.position !== position || !onBallot(c)) throw new Error("Not a candidate for this position.");
  try {
    await prisma.$transaction([
      edb.electionBallot.create({ data: { id: randomUUID(), electionId, position, studentId, castAt: new Date() } }),
      edb.electionCandidate.update({ where: { id: candidateId }, data: { votes: { increment: 1 } } }),
    ]);
  } catch { throw new Error("You have already voted for this position."); }
}

export async function ballotsOf(electionId: string, studentId?: string): Promise<{ position: string; studentId: string }[]> {
  try { return await edb.electionBallot.findMany({ where: { electionId, ...(studentId ? { studentId } : {}) }, select: { position: true, studentId: true } }); } catch { return []; }
}

/** Publish: winners (most votes per position; a tie is left for the Societies Head to settle) become office holders. */
export async function publish(electionId: string, user: { id: string; role: string; managedById: string | null }) {
  const e = await electionById(electionId);
  if (!e) throw new Error("Not found.");
  if (!(["STUDENT_AFFAIRS", "CHAIRMAN"].includes(user.role) && (user.role === "CHAIRMAN" ? user.id : user.managedById) === e.chairmanId)) throw new Error("Only the Societies Head publishes the result.");
  if (phase(e) !== "COUNTED") throw new Error("Voting has to close first.");
  const cands = (await candidatesOf([e.id])).filter(onBallot);
  const ties: string[] = [];
  const students = new Map((await prisma.student.findMany({ where: { id: { in: cands.map((c) => c.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, s]));
  for (const pos of e.positions) {
    const xs = cands.filter((c) => c.position === pos).sort((a, b) => b.votes - a.votes);
    if (!xs.length) continue;
    if (xs.length > 1 && xs[0].votes === xs[1].votes) { ties.push(pos); continue; }
    const st = students.get(xs[0].studentId);
    if (!st) continue;
    await prisma.societyMember.deleteMany({ where: { societyId: e.societyId, term: e.term, position: pos } });
    await prisma.societyMember.create({ data: { societyId: e.societyId, studentId: st.id, name: st.name, rollNumber: st.rollNumber, position: pos, term: e.term } });
  }
  if (ties.length) throw new Error(`Tied: ${ties.join(", ")}. Settle the tie (e.g. a run-off) before publishing.`);
  await edb.societyElection.update({ where: { id: e.id }, data: { published: true } });
}

/* ---------------- Office holders: plan for the year, event reports ---------------- */

export type SocietyPlanRow = { id: string; societyId: string; studentId: string; term: string; kind: string; eventId: string | null; text: string; participants: number | null; status: string; note: string | null; createdAt: Date };

export async function submitPlan(studentId: string, societyId: string, kind: "YEAR_PLAN" | "EVENT_REPORT", d: { text: string; eventId?: string | null; participants?: number | null }) {
  const soc = await prisma.studentSociety.findUnique({ where: { id: societyId }, select: { advisorId: true, name: true } });
  await edb.societyPlan.create({ data: { id: randomUUID(), societyId, studentId, term: sessionNow(), kind, eventId: d.eventId || null, text: d.text, participants: d.participants ?? null, status: "PENDING", createdAt: new Date() } });
  await notifyUsers([soc?.advisorId], { kind: "SOCIETY", title: `${kind === "YEAR_PLAN" ? "Plan for the year" : "Event report"} — ${soc?.name}`, body: "Waiting for your approval as the society's advisor.", href: "/societies/elections" });
}

export async function plansOf(where: Record<string, unknown>): Promise<SocietyPlanRow[]> {
  try { return await edb.societyPlan.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }); } catch { return []; }
}

export async function decidePlan(id: string, approve: boolean, note: string | null, user: { id: string; role: string; managedById: string | null }) {
  const p = (await edb.societyPlan.findUnique({ where: { id } })) as SocietyPlanRow | null;
  if (!p) throw new Error("Not found.");
  const soc = await prisma.studentSociety.findUnique({ where: { id: p.societyId }, select: { advisorId: true, chairmanId: true } });
  const head = ["STUDENT_AFFAIRS", "CHAIRMAN"].includes(user.role) && (user.role === "CHAIRMAN" ? user.id : user.managedById) === soc?.chairmanId;
  if (soc?.advisorId !== user.id && !(head && !soc?.advisorId)) throw new Error("Only the society's advisor approves this.");
  await edb.societyPlan.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", note, decidedById: user.id, decidedAt: new Date() } });
  // An approved event report completes the event with what happened.
  if (approve && p.kind === "EVENT_REPORT" && p.eventId) await prisma.societyEvent.update({ where: { id: p.eventId }, data: { status: "COMPLETED", outcome: p.text, ...(p.participants ? { participants: p.participants } : {}) } }).catch(() => {});
}
