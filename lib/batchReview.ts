import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { departmentOfBatch, omcCommittee, majority, isConvener, onCommittee } from "./omcCommittee";

// OMC approval of a new batch's curriculum. The Program Lead sends it (BatchReview SUBMITTED). OMC members review it
// step by step and make proposals with reasons (course → GA, semester, name, Subject Expert, other); the Program Lead
// is told and gives his opinion on each. Every member endorses the current set ("Endorsed 3 of 5"); a new proposal
// clears the endorsements. On a majority the Convener finalises: proposals he keeps are applied, the batch is APPROVED,
// and the Program Lead, HOD and Dean get the final version with a summary of changes. No sending back.

const db = prisma as unknown as Record<string, any>;
export type Proposal = { id: string; batchId: string; courseId: string | null; kind: string; payload: any; text: string; reason: string; byId: string; byName: string; at: Date; status: string; plOpinion: string | null; plComment: string | null; plAt: Date | null };
export const KINDS: Record<string, string> = { GA_ADD: "Map the course to a GA", GA_REMOVE: "Remove a course → GA mapping", SEMESTER: "Move to another semester", NAME: "Rename / recode", SE: "Change the Subject Expert", OTHER: "Other" };

export async function reviewState(batchId: string) {
  const review = await db.batchReview.findUnique({ where: { batchId } }).catch(() => null);
  const proposals = ((await db.batchReviewProposal.findMany({ where: { batchId }, orderBy: { at: "asc" } }).catch(() => [])) as Proposal[]);
  const endorse = ((await db.batchReviewEndorse.findMany({ where: { batchId } }).catch(() => [])) as { userId: string; userName: string; endorse: boolean; comment: string | null; at: Date }[]);
  const d = await departmentOfBatch(batchId);
  const com = await omcCommittee(d.chairmanId, d.departmentId);
  const yes = endorse.filter((e) => e.endorse && com.all.includes(e.userId));
  const waiting = com.all.filter((id) => !endorse.some((e) => e.userId === id)).map((id) => com.names.get(id) || "?");
  return { review, proposals, endorse, com, yes: yes.length, total: com.all.length, waiting, canFinalise: majority(yes.length, com.all.length), chairmanId: d.chairmanId, departmentId: d.departmentId };
}

async function people(batchId: string, chairmanId: string, departmentId: string | null) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinatorId: true, degreeProgram: true, batchName: true } });
  const hods = await prisma.user.findMany({ where: { isActive: true, OR: [{ id: chairmanId }, { AND: [{ managedById: chairmanId }, { extraRoles: { hasSome: ["HOD", "DEAN"] } }, ...(departmentId ? [{ OR: [{ departmentId }, { departmentId: null }] }] : [])] }] }, select: { id: true } }).catch(() => []);
  const dean = departmentId ? ((await db.orgPosition.findMany({ where: { chairmanId, role: { in: ["HOD", "DEAN"] }, offAt: null }, select: { holderId: true } }).catch(() => [])) as { holderId: string | null }[]).map((p) => p.holderId) : [];
  return { b, others: [...hods.map((h) => h.id), ...dean].filter((x): x is string => !!x) };
}

