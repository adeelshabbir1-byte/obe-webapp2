import crypto, { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { PdfDoc } from "./pdfDoc";
import { storePrivate } from "./sampleStorage";
import { OUTCOME_LABEL, VOTE_LABEL, canFinalise, tallyLine, tallyVotes, type CVote, type Outcome, type Rule, type VoteKind } from "./committeeCore";

// The committee engine's store: committees (OMC, BOS, Faculty Board, Academic Council) with their scope, mode and
// rules; members, including external members who sign in with a guest link that shows only that committee's items;
// meetings with attendance and signed minutes; items (a linked draft) with votes; the Convener's decision; the optional
// "Academic Council noted / approved" step. Other modules register what happens when an item of their kind is decided.

const db = prisma as unknown as Record<string, any>;
export const CMT_HINT = "Run prisma/migration_committee_engine.sql in Supabase first.";
export const TYPES: Record<string, string> = { BOS: "Board of Studies", OMC: "OMC", FACULTY_BOARD: "Faculty Board", ACADEMIC_COUNCIL: "Academic Council" };
export type Committee = { id: string; chairmanId: string; type: string; scope: string; scopeId: string | null; name: string; mode: "FULL" | "CONVENER_ONLY"; quorumPct: number; majorityPct: number; convenerId: string | null; councilStep: boolean };
export type Member = { id: string; committeeId: string; userId: string | null; name: string; email: string | null; organisation: string | null; external: boolean; tokenSetAt: Date | null };
export type Item = { id: string; committeeId: string; meetingId: string | null; kind: string; refId: string | null; title: string; summary: string | null; href: string | null; status: string; outcome: Outcome | null; decisionNote: string | null; decidedById: string | null; decidedAt: Date | null; meetingDate: Date | null; signedRef: string | null; signedName: string | null; councilStatus: string | null; councilDate: Date | null; councilRef: string | null; createdAt: Date };
export type Meeting = { id: string; committeeId: string; date: Date; venue: string | null; attendanceJson: string; status: string; minutesRef: string | null; minutesName: string | null };
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
export const ruleOf = (c: Committee): Rule => ({ kind: "QUORUM", quorumPct: c.quorumPct, majorityPct: c.majorityPct });

// ---- what happens when an item is decided (other modules register their kinds)
type Handler = (item: Item, outcome: Outcome, by: { id: string; name: string }) => Promise<void>;
const handlers = new Map<string, () => Promise<Handler>>();
export function onDecided(kind: string, load: () => Promise<Handler>) { handlers.set(kind, load); }

// ---- who may do what
type U = { id: string; role: string; name: string };
export async function committee(id: string) { return (await db.cmtCommittee.findUnique({ where: { id } })) as Committee | null; }
export async function membersOf(committeeId: string) { return (await db.cmtMember.findMany({ where: { committeeId }, orderBy: [{ external: "asc" }, { name: "asc" }] })) as Member[]; }
/** May this person set the committee up? The Institute Head; the Dean for a faculty; the HOD for a department. */
export function canManage(user: U, c: Pick<Committee, "scope" | "convenerId">) {
  return user.role === "CHAIRMAN" || (c.scope === "FACULTY" && user.role === "DEAN") || (c.scope === "DEPARTMENT" && ["HEAD_OF_DEPARTMENT", "DEAN"].includes(user.role)) || c.convenerId === user.id;
}
export async function committeesFor(chairmanId: string, user: U) {
  const all = (await db.cmtCommittee.findMany({ where: { chairmanId }, orderBy: [{ type: "asc" }, { name: "asc" }] }).catch(() => [])) as Committee[];
  const mine = new Set(((await db.cmtMember.findMany({ where: { userId: user.id }, select: { committeeId: true } }).catch(() => [])) as { committeeId: string }[]).map((m) => m.committeeId));
  const oversee = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "PROGRAM_COORDINATOR", "PROGRAM_LEAD"].includes(user.role);
  return all.filter((c) => oversee || mine.has(c.id) || c.convenerId === user.id);
}

