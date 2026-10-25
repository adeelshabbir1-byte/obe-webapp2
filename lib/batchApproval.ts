import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { approverIds } from "./approvers";
import { omcOfBatch, tally, isMember } from "./omcMembers";
import { compareBatch, TAG_LABEL, sideText } from "./batchCompare";
import { removeCourse, logChange } from "./batchSetup";
import { markStep } from "./batchFlow";

// The department OMC's approval of a new batch. The Program Lead sends it at the end of the set-up; every member sees it
// in the queue and reviews it step by step; the OMC makes proposals (each with a reason), the Program Lead gives agree /
// disagree and a comment on each; each member endorses or not with a comment; once more than half endorse, the Convener
// finalises — final even where the Program Lead disagreed (the opinion stays on record). Accepted proposals are applied.
// There is no send-back. The whole record is kept as accreditation evidence.

const db = prisma as unknown as Record<string, any>;

export const REVIEW_STEPS = [
  { key: "comparison", title: "Comparison" }, { key: "structure", title: "Structure check" }, { key: "changes", title: "Changes" },
  { key: "plan", title: "Semester plan & prerequisites" }, { key: "electives", title: "Electives & tracks" },
  { key: "se", title: "Subject Experts" }, { key: "ga", title: "Course → GA mapping" },
] as const;
export const PROPOSAL_KINDS: Record<string, string> = { MOVE: "Move to another semester", RENAME: "Change name / code", CH: "Change credit hours", TYPE: "Change type", DROP: "Drop the course", SE: "Another Subject Expert", PREREQ: "Change the prerequisite", NOTE: "Other (no automatic change)" };

export type Proposal = { id: string; batchId: string; step: string; courseId: string | null; kind: string; payload: Record<string, unknown>; reason: string; byId: string; byName: string; createdAt: Date; plOpinion: string | null; plComment: string | null; plAt: Date | null; status: string; decidedAt: Date | null };
export type Approval = { batchId: string; chairmanId: string; departmentId: string | null; status: string; submittedAt: Date; submittedById: string; review: Record<string, { by: string; byName: string; at: string }>; finalisedAt: Date | null; finalisedById: string | null; summary: Summary | null };
export type Summary = { batch: string; finalisedBy: string; at: string; endorsed: string; courses: { code: string; title: string; ch: number; semester: number | null; tags: string[] }[]; proposals: { what: string; reason: string; pl: string; outcome: string }[] };

export async function approvalOf(batchId: string): Promise<Approval | null> {
  const a = await db.batchApproval.findUnique({ where: { batchId } }).catch(() => null);
  if (!a) return null;
  return { ...a, review: JSON.parse(a.reviewJson || "{}"), summary: a.summaryJson ? JSON.parse(a.summaryJson) : null };
}
export async function proposalsOf(batchId: string): Promise<Proposal[]> {
  return ((await db.batchProposal.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as (Proposal & { payloadJson: string })[]).map((p) => ({ ...p, payload: JSON.parse(p.payloadJson || "{}") }));
}
export async function endorsementsOf(batchId: string) {
  return ((await db.batchEndorsement.findMany({ where: { batchId }, orderBy: { at: "asc" } }).catch(() => [])) as { batchId: string; memberId: string; endorse: boolean; comment: string | null; at: Date }[]);
}

/** The Program Lead sends the batch to the OMC (once). */
export async function submitBatch(user: { id: string; name: string }, batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, degreeProgram: true, batchName: true, coordinatorId: true } });
  if (!b || b.coordinatorId !== user.id) throw new Error("Only this batch's Program Lead sends it to the OMC.");
  if (await approvalOf(batchId)) throw new Error("Already sent to the OMC.");
  const omc = await omcOfBatch(batchId);
  if (!omc) throw new Error("Batch not found.");
  if (!(await prisma.course.count({ where: { batchId } }))) throw new Error("The batch has no courses yet.");
  await db.batchApproval.create({ data: { batchId, chairmanId: omc.chairmanId, departmentId: omc.departmentId, submittedById: user.id } });
  await markStep(batchId, 13, user).catch(() => null);
  await writeAuditLog({ actorUserId: user.id, action: "BATCH_SENT_TO_OMC", entityType: "Batch", entityId: batchId }).catch(() => null);
  await notifyUsers(omc.members.map((m) => m.id), { kind: "REQUEST", title: `New batch to approve: ${b.degreeProgram} ${b.batchName}`, body: `${user.name} sent the batch set-up to the OMC.`, href: `/omc/batch-review?batchId=${batchId}` });
}