export async function act(user: { id: string; name: string; role: string }, batchId: string, body: any): Promise<{ ok: true; msg?: string } | { error: string }> {
  const st = await reviewState(batchId);
  const { b } = await people(batchId, st.chairmanId, st.departmentId);
  if (!b) return { error: "Batch not found." };
  const label = `${b.degreeProgram} — ${b.batchName}`;
  const href = `/omc/batch-review/${batchId}`;
  const lead = user.id === b.coordinatorId;
  const member = onCommittee(st.com, user.id) || user.role === "OMC";
  const a = String(body.action || "");

  if (a === "submit") {
    if (!lead) return { error: "Only the batch's Program Lead sends it." };
    if (st.review) return { error: st.review.status === "APPROVED" ? "Already approved by the OMC." : "Already with the OMC." };
    await db.batchReview.create({ data: { batchId, status: "SUBMITTED", submittedById: user.id, submittedAt: new Date() } });
    await notifyUsers(st.com.all, { kind: "BATCH_REVIEW", title: `New batch to approve: ${label}`, body: `${user.name} sent the curriculum of ${label} for OMC approval. Start with the comparison.`, href, exceptId: user.id });
    return { ok: true, msg: "Sent to the OMC." };
  }
  if (!st.review) return { error: "The batch has not been sent to the OMC yet." };
  const open = st.review.status !== "APPROVED";

  if (a === "propose") {
    if (!member) return { error: "Only OMC members make proposals." };
    if (!open) return { error: "Already finalised." };
    const kind = String(body.kind || "OTHER"); if (!KINDS[kind]) return { error: "Unknown kind." };
    const reason = String(body.reason || "").trim(); if (!reason) return { error: "Give the reason." };
    const payload = body.payload || Object.fromEntries(["ploId", "semester", "title", "code", "userId"].filter((k) => body[k]).map((k) => [k, body[k]]));
    const course = body.courseId ? await prisma.course.findUnique({ where: { id: String(body.courseId) }, select: { code: true, title: true } }) : null;
    const plo = payload.ploId ? await prisma.pLO.findUnique({ where: { id: String(payload.ploId) }, select: { number: true, title: true } }) : null;
    const se = payload.userId ? await prisma.user.findUnique({ where: { id: String(payload.userId) }, select: { name: true } }) : null;
    const what = kind === "GA_ADD" ? `map to GA${plo?.number} ${plo?.title || ""}` : kind === "GA_REMOVE" ? `remove GA${plo?.number} ${plo?.title || ""}` : kind === "SEMESTER" ? `move to semester ${payload.semester}` : kind === "NAME" ? `rename to ${[payload.code, payload.title].filter(Boolean).join(" ")}` : kind === "SE" ? `Subject Expert → ${se?.name || "?"}` : String(body.text || "other");
    const text = `${course ? `${course.code} ${course.title}: ` : ""}${what}`.slice(0, 500);
    await db.batchReviewProposal.create({ data: { id: randomUUID(), batchId, courseId: body.courseId || null, kind, payload: JSON.stringify(payload), text, reason: reason.slice(0, 2000), byId: user.id, byName: user.name, status: "PROPOSED" } });
    await db.batchReviewEndorse.deleteMany({ where: { batchId } }); // the set changed — endorse again
    await notifyUsers([b.coordinatorId], { kind: "BATCH_REVIEW", title: `OMC proposal on ${label}`, body: `${user.name}: ${text} — ${reason}. Please give your opinion.`, href: `/coordinator/batches/review?batchId=${batchId}` });
    await notifyUsers(st.com.all, { kind: "BATCH_REVIEW", title: `New proposal on ${label} — endorse again`, body: `${user.name}: ${text}`, href, exceptId: user.id });
    return { ok: true };
  }
  if (a === "opinion") {
    if (!lead) return { error: "Only the Program Lead gives opinions." };
    const p = st.proposals.find((x) => x.id === body.proposalId); if (!p) return { error: "Proposal not found." };
    await db.batchReviewProposal.update({ where: { id: p.id }, data: { plOpinion: body.agree === "no" || body.agree === false ? "DISAGREE" : "AGREE", plComment: String(body.comment || body.note || "").slice(0, 2000) || null, plAt: new Date() } });
    await notifyUsers(st.com.all, { kind: "BATCH_REVIEW", title: `Program Lead's opinion on ${label}`, body: `${p.text}: ${body.agree === "no" || body.agree === false ? "disagrees" : "agrees"}${body.comment || body.note ? ` — ${body.comment || body.note}` : ""}`, href });
    return { ok: true };
  }
  if (a === "withdraw" || a === "keep") {
    const p = st.proposals.find((x) => x.id === body.proposalId); if (!p) return { error: "Proposal not found." };
    if (!(isConvener(st.com, user.id) || p.byId === user.id)) return { error: "Only the Convener or the proposer." };
    await db.batchReviewProposal.update({ where: { id: p.id }, data: { status: a === "withdraw" ? "WITHDRAWN" : "PROPOSED" } });
    await db.batchReviewEndorse.deleteMany({ where: { batchId } });
    return { ok: true };
  }
  if (a === "endorse") {
    if (!onCommittee(st.com, user.id)) return { error: "You are not on this department's OMC." };
    if (!open) return { error: "Already finalised." };
    const yes = !(body.endorse === false || body.endorse === "no");
    await db.batchReviewEndorse.upsert({ where: { batchId_userId: { batchId, userId: user.id } }, create: { batchId, userId: user.id, userName: user.name, endorse: yes, comment: body.comment || body.note || null }, update: { endorse: yes, comment: body.comment || body.note || null, at: new Date() } });
    const after = await reviewState(batchId);
    if (after.canFinalise && st.com.convenerId) await notifyUsers([st.com.convenerId], { kind: "BATCH_REVIEW", title: `${label}: majority endorsed — finalise`, body: `Endorsed ${after.yes} of ${after.total}.`, href });
    return { ok: true };
  }
  if (a === "finalise") {
    if (!isConvener(st.com, user.id)) return { error: "Only the OMC Convener finalises." };
    if (!open) return { error: "Already finalised." };
    if (!st.canFinalise) return { error: `A majority must endorse first (endorsed ${st.yes} of ${st.total}).` };
    const applied: string[] = [];
    for (const p of st.proposals.filter((x) => x.status === "PROPOSED")) {
      const res = await apply(p, user.id).catch((e) => `not applied (${(e as Error).message})`);
      await db.batchReviewProposal.update({ where: { id: p.id }, data: { status: res.startsWith("not applied") ? "FAILED" : "ACCEPTED" } });
      applied.push(`${p.text} — ${res}`);
    }
    const summary = applied.length ? applied.map((x) => `• ${x}`).join("\n") : "Approved as sent — no changes.";
    await db.batchReview.update({ where: { batchId }, data: { status: "APPROVED", decidedById: user.id, decidedByName: user.name, decidedAt: new Date(), summary } });
    const { others } = await people(batchId, st.chairmanId, st.departmentId);
    await notifyUsers([b.coordinatorId, ...others], { kind: "BATCH_REVIEW", title: `${label} approved by the OMC`, body: `Finalised by ${user.name}. Changes made:\n${summary}`, href: `/coordinator/batches/review?batchId=${batchId}` });
    await notifyUsers(st.com.all, { kind: "BATCH_REVIEW", title: `${label} finalised`, body: summary, href, exceptId: user.id });
    return { ok: true, msg: "Finalised." };
  }
  return { error: "Unknown action." };
}