export async function saveCommittee(user: U, chairmanId: string, d: Partial<Committee> & { id?: string }) {
  const data = {
    type: TYPES[String(d.type)] ? String(d.type) : "BOS", scope: ["INSTITUTE", "FACULTY", "DEPARTMENT"].includes(String(d.scope)) ? String(d.scope) : "INSTITUTE", scopeId: d.scopeId || null,
    name: String(d.name || "").trim().slice(0, 160), mode: d.mode === "CONVENER_ONLY" ? "CONVENER_ONLY" : "FULL",
    quorumPct: Math.max(1, Math.min(100, Number(d.quorumPct) || 50)), majorityPct: Math.max(1, Math.min(99, Number(d.majorityPct) || 50)),
    convenerId: d.convenerId || null, councilStep: d.councilStep === true || (d.councilStep as unknown) === "true",
  };
  if (!data.name) throw new Error("Give the committee a name.");
  if (d.id) {
    const cur = await committee(d.id);
    if (!cur || cur.chairmanId !== chairmanId) throw new Error("Not found.");
    if (!canManage(user, cur)) throw new Error("Only the Institute Head, the Dean or HOD of its scope, or its Convener changes this committee.");
    await db.cmtCommittee.update({ where: { id: d.id }, data });
    return d.id;
  }
  if (!canManage(user, { scope: data.scope, convenerId: null })) throw new Error("Only the Institute Head (or the Dean / HOD for their own scope) sets up a committee.");
  const id = randomUUID();
  await db.cmtCommittee.create({ data: { id, chairmanId, ...data, createdById: user.id } });
  if (data.convenerId) await addMember(user, id, { userId: data.convenerId }).catch(() => null);
  await writeAuditLog({ actorUserId: user.id, action: "COMMITTEE_CREATED", entityType: "CmtCommittee", entityId: id, metadata: { type: data.type, mode: data.mode } });
  return id;
}

/** Adds a member. An external member gets a guest link (shown once) that opens only this committee's items. */
export async function addMember(user: U, committeeId: string, m: { userId?: string | null; name?: string; email?: string; organisation?: string; external?: boolean }) {
  const c = await committee(committeeId);
  if (!c) throw new Error("Not found.");
  if (!canManage(user, c)) throw new Error("Only the committee's Convener or the person who set it up adds members.");
  if (m.userId) {
    if (await db.cmtMember.count({ where: { committeeId, userId: m.userId } })) return { id: null, link: null };
    const u = await prisma.user.findUnique({ where: { id: m.userId }, select: { name: true, email: true } });
    if (!u) throw new Error("Choose a member of staff.");
    const id = randomUUID();
    await db.cmtMember.create({ data: { id, committeeId, userId: m.userId, name: u.name, email: u.email, external: false } });
    return { id, link: null };
  }
  const name = String(m.name || "").trim();
  if (!name) throw new Error("Give the external member's name.");
  const id = randomUUID(), token = crypto.randomBytes(24).toString("base64url");
  await db.cmtMember.create({ data: { id, committeeId, name: name.slice(0, 120), email: String(m.email || "").trim().slice(0, 160) || null, organisation: String(m.organisation || "").trim().slice(0, 200) || null, external: true, tokenHash: hash(token), tokenSetAt: new Date() } });
  return { id, link: `/committee-guest/${token}` };
}
export async function newGuestLink(user: U, memberId: string) {
  const m = (await db.cmtMember.findUnique({ where: { id: memberId } })) as Member | null;
  const c = m ? await committee(m.committeeId) : null;
  if (!m || !c || !m.external) throw new Error("Not an external member.");
  if (!canManage(user, c)) throw new Error("Only the Convener issues guest links.");
  const token = crypto.randomBytes(24).toString("base64url");
  await db.cmtMember.update({ where: { id: memberId }, data: { tokenHash: hash(token), tokenSetAt: new Date() } });
  return `/committee-guest/${token}`;
}
export async function removeMember(user: U, memberId: string) {
  const m = (await db.cmtMember.findUnique({ where: { id: memberId } })) as Member | null;
  const c = m ? await committee(m.committeeId) : null;
  if (!m || !c) throw new Error("Not found.");
  if (!canManage(user, c)) throw new Error("Only the Convener removes members.");
  await db.cmtMember.delete({ where: { id: memberId } });
}
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
/** A guest link: the external member and their committee — nothing else. */
export async function guest(token: string) {
  if (!token || token.length < 20) return null;
  const m = (await db.cmtMember.findUnique({ where: { tokenHash: hash(token) } }).catch(() => null)) as Member | null;
  if (!m || !m.external) return null;
  const c = await committee(m.committeeId);
  return c ? { member: m, committee: c } : null;
}