async function guard(user: { id: string }, batchId: string, needOpen = true) {
  const a = await approvalOf(batchId);
  if (!a) throw new Error("This batch has not been sent to the OMC.");
  if (needOpen && a.status !== "SUBMITTED") throw new Error("The OMC has already approved this batch.");
  const omc = await omcOfBatch(batchId);
  if (!omc || !isMember(omc, user.id)) throw new Error("Only a member of this department's OMC.");
  return { a, omc };
}

/** A member ticks a review step done (shared by the OMC). */
export async function markReview(user: { id: string; name: string }, batchId: string, step: string, on: boolean) {
  const { a } = await guard(user, batchId);
  if (!REVIEW_STEPS.some((s) => s.key === step)) throw new Error("Unknown step.");
  const review = { ...a.review };
  if (on) review[step] = { by: user.id, byName: user.name, at: new Date().toISOString() }; else delete review[step];
  await db.batchApproval.update({ where: { batchId }, data: { reviewJson: JSON.stringify(review) } });
}

/** An OMC proposal, with its reason. The Program Lead is told. */
export async function propose(user: { id: string; name: string }, batchId: string, p: { step: string; courseId?: string | null; kind: string; payload?: Record<string, unknown>; reason: string }) {
  await guard(user, batchId);
  if (!PROPOSAL_KINDS[p.kind]) throw new Error("Choose what the proposal changes.");
  if (!p.reason || p.reason.trim().length < 3) throw new Error("Give the reason for the proposal.");
  if (p.kind !== "NOTE" && !p.courseId) throw new Error("Choose the course.");
  if (p.courseId && !(await prisma.course.count({ where: { id: p.courseId, batchId } }))) throw new Error("That course is not in this batch.");
  const payload = cleanPayload(p.kind, p.payload || {});
  const id = randomUUID();
  await db.batchProposal.create({ data: { id, batchId, step: String(p.step || "changes").slice(0, 30), courseId: p.courseId || null, kind: p.kind, payloadJson: JSON.stringify(payload), reason: p.reason.trim().slice(0, 1500), byId: user.id, byName: user.name } });
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinatorId: true, degreeProgram: true, batchName: true } });
  await notifyUsers([b?.coordinatorId], { kind: "REQUEST", title: `The OMC proposes a change to ${b?.degreeProgram} ${b?.batchName}`, body: `${user.name}: ${await describe({ kind: p.kind, courseId: p.courseId || null, payload } as Proposal)} — ${p.reason.trim()}`, href: `/coordinator/batch-review?batchId=${batchId}#proposals` });
  return id;
}

function cleanPayload(kind: string, raw: Record<string, unknown>): Record<string, unknown> {
  const s = (x: unknown, n = 200) => String(x ?? "").trim().slice(0, n);
  switch (kind) {
    case "MOVE": { const n = Number(raw.semester); if (!(n >= 1 && n <= 12)) throw new Error("Which semester?"); return { semester: n }; }
    case "CH": { const n = Number(raw.ch); if (!(n >= 0 && n <= 12)) throw new Error("How many credit hours?"); return { ch: n }; }
    case "RENAME": { const code = s(raw.code, 30), title = s(raw.title); if (!code && !title) throw new Error("Give the new name or code."); return { code, title }; }
    case "TYPE": { const type = s(raw.type, 60); if (!type) throw new Error("Which type?"); return { type }; }
    case "SE": { const id = s(raw.subjectExpertId, 60); if (!id) throw new Error("Choose the Subject Expert."); return { subjectExpertId: id }; }
    case "PREREQ": return { prerequisiteCourseId: s(raw.prerequisiteCourseId, 60) || null };
    default: return {};
  }
}

export async function describe(p: Pick<Proposal, "kind" | "courseId" | "payload">) {
  const c = p.courseId ? await prisma.course.findUnique({ where: { id: p.courseId }, select: { code: true, title: true } }) : null;
  const name = c ? `${c.code} ${c.title}` : "";
  const v = p.payload as Record<string, string | number | null>;
  switch (p.kind) {
    case "MOVE": return `move ${name} to semester ${v.semester}`;
    case "CH": return `${name}: ${v.ch} credit hours`;
    case "RENAME": return `${name} → ${[v.code, v.title].filter(Boolean).join(" ")}`;
    case "TYPE": return `${name} as ${v.type}`;
    case "DROP": return `drop ${name}`;
    case "SE": { const u = v.subjectExpertId ? await prisma.user.findUnique({ where: { id: String(v.subjectExpertId) }, select: { name: true } }) : null; return `${name}: Subject Expert ${u?.name || "—"}`; }
    case "PREREQ": { const q = v.prerequisiteCourseId ? await prisma.course.findUnique({ where: { id: String(v.prerequisiteCourseId) }, select: { code: true } }) : null; return `${name}: prerequisite ${q?.code || "none"}`; }
    default: return name ? `${name}: note` : "note";
  }
}