async function apply(p: Proposal, byId: string): Promise<string> {
  const c = p.courseId ? await prisma.course.findUnique({ where: { id: p.courseId }, select: { id: true, code: true } }) : null;
  let pl: any = {}; try { pl = typeof p.payload === "string" ? JSON.parse(p.payload) : p.payload || {}; } catch { pl = {}; }
  switch (p.kind) {
    case "GA_ADD": if (!c || !pl.ploId) return "noted";
      await prisma.coursePloMapping.upsert({ where: { courseId_ploId: { courseId: c.id, ploId: pl.ploId } }, create: { courseId: c.id, ploId: pl.ploId, assignedById: byId, source: "MANUAL" }, update: {} }); return "applied";
    case "GA_REMOVE": if (!c || !pl.ploId) return "noted";
      await prisma.coursePloMapping.deleteMany({ where: { courseId: c.id, ploId: pl.ploId } }); return "applied";
    case "SEMESTER": if (!c || !pl.semester) return "noted";
      await prisma.course.update({ where: { id: c.id }, data: { semesterNumber: Number(pl.semester) } }); return "applied";
    case "NAME": if (!c) return "noted";
      await prisma.course.update({ where: { id: c.id }, data: { ...(pl.title ? { title: String(pl.title) } : {}), ...(pl.code ? { code: String(pl.code) } : {}) } }); return "applied";
    case "SE": if (!c || !pl.userId) return "noted";
      await prisma.course.update({ where: { id: c.id }, data: { subjectExpertId: String(pl.userId) } }); return "applied";
    default: return "noted";
  }
}