// ---- meetings and items
export async function addMeeting(user: U, committeeId: string, d: { date: string; venue?: string }) {
  const c = await committee(committeeId);
  if (!c || !canManage(user, c)) throw new Error("Only the Convener schedules meetings.");
  const date = new Date(d.date);
  if (isNaN(+date)) throw new Error("Choose the date.");
  const id = randomUUID();
  await db.cmtMeeting.create({ data: { id, committeeId, date, venue: String(d.venue || "").slice(0, 200) || null } });
  const ms = await membersOf(committeeId);
  await notifyUsers(ms.map((m) => m.userId), { kind: "MEETING", title: `${c.name}: meeting on ${date.toISOString().slice(0, 10)}`, body: d.venue || undefined, href: `/committees/${committeeId}` }).catch(() => null);
  return id;
}
export async function setAttendance(user: U, meetingId: string, present: string[]) {
  const mt = (await db.cmtMeeting.findUnique({ where: { id: meetingId } })) as Meeting | null;
  const c = mt ? await committee(mt.committeeId) : null;
  if (!mt || !c || !canManage(user, c)) throw new Error("Only the Convener records attendance.");
  const ids = new Set((await membersOf(c.id)).map((m) => m.id));
  await db.cmtMeeting.update({ where: { id: meetingId }, data: { attendanceJson: JSON.stringify(present.filter((p) => ids.has(p))), status: "HELD" } });
}
/** Puts a draft (or a plain item) on the agenda. Modules call this with their own kind and id ("Send to BOS"). */
export async function addItem(by: { id: string } | null, committeeId: string, d: { kind?: string; refId?: string | null; title: string; summary?: string | null; href?: string | null; meetingId?: string | null }) {
  const c = await committee(committeeId);
  if (!c) throw new Error("Committee not found.");
  if (!d.title.trim()) throw new Error("Give the item a title.");
  if (d.kind && d.refId && (await db.cmtItem.count({ where: { committeeId, kind: d.kind, refId: d.refId, status: "OPEN" } }))) throw new Error("This is already on the committee's agenda.");
  const id = randomUUID();
  await db.cmtItem.create({ data: { id, committeeId, meetingId: d.meetingId || null, kind: d.kind || "GENERIC", refId: d.refId || null, title: d.title.trim().slice(0, 300), summary: d.summary?.slice(0, 4000) || null, href: d.href || null, createdById: by?.id || null } });
  const ms = await membersOf(committeeId);
  await notifyUsers([c.convenerId, ...ms.map((m) => m.userId)], { kind: "REQUEST", title: `${c.name}: new agenda item`, body: d.title.slice(0, 200), href: `/committees/${committeeId}`, exceptId: by?.id }).catch(() => null);
  return id;
}
export async function itemsOf(committeeId: string, status?: string) {
  return (await db.cmtItem.findMany({ where: { committeeId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" } })) as Item[];
}
export async function votesOf(itemIds: string[]) {
  return (await db.cmtVote.findMany({ where: { itemId: { in: itemIds.concat("none") } }, orderBy: { at: "asc" } })) as { itemId: string; memberId: string; vote: VoteKind; comment: string | null; at: Date }[];
}
/** The votes of an item as the engine counts them (attendance of its meeting counts towards the quorum). */
export async function itemTally(item: Item, c: Committee, members?: Member[]) {
  const ms = members || (await membersOf(c.id));
  const vs = await votesOf([item.id]);
  const mt = item.meetingId ? ((await db.cmtMeeting.findUnique({ where: { id: item.meetingId } })) as Meeting | null) : null;
  const t = tallyVotes(ms.map((m) => ({ id: m.id, name: m.name })), vs.map((v) => ({ memberId: v.memberId, vote: v.vote, comment: v.comment })), ruleOf(c), mt ? J<string[]>(mt.attendanceJson, []) : null);
  return { t, votes: vs.map((v) => ({ ...v, name: ms.find((m) => m.id === v.memberId)?.name || "—" })) };
}
/** One member's vote (staff member, or an external member through the guest link). */
export async function vote(memberId: string, itemId: string, v: VoteKind, comment: string) {
  const item = (await db.cmtItem.findUnique({ where: { id: itemId } })) as Item | null;
  const m = (await db.cmtMember.findUnique({ where: { id: memberId } })) as Member | null;
  if (!item || !m || m.committeeId !== item.committeeId) throw new Error("Not an item of your committee.");
  const c = await committee(item.committeeId);
  if (c?.mode === "CONVENER_ONLY") throw new Error("This committee's decisions are recorded by the Convener; there is no voting.");
  if (item.status !== "OPEN") throw new Error("This item has been decided.");
  if (!VOTE_LABEL[v]) throw new Error("Choose approve, approve with changes or reject.");
  if (v !== "APPROVE" && comment.trim().length < 3) throw new Error("Say what should change, or why you reject it.");
  await db.cmtVote.upsert({ where: { itemId_memberId: { itemId, memberId } }, create: { itemId, memberId, vote: v, comment: comment.trim().slice(0, 2000) || null }, update: { vote: v, comment: comment.trim().slice(0, 2000) || null, at: new Date() } });
}
export async function memberFor(userId: string, committeeId: string) {
  return (await db.cmtMember.findFirst({ where: { committeeId, userId } })) as Member | null;
}

/**
 * The Convener finalises an item. Full committee: needs the quorum and follows the majority (or defers). Convener-only:
 * the Convener records the decision with the meeting date and the signed-minutes PDF — one click.
 */
export async function finalise(user: U, itemId: string, d: { outcome: Outcome; note?: string; meetingDate?: string; signed?: { buf: Buffer; name: string; type: string } | null }) {
  const item = (await db.cmtItem.findUnique({ where: { id: itemId } })) as Item | null;
  const c = item ? await committee(item.committeeId) : null;
  if (!item || !c) throw new Error("Not found.");
  if (c.convenerId !== user.id && !(user.role === "CHAIRMAN" && !c.convenerId)) throw new Error("Only the Convener finalises an item.");
  if (item.status !== "OPEN") throw new Error("Already decided.");
  if (!OUTCOME_LABEL[d.outcome]) throw new Error("Choose the decision.");
  const tally = c.mode === "FULL" ? (await itemTally(item, c)).t : null;
  const why = canFinalise(c.mode, tally, d.outcome);
  if (why) throw new Error(why);
  if (c.mode === "CONVENER_ONLY") {
    if (!d.meetingDate || isNaN(+new Date(d.meetingDate))) throw new Error("Give the meeting date.");
    if (!d.signed) throw new Error("Attach the signed minutes (PDF).");
  }
  const signedRef = d.signed ? await storePrivate(d.signed.buf, d.signed.name, d.signed.type || "application/pdf", `minutes-${c.id}`) : null;
  await db.cmtItem.update({ where: { id: itemId }, data: { status: "DECIDED", outcome: d.outcome, decisionNote: (d.note || "").slice(0, 2000) || null, decidedById: user.id, decidedAt: new Date(), meetingDate: d.meetingDate ? new Date(d.meetingDate) : null, ...(signedRef ? { signedRef, signedName: d.signed!.name.slice(0, 200) } : {}) } });
  await writeAuditLog({ actorUserId: user.id, action: "COMMITTEE_ITEM_DECIDED", entityType: "CmtItem", entityId: itemId, metadata: { committee: c.name, outcome: d.outcome, tally: tally ? tallyLine(tally) : "convener" } });
  const h = handlers.get(item.kind);
  if (h && d.outcome !== "DEFERRED") await (await h())({ ...item, outcome: d.outcome }, d.outcome, user);
  if (d.outcome === "DEFERRED") await db.cmtItem.update({ where: { id: itemId }, data: { status: "OPEN", outcome: "DEFERRED" } }); // stays on the agenda
}
/** Optional: "Academic Council noted / approved", with a date and a document. */
export async function councilNote(user: U, itemId: string, d: { status: "NOTED" | "APPROVED"; date: string; doc?: { buf: Buffer; name: string; type: string } | null }) {
  const item = (await db.cmtItem.findUnique({ where: { id: itemId } })) as Item | null;
  const c = item ? await committee(item.committeeId) : null;
  if (!item || !c || !c.councilStep) throw new Error("This committee has no Academic Council step.");
  if (!canManage(user, c)) throw new Error("Only the Convener records the Academic Council's decision.");
  if (item.status !== "DECIDED") throw new Error("Decide the item first.");
  const ref = d.doc ? await storePrivate(d.doc.buf, d.doc.name, d.doc.type || "application/pdf", `council-${c.id}`) : null;
  await db.cmtItem.update({ where: { id: itemId }, data: { councilStatus: d.status === "APPROVED" ? "APPROVED" : "NOTED", councilDate: new Date(d.date), ...(ref ? { councilRef: ref } : {}) } });
}
export async function uploadMinutes(user: U, meetingId: string, f: { buf: Buffer; name: string; type: string }) {
  const mt = (await db.cmtMeeting.findUnique({ where: { id: meetingId } })) as Meeting | null;
  const c = mt ? await committee(mt.committeeId) : null;
  if (!mt || !c || !canManage(user, c)) throw new Error("Only the Convener uploads the signed minutes.");
  const ref = await storePrivate(f.buf, f.name, f.type || "application/pdf", `minutes-${c.id}`);
  await db.cmtMeeting.update({ where: { id: meetingId }, data: { minutesRef: ref, minutesName: f.name.slice(0, 200), status: "MINUTED" } });
}

/** Minutes PDF of a meeting: attendance, each item with its votes and decision, signature lines. */
export async function minutesPdf(meetingId: string) {
  const mt = (await db.cmtMeeting.findUnique({ where: { id: meetingId } })) as Meeting;
  const c = (await committee(mt.committeeId))!;
  const ms = await membersOf(c.id);
  const present = new Set(J<string[]>(mt.attendanceJson, []));
  const items = (await db.cmtItem.findMany({ where: { committeeId: c.id, meetingId }, orderBy: { createdAt: "asc" } })) as Item[];
  const convener = c.convenerId ? await prisma.user.findUnique({ where: { id: c.convenerId }, select: { name: true } }) : null;
  const pdf = await PdfDoc.create(`${c.name} — minutes`);
  pdf.title(`${c.name} — minutes`, `Meeting of ${mt.date.toISOString().slice(0, 10)}${mt.venue ? ` · ${mt.venue}` : ""}`);
  pdf.kv([["Committee", `${TYPES[c.type] || c.type} (${c.mode === "FULL" ? `full committee · quorum ${c.quorumPct}% · majority over ${c.majorityPct}%` : "Convener only"})`], ["Convener", convener?.name || "—"], ["Present", ms.filter((m) => present.has(m.id)).map((m) => `${m.name}${m.external ? ` (external${m.organisation ? `, ${m.organisation}` : ""})` : ""}`).join(", ") || "—"], ["Absent", ms.filter((m) => !present.has(m.id)).map((m) => m.name).join(", ") || "—"]]);
  for (const [i, it] of items.entries()) {
    pdf.text(`${i + 1}. ${it.title}`, { bold: true, gap: 6 });
    if (it.summary) pdf.text(it.summary, { size: 9 });
    const { t, votes } = await itemTally(it, c, ms);
    if (votes.length) pdf.table([["Member", 160], ["Vote", 120], ["Comment", 240]], votes.map((v) => [v.name, VOTE_LABEL[v.vote], v.comment || ""]), { size: 8.5 });
    if (c.mode === "FULL") pdf.note(tallyLine(t));
    pdf.text(`Decision: ${it.outcome ? OUTCOME_LABEL[it.outcome] : "Pending"}${it.decisionNote ? ` — ${it.decisionNote}` : ""}${it.councilStatus ? ` · Academic Council ${it.councilStatus.toLowerCase()} ${it.councilDate ? it.councilDate.toISOString().slice(0, 10) : ""}` : ""}`, { size: 9.5 });
  }
  pdf.text(" ", { gap: 30 });
  pdf.text("Convener: ______________________          Secretary: ______________________          Date: __________", { size: 9.5 });
  return { bytes: await pdf.save(), name: `${c.name.replace(/[^A-Za-z0-9]+/g, "-")}-minutes-${mt.date.toISOString().slice(0, 10)}.pdf` };
}
export type { CVote };