/** The Program Lead's opinion on one proposal. */
export async function plOpinion(user: { id: string }, proposalId: string, agree: boolean, comment: string) {
  const p = await db.batchProposal.findUnique({ where: { id: proposalId } });
  if (!p) throw new Error("Proposal not found.");
  const b = await prisma.batch.findUnique({ where: { id: p.batchId }, select: { coordinatorId: true } });
  if (b?.coordinatorId !== user.id) throw new Error("Only this batch's Program Lead gives an opinion.");
  if (!agree && comment.trim().length < 3) throw new Error("Say why you disagree.");
  const a = await approvalOf(p.batchId);
  if (a?.status !== "SUBMITTED") throw new Error("The OMC has already approved this batch.");
  await db.batchProposal.update({ where: { id: proposalId }, data: { plOpinion: agree ? "AGREE" : "DISAGREE", plComment: comment.trim().slice(0, 1500) || null, plAt: new Date() } });
  const omc = await omcOfBatch(p.batchId);
  await notifyUsers((omc?.members || []).map((m) => m.id), { kind: "REQUEST", title: `The Program Lead ${agree ? "agrees" : "disagrees"} with a proposal`, body: comment.trim() || "", href: `/omc/batch-review?batchId=${p.batchId}&step=changes` });
}

/** The Convener drops a proposal before finalising (it is then not applied). */
export async function setProposalStatus(user: { id: string }, proposalId: string, keep: boolean) {
  const p = await db.batchProposal.findUnique({ where: { id: proposalId } });
  if (!p) throw new Error("Proposal not found.");
  const { omc } = await guard(user, p.batchId);
  if (omc.convenerId !== user.id) throw new Error("Only the OMC Convener decides which proposals are kept.");
  await db.batchProposal.update({ where: { id: proposalId }, data: { status: keep ? "OPEN" : "DROPPED" } });
}

export async function endorse(user: { id: string; name: string }, batchId: string, yes: boolean, comment: string) {
  const { omc } = await guard(user, batchId);
  if (!yes && comment.trim().length < 3) throw new Error("Say why you don't endorse it.");
  await db.batchEndorsement.upsert({ where: { batchId_memberId: { batchId, memberId: user.id } }, create: { batchId, memberId: user.id, endorse: yes, comment: comment.trim().slice(0, 1500) || null }, update: { endorse: yes, comment: comment.trim().slice(0, 1500) || null, at: new Date() } });
  const t = tally(omc.members, (await endorsementsOf(batchId)).map((e) => ({ memberId: e.memberId, yes: e.endorse })));
  if (t.carried && omc.convenerId) await notifyUsers([omc.convenerId], { kind: "REQUEST", title: "The OMC's majority endorses the batch — please finalise", body: `Endorsed ${t.yes} of ${t.total}.`, href: `/omc/batch-review?batchId=${batchId}`, exceptId: user.id });
  return t;
}

async function apply(p: Proposal, by: { id: string; name: string }) {
  const v = p.payload as Record<string, string | number | null>;
  const id = p.courseId || "";
  switch (p.kind) {
    case "MOVE": await prisma.course.update({ where: { id }, data: { semesterNumber: Number(v.semester) } }); await db.batchCourseManual.upsert({ where: { courseId: id }, create: { courseId: id, batchId: p.batchId, byId: by.id }, update: { byId: by.id, at: new Date() } }).catch(() => null); break;
    case "CH": await prisma.course.update({ where: { id }, data: { creditHours: Number(v.ch) } }); break;
    case "RENAME": await prisma.course.update({ where: { id }, data: { ...(v.code ? { code: String(v.code) } : {}), ...(v.title ? { title: String(v.title) } : {}) } }); break;
    case "TYPE": await prisma.course.update({ where: { id }, data: { courseType: String(v.type) } }); break;
    case "SE": await prisma.course.update({ where: { id }, data: { subjectExpertId: String(v.subjectExpertId) } }); break;
    case "PREREQ": await prisma.course.update({ where: { id }, data: { prerequisiteCourseId: v.prerequisiteCourseId ? String(v.prerequisiteCourseId) : null } }); break;
    case "DROP": await removeCourse(by, id, `OMC proposal: ${p.reason}`); return;
    default: return;
  }
  const c = await prisma.course.findUnique({ where: { id }, select: { id: true, code: true, title: true } });
  if (c) await logChange(p.batchId, by, `OMC_${p.kind}`, c, p.reason);
}

