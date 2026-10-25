import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { departmentOfCourse, omcCommittee, isConvener } from "./omcCommittee";

// OMC rules.
//  · In-semester requests (weight exceptions, template changes, a course's GA for the term): two OMC approvals approve,
//    two rejections (each with a reason) reject. If the Convener has given the course a 3-member panel, only the panel
//    votes and 2 of 3 decide. Requests waiting longer than OVERDUE_DAYS are flagged to the Convener.
//  · Category limits on Assessment Rules: the Convener opens a round, members give opinions per category, the Convener
//    decides and the limits lock until he reopens them. Every round is kept.

const db = prisma as unknown as Record<string, any>;
export const OVERDUE_DAYS = 5;
export type Vote = { userId: string; userName: string; approve: boolean; reason: string | null; at: Date };

export async function panelOf(courseId: string): Promise<string[]> {
  const p = await db.omcPanel.findUnique({ where: { courseId } }).catch(() => null);
  try { return p ? (JSON.parse(p.memberIds) as string[]) : []; } catch { return []; }
}

export async function votesOf(kind: string, requestId: string): Promise<Vote[]> {
  return ((await db.requestVote.findMany({ where: { kind, requestId }, orderBy: { at: "asc" } }).catch(() => [])) as Vote[]);
}

/** Record a vote; returns the outcome once 2 approvals / 2 rejections are in. */
export async function requestVote(o: { kind: string; requestId: string; courseId: string; user: { id: string; name: string }; approve: boolean; reason?: string | null }): Promise<{ error: string } | { decided: "approved" | "rejected" | null; message: string; votes: Vote[] }> {
  const panel = await panelOf(o.courseId);
  if (panel.length && !panel.includes(o.user.id)) return { error: "This course has an OMC panel — only its 3 members decide its requests." };
  if (!o.approve && !String(o.reason || "").trim()) return { error: "Give the reason for rejecting." };
  await db.requestVote.upsert({ where: { kind_requestId_userId: { kind: o.kind, requestId: o.requestId, userId: o.user.id } }, create: { kind: o.kind, requestId: o.requestId, userId: o.user.id, userName: o.user.name, approve: o.approve, reason: o.reason || null }, update: { approve: o.approve, reason: o.reason || null, at: new Date() } });
  const votes = (await votesOf(o.kind, o.requestId)).filter((v) => !panel.length || panel.includes(v.userId));
  const yes = votes.filter((v) => v.approve), no = votes.filter((v) => !v.approve);
  if (yes.length >= 2) return { decided: "approved", message: `Approved by ${yes.map((v) => v.userName).join(" and ")}.`, votes };
  if (no.length >= 2) return { decided: "rejected", message: `Rejected by ${no.map((v) => v.userName).join(" and ")}.`, votes };
  return { decided: null, message: `Your vote is recorded — waiting: ${yes.length} of 2 ${o.approve ? "approvals" : "rejections"}${panel.length ? " (course panel)" : ""}.`, votes };
}

export async function setPanel(convener: { id: string }, courseId: string, memberIds: string[]) {
  const d = await departmentOfCourse(courseId);
  const com = await omcCommittee(d.chairmanId, d.departmentId);
  if (!isConvener(com, convener.id)) return { error: "Only the OMC Convener assigns panels." };
  const ids = Array.from(new Set(memberIds.filter(Boolean)));
  if (ids.length && ids.length !== 3) return { error: "A panel has exactly 3 members." };
  if (!ids.length) { await db.omcPanel.deleteMany({ where: { courseId } }); return { ok: true }; }
  await db.omcPanel.upsert({ where: { courseId }, create: { courseId, memberIds: JSON.stringify(ids), byId: convener.id }, update: { memberIds: JSON.stringify(ids), byId: convener.id, at: new Date() } });
  await notifyUsers(ids, { kind: "OMC_PANEL", title: "You are on a course's OMC panel", body: "Requests on this course come to you; 2 of 3 decide.", href: "/omc/queue" });
  return { ok: true };
}

// ── Category limits ────────────────────────────────────────────────────────────────────────────────────────────────
export type RuleRound = { id: string; chairmanId: string; status: string; openedById: string; openedAt: Date; lockedById: string | null; lockedAt: Date | null; decision: string | null };
export async function rounds(chairmanId: string): Promise<RuleRound[]> {
  return ((await db.ruleRound.findMany({ where: { chairmanId }, orderBy: { openedAt: "desc" } }).catch(() => [])) as RuleRound[]);
}
/** Limits are locked when there is a round and the latest one is LOCKED. With no round at all, editing works as before. */
export async function limitsLocked(chairmanId: string) {
  const r = (await rounds(chairmanId))[0];
  return r ? r.status === "LOCKED" : false;
}
export async function ruleAct(user: { id: string; name: string; managedById: string | null; role: string }, body: any): Promise<{ ok: true } | { error: string }> {
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  const com = await omcCommittee(chairmanId, null);
  const latest = (await rounds(chairmanId))[0];
  const a = String(body.action || "");
  if (a === "open") {
    if (!isConvener(com, user.id)) return { error: "Only the OMC Convener opens the limits." };
    if (latest?.status === "OPEN") return { error: "A round is already open." };
    await db.ruleRound.create({ data: { id: randomUUID(), chairmanId, status: "OPEN", openedById: user.id } });
    await notifyUsers(com.all, { kind: "OMC_RULES", title: "Assessment limits open for your opinion", body: `${user.name} opened the category limits. Give your figures per category.`, href: "/omc/assessment-rules", exceptId: user.id });
    return { ok: true };
  }
  if (a === "opinion") {
    if (!latest || latest.status !== "OPEN") return { error: "No round is open." };
    if (!com.all.includes(user.id) && user.role !== "OMC") return { error: "Only OMC members." };
    const category = String(body.category || ""); if (!category) return { error: "Choose the category." };
    const figures = String(body.figures || "").slice(0, 500);
    await db.ruleOpinion.upsert({ where: { roundId_userId_category: { roundId: latest.id, userId: user.id, category } }, create: { roundId: latest.id, userId: user.id, userName: user.name, category, figures, comment: body.comment || null }, update: { figures, comment: body.comment || null, at: new Date() } });
    return { ok: true };
  }
  if (a === "lock") {
    if (!isConvener(com, user.id)) return { error: "Only the OMC Convener finalises." };
    if (!latest || latest.status !== "OPEN") return { error: "No round is open." };
    await db.ruleRound.update({ where: { id: latest.id }, data: { status: "LOCKED", lockedById: user.id, lockedAt: new Date(), decision: String(body.decision || body.note || "").slice(0, 4000) || null } });
    await notifyUsers(com.all, { kind: "OMC_RULES", title: "Assessment limits finalised and locked", body: String(body.decision || body.note || ""), href: "/omc/assessment-rules", exceptId: user.id });
    return { ok: true };
  }
  return { error: "Unknown action." };
}
export async function opinions(roundId: string) {
  return ((await db.ruleOpinion.findMany({ where: { roundId }, orderBy: [{ category: "asc" }, { at: "asc" }] }).catch(() => [])) as { userId: string; userName: string; category: string; figures: string; comment: string | null; at: Date }[]);
}