/** The Convener finalises once more than half endorse: accepted proposals are applied; the PL, HOD and Dean are told. */
export async function finalise(user: { id: string; name: string }, batchId: string) {
  const { omc } = await guard(user, batchId);
  if (omc.convenerId !== user.id) throw new Error("Only the OMC Convener finalises.");
  const t = tally(omc.members, (await endorsementsOf(batchId)).map((e) => ({ memberId: e.memberId, yes: e.endorse })));
  if (!t.carried) throw new Error(`More than half of the members must endorse first (endorsed ${t.yes} of ${t.total}; ${t.need} needed).`);
  const props = await proposalsOf(batchId);
  const out: Summary["proposals"] = [];
  for (const p of props) {
    const what = await describe(p);
    let outcome = "dropped by the Convener";
    if (p.status === "OPEN") {
      try { await apply(p, user); outcome = "applied"; await db.batchProposal.update({ where: { id: p.id }, data: { status: "ACCEPTED", decidedAt: new Date() } }); }
      catch (e) { outcome = `not applied: ${(e as Error).message}`; await db.batchProposal.update({ where: { id: p.id }, data: { status: "ACCEPTED", decidedAt: new Date() } }); }
    } else await db.batchProposal.update({ where: { id: p.id }, data: { decidedAt: new Date() } });
    out.push({ what, reason: p.reason, pl: p.plOpinion ? `${p.plOpinion === "AGREE" ? "agreed" : "disagreed"}${p.plComment ? `: ${p.plComment}` : ""}` : "no opinion given", outcome });
  }
  const cmp = await compareBatch(batchId);
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { degreeProgram: true, batchName: true, coordinatorId: true } });
  const summary: Summary = {
    batch: `${b?.degreeProgram} ${b?.batchName}`, finalisedBy: user.name, at: new Date().toISOString(), endorsed: `${t.yes} of ${t.total}`,
    courses: (cmp?.rows || []).filter((r) => r.now).map((r) => ({ code: r.now!.code, title: r.now!.title, ch: r.now!.ch, semester: r.now!.semester, tags: r.tags.map((x) => TAG_LABEL[x]) })),
    proposals: out,
  };
  await db.batchApproval.update({ where: { batchId }, data: { status: "APPROVED", finalisedAt: new Date(), finalisedById: user.id, summaryJson: JSON.stringify(summary) } });
  await writeAuditLog({ actorUserId: user.id, action: "BATCH_APPROVED_BY_OMC", entityType: "Batch", entityId: batchId, metadata: { endorsed: summary.endorsed, proposals: out.length } }).catch(() => null);
  const title = `${summary.batch} is approved by the OMC`;
  const body = `${summary.courses.length} courses · ${out.filter((x) => x.outcome === "applied").length} OMC proposal(s) applied · endorsed ${summary.endorsed} · finalised by ${user.name}.`;
  await notifyUsers([b?.coordinatorId], { kind: "REQUEST", title, body, href: `/coordinator/batch-review?batchId=${batchId}` });
  const chiefs = [...(await approverIds(omc.chairmanId, "HEAD_OF_DEPARTMENT", { departmentId: omc.departmentId }).catch(() => [])), ...(await approverIds(omc.chairmanId, "DEAN", { departmentId: omc.departmentId }).catch(() => []))];
  await notifyUsers(chiefs, { kind: "REQUEST", title, body, href: `/coordinator/batch-review?batchId=${batchId}` });
  await notifyUsers(omc.members.map((m) => m.id), { kind: "REQUEST", title, body, href: `/omc/batch-review?batchId=${batchId}`, exceptId: user.id });
  return summary;
}

/** Batches waiting for (or approved by) the OMC of a department. */
export async function queueFor(chairmanId: string, departmentId: string | null) {
  const rows = ((await db.batchApproval.findMany({ where: { chairmanId, ...(departmentId ? { departmentId } : {}) }, orderBy: { submittedAt: "desc" } }).catch(() => [])) as { batchId: string; status: string; submittedAt: Date; finalisedAt: Date | null }[]);
  const bs = await prisma.batch.findMany({ where: { id: { in: rows.map((r) => r.batchId).concat("none") } }, select: { id: true, degreeProgram: true, batchName: true, coordinator: { select: { name: true } } } });
  return rows.map((r) => ({ ...r, batch: bs.find((b) => b.id === r.batchId) })).filter((r) => r.batch);
}

export { sideText };
