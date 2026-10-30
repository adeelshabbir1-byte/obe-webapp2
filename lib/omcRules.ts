import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { omcOf, omcOfCourse, isMember, type Member } from "./omcMembers";
import { tallyVotes } from "./committeeCore";

// The OMC's own rules.
//  · Assessment limits per course category (Core theory, Lab, General Education, Capstone, Elective): the Convener opens
//    the limits for comments, each member gives figures and a comment per category, the Convener sees them side by side
//    with today's figures and finalises each category. A finalised category is locked until reopened; every round is kept.
//    Subject Expert plans and teachers' changes are checked against the locked limits.
//  · Requests during the semester (weight exceptions, plan / topic changes): two OMC approvals approve at once, two
//    rejections with reasons reject; or the Convener gives courses a 3-member panel for the semester, and then only the
//    panel votes (2 of 3). Requests waiting more than OVERDUE_DAYS are flagged to the Convener.

const db = prisma as unknown as Record<string, any>;

export const CATEGORIES = [
  { key: "CORE", label: "Core theory" }, { key: "LAB", label: "Lab" }, { key: "GE", label: "General Education" },
  { key: "CAPSTONE", label: "Capstone / FYP" }, { key: "ELECTIVE", label: "Elective" },
] as const;
export type Category = (typeof CATEGORIES)[number]["key"];
export const HEADS = ["quiz", "assignment", "midterm", "final", "project", "lab"] as const;
export type Head = (typeof HEADS)[number];
export const HEAD_LABEL: Record<Head, string> = { quiz: "Quizzes", assignment: "Assignments", midterm: "Midterm", final: "Final", project: "Project", lab: "Lab" };
/** Per head: [min %, max %] (null = no limit); plus minimum numbers of quizzes and assignments. */
export type Figures = { [K in Head]?: [number | null, number | null] } & { minQuizzes?: number | null; minAssignments?: number | null };
export const OVERDUE_DAYS = 3;

export const DEFAULT_FIGURES: Record<Category, Figures> = {
  CORE: { quiz: [10, 15], assignment: [10, 15], midterm: [25, 30], final: [40, 50], minQuizzes: 3, minAssignments: 3 },
  LAB: { lab: [50, 70], final: [20, 40], minQuizzes: 0, minAssignments: 0 },
  GE: { quiz: [10, 20], assignment: [10, 20], midterm: [20, 30], final: [40, 50], minQuizzes: 2, minAssignments: 2 },
  CAPSTONE: { project: [60, 100], minQuizzes: 0, minAssignments: 0 },
  ELECTIVE: { quiz: [5, 15], assignment: [10, 20], midterm: [20, 30], final: [35, 50], minQuizzes: 2, minAssignments: 2 },
};

export function categoryOf(c: { courseType: string; title: string; creditHours?: number }): Category {
  const t = `${c.courseType} ${c.title}`.toLowerCase();
  if (/capstone|final year project|\bfyp\b/.test(t)) return "CAPSTONE";
  if (c.courseType.toLowerCase() === "lab" || /\blab\b/.test(c.title.toLowerCase())) return "LAB";
  if (/general education|\bge\b|gen\.? ?ed/.test(c.courseType.toLowerCase())) return "GE";
  if (/elective/.test(c.courseType.toLowerCase())) return "ELECTIVE";
  return "CORE";
}

export function cleanFigures(raw: unknown): Figures {
  const r = (raw || {}) as Record<string, unknown>;
  const n = (x: unknown) => { if (x === "" || x === null || x === undefined) return null; const v = Number(x); return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null; };
  const out: Figures = {};
  for (const h of HEADS) {
    const pair = Array.isArray(r[h]) ? (r[h] as unknown[]) : [r[`${h}Min`], r[`${h}Max`]];
    const lo = n(pair[0]), hi = n(pair[1]);
    if (lo !== null || hi !== null) { if (lo !== null && hi !== null && lo > hi) throw new Error(`${HEAD_LABEL[h]}: the lowest is above the highest.`); out[h] = [lo, hi]; }
  }
  const mq = n(r.minQuizzes), ma = n(r.minAssignments);
  if (mq !== null) out.minQuizzes = mq;
  if (ma !== null) out.minAssignments = ma;
  return out;
}
export const figuresLine = (f: Figures | null | undefined) => !f ? "—" : [...HEADS.filter((h) => f[h]).map((h) => `${HEAD_LABEL[h]} ${f[h]![0] ?? 0}–${f[h]![1] ?? 100}%`), f.minQuizzes ? `≥ ${f.minQuizzes} quizzes` : "", f.minAssignments ? `≥ ${f.minAssignments} assignments` : ""].filter(Boolean).join(" · ");

type LimitRow = { chairmanId: string; category: string; figuresJson: string; locked: boolean; lockedAt: Date | null; lockedById: string | null; roundId: string | null; historyJson: string };
export async function limitsOf(chairmanId: string) {
  const rows = ((await db.assessmentLimit.findMany({ where: { chairmanId } }).catch(() => [])) as LimitRow[]);
  return new Map(rows.map((r) => [r.category as Category, { ...r, figures: JSON.parse(r.figuresJson || "{}") as Figures, history: JSON.parse(r.historyJson || "[]") as { figures: Figures; at: string; byName: string; roundId: string | null }[] }]));
}

export type Round = { id: string; chairmanId: string; status: string; categories: Category[]; openedById: string; openedAt: Date; closedAt: Date | null };
export async function roundsOf(chairmanId: string): Promise<Round[]> {
  const rows = ((await db.assessmentLimitRound.findMany({ where: { chairmanId }, orderBy: { openedAt: "desc" } }).catch(() => [])) as (Omit<Round, "categories"> & { categoriesJson: string })[]);
  return rows.map((r) => ({ ...r, categories: JSON.parse(r.categoriesJson || "[]") }));
}
export async function opinionsOf(roundId: string) {
  return ((await db.assessmentLimitOpinion.findMany({ where: { roundId }, orderBy: { at: "asc" } }).catch(() => [])) as { roundId: string; memberId: string; category: string; figuresJson: string; comment: string | null; at: Date }[])
    .map((o) => ({ ...o, figures: JSON.parse(o.figuresJson || "{}") as Figures }));
}

/** The institute's OMC Convener(s): any department's Convener may run the institute's limits. */
async function conveners(chairmanId: string) {
  const ids = new Set<string>();
  const pos = ((await db.orgPosition.findMany({ where: { chairmanId, role: "OMC_CONVENER" } }).catch(() => [])) as { holderId: string | null }[]);
  for (const p of pos) if (p.holderId) ids.add(p.holderId);
  for (const u of await prisma.user.findMany({ where: { extraRoles: { has: "OMC_CONVENER" }, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] } as never, select: { id: true } }).catch(() => [])) ids.add(u.id);
  // No Convener named anywhere: whoever covers the position (the HOD, then the Dean, then the Institute Head).
  if (!ids.size) for (const d of await prisma.department.findMany({ where: { chairmanId }, select: { id: true } }).catch(() => [] as { id: string }[])) { const c = (await omcOf(chairmanId, d.id)).convenerId; if (c) ids.add(c); }
  return ids;
}
export async function isConvener(chairmanId: string, userId: string) { return (await conveners(chairmanId)).has(userId); }
/** Every OMC member of the institute (all departments). */
export async function allMembers(chairmanId: string): Promise<Member[]> {
  const depts = await prisma.department.findMany({ where: { chairmanId } as never, select: { id: true } }).catch(() => [] as { id: string }[]);
  const seen = new Map<string, Member>();
  for (const d of depts) for (const m of (await omcOf(chairmanId, d.id)).members) seen.set(m.id, m);
  if (!seen.size) for (const m of (await omcOf(chairmanId, null)).members) seen.set(m.id, m);
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** The Convener opens limits for comments (some or all categories). Locked categories in the round open again. */
export async function openRound(user: { id: string; name: string }, chairmanId: string, categories: string[]) {
  if (!(await isConvener(chairmanId, user.id))) throw new Error("Only the OMC Convener opens the limits for comments.");
  const cats = categories.filter((c) => CATEGORIES.some((k) => k.key === c));
  if (!cats.length) throw new Error("Choose at least one category.");
  if ((await roundsOf(chairmanId)).some((r) => r.status === "OPEN")) throw new Error("A round is already open — finalise it first.");
  const id = randomUUID();
  await db.assessmentLimitRound.create({ data: { id, chairmanId, categoriesJson: JSON.stringify(cats), openedById: user.id } });
  await db.assessmentLimit.updateMany({ where: { chairmanId, category: { in: cats } }, data: { locked: false } }).catch(() => null);
  await writeAuditLog({ actorUserId: user.id, action: "ASSESSMENT_LIMITS_OPENED", entityType: "AssessmentLimitRound", entityId: id, metadata: { categories: cats.join(",") } }).catch(() => null);
  await notifyUsers((await allMembers(chairmanId)).map((m) => m.id), { kind: "REQUEST", title: "The OMC's assessment limits are open for your opinion", body: `${user.name} opened: ${cats.map((c) => CATEGORIES.find((k) => k.key === c)?.label).join(", ")}.`, href: "/omc/assessment-rules#limits", exceptId: user.id });
  return id;
}

export async function giveOpinion(user: { id: string }, chairmanId: string, category: string, figures: unknown, comment: string) {
  const round = (await roundsOf(chairmanId)).find((r) => r.status === "OPEN");
  if (!round) throw new Error("The limits are not open for comments.");
  if (!round.categories.includes(category as Category)) throw new Error("That category is not open in this round.");
  if (!(await allMembers(chairmanId)).some((m) => m.id === user.id)) throw new Error("Only OMC members give opinions.");
  const f = cleanFigures(figures);
  await db.assessmentLimitOpinion.upsert({ where: { roundId_memberId_category: { roundId: round.id, memberId: user.id, category } }, create: { roundId: round.id, memberId: user.id, category, figuresJson: JSON.stringify(f), comment: comment.trim().slice(0, 1000) || null }, update: { figuresJson: JSON.stringify(f), comment: comment.trim().slice(0, 1000) || null, at: new Date() } });
}

/** The Convener decides one category: the figures are locked (until reopened) and kept in its history. */
export async function finaliseCategory(user: { id: string; name: string }, chairmanId: string, category: string, figures: unknown) {
  if (!(await isConvener(chairmanId, user.id))) throw new Error("Only the OMC Convener finalises the limits.");
  if (!CATEGORIES.some((k) => k.key === category)) throw new Error("Unknown category.");
  const f = cleanFigures(figures);
  const round = (await roundsOf(chairmanId)).find((r) => r.status === "OPEN") || null;
  const cur = (await limitsOf(chairmanId)).get(category as Category);
  const history = [...(cur?.history || []), { figures: f, at: new Date().toISOString(), byName: user.name, roundId: round?.id || null }];
  const data = { figuresJson: JSON.stringify(f), locked: true, lockedAt: new Date(), lockedById: user.id, roundId: round?.id || null, historyJson: JSON.stringify(history) };
  await db.assessmentLimit.upsert({ where: { chairmanId_category: { chairmanId, category } }, create: { chairmanId, category, ...data }, update: data });
  if (round) {
    const lim = await limitsOf(chairmanId);
    if (round.categories.every((c) => lim.get(c)?.locked && lim.get(c)?.roundId === round.id)) await db.assessmentLimitRound.update({ where: { id: round.id }, data: { status: "CLOSED", closedAt: new Date() } });
  }
  await writeAuditLog({ actorUserId: user.id, action: "ASSESSMENT_LIMIT_FINALISED", entityType: "AssessmentLimit", entityId: `${chairmanId}:${category}`, metadata: { figures: figuresLine(f) } }).catch(() => null);
}

/** A plan's weights checked against the locked limit of its category. Empty = within the limits. */
export async function limitBreaches(courseId: string, source: "SE" | "INSTRUCTOR", proposed?: Partial<Record<Head, number>>) {
  const c = await prisma.course.findUnique({ where: { id: courseId } });
  if (!c) return [];
  const chairmanId = (await prisma.user.findUnique({ where: { id: c.coordinatorId }, select: { managedById: true } }))?.managedById || "";
  const cat = categoryOf(c);
  const lim = (await limitsOf(chairmanId)).get(cat);
  if (!lim || !lim.locked) return [];
  const I = source === "INSTRUCTOR";
  const w: Record<Head, number> = {
    quiz: proposed?.quiz ?? ((I ? c.instructorQuizPct : null) ?? c.quizPct), assignment: proposed?.assignment ?? ((I ? c.instructorAssignmentPct : null) ?? c.assignmentPct),
    midterm: proposed?.midterm ?? ((I ? c.instructorMidtermPct : null) ?? c.midtermPct), final: proposed?.final ?? ((I ? c.instructorFinalPct : null) ?? c.finalPct),
    project: proposed?.project ?? ((I ? c.instructorProjectPct : null) ?? c.projectPct), lab: proposed?.lab ?? ((I ? c.instructorLabPct : null) ?? c.labPct),
  };
  const label = CATEGORIES.find((k) => k.key === cat)!.label;
  const out: string[] = [];
  for (const h of HEADS) {
    const r = lim.figures[h]; if (!r) continue;
    if (r[0] !== null && w[h] < r[0]) out.push(`${HEAD_LABEL[h]} ${w[h]}% is below the OMC's ${r[0]}% for ${label}`);
    if (r[1] !== null && w[h] > r[1]) out.push(`${HEAD_LABEL[h]} ${w[h]}% is above the OMC's ${r[1]}% for ${label}`);
  }
  const quizzes = (I ? c.instructorQuizCount : null) ?? c.quizCount ?? 0, assigns = (I ? c.instructorAssignmentCount : null) ?? c.assignmentCount ?? 0;
  if (lim.figures.minQuizzes && w.quiz > 0 && quizzes < lim.figures.minQuizzes) out.push(`${quizzes} quizzes — the OMC asks for at least ${lim.figures.minQuizzes} in ${label}`);
  if (lim.figures.minAssignments && w.assignment > 0 && assigns < lim.figures.minAssignments) out.push(`${assigns} assignments — the OMC asks for at least ${lim.figures.minAssignments} in ${label}`);
  return out;
}

// ------------------------------------------------------------------------------------------- requests and panels
export type Panel = { id: string; chairmanId: string; departmentId: string | null; term: string; label: string; courseIds: string[]; memberIds: string[]; createdAt: Date };
export async function panelsOf(chairmanId: string, term?: string): Promise<Panel[]> {
  const rows = ((await db.omcPanel.findMany({ where: { chairmanId, ...(term ? { term } : {}) }, orderBy: { createdAt: "desc" } }).catch(() => [])) as (Panel & { courseIdsJson: string; memberIdsJson: string })[]);
  return rows.map((r) => ({ ...r, courseIds: JSON.parse(r.courseIdsJson || "[]"), memberIds: JSON.parse(r.memberIdsJson || "[]") }));
}
export async function savePanel(user: { id: string }, chairmanId: string, p: { id?: string; term: string; label: string; courseIds: string[]; memberIds: string[]; departmentId?: string | null }) {
  if (!(await isConvener(chairmanId, user.id))) throw new Error("Only the OMC Convener sets the panels.");
  if (p.memberIds.length !== 3) throw new Error("A panel has three members.");
  if (!p.courseIds.length) throw new Error("Choose the panel's courses.");
  if (!p.term.trim()) throw new Error("Which semester?");
  const data = { chairmanId, departmentId: p.departmentId || null, term: p.term.trim(), label: p.label.trim().slice(0, 120), courseIdsJson: JSON.stringify(p.courseIds), memberIdsJson: JSON.stringify(p.memberIds) };
  if (p.id) await db.omcPanel.update({ where: { id: p.id }, data }); else await db.omcPanel.create({ data: { id: randomUUID(), createdById: user.id, ...data } });
  await notifyUsers(p.memberIds, { kind: "REQUEST", title: `You are on an OMC panel for ${p.term}`, body: `${p.courseIds.length} course(s)${p.label ? ` · ${p.label}` : ""}. Requests on these courses come only to the panel.`, href: "/omc/queue" });
}
export async function deletePanel(user: { id: string }, chairmanId: string, id: string) {
  if (!(await isConvener(chairmanId, user.id))) throw new Error("Only the OMC Convener sets the panels.");
  await db.omcPanel.deleteMany({ where: { id, chairmanId } });
}

export type RequestKind = "WEIGHT" | "TEMPLATE" | "CLO_METHOD" | "LAB_SHARE";
async function voters(courseId: string) {
  const omc = await omcOfCourse(courseId);
  if (!omc) return null;
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { offeredTermName: true, offeredTermYear: true } });
  const term = c?.offeredTermName ? `${c.offeredTermName} ${c.offeredTermYear || ""}`.trim() : "";
  const panel = (await panelsOf(omc.chairmanId)).find((p) => p.courseIds.includes(courseId) && (!term || p.term === term)) || null;
  if (panel) {
    const people = await prisma.user.findMany({ where: { id: { in: panel.memberIds } }, select: { id: true, name: true } });
    return { omc, panel, voters: people, need: 2 };
  }
  return { omc, panel: null, voters: omc.members, need: Math.min(2, Math.max(1, omc.members.length)) };
}

/** Votes on one request so far: "Approved by A and B" / "Waiting: 1 of 2". */
export async function requestVotes(kind: RequestKind, requestId: string, courseId: string) {
  const v = await voters(courseId);
  const rows = ((await db.omcRequestVote.findMany({ where: { kind, requestId }, orderBy: { at: "asc" } }).catch(() => [])) as { memberId: string; approve: boolean; reason: string | null; at: Date }[]);
  const names = new Map((v?.voters || []).map((m) => [m.id, m.name]));
  const missing = rows.filter((r) => !names.has(r.memberId)).map((r) => r.memberId);
  if (missing.length) for (const u of await prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } })) names.set(u.id, u.name);
  const votes = rows.map((r) => ({ ...r, name: names.get(r.memberId) || "—" }));
  const yes = votes.filter((x) => x.approve), no = votes.filter((x) => !x.approve);
  const need = v?.need || 2;
  // The committee engine's FIXED rule (2 approvals, or a panel's 2 of 3) — every vote counts, as before.
  const t = tallyVotes(votes.map((x) => ({ id: x.memberId, name: x.name })), votes.map((x) => ({ memberId: x.memberId, vote: x.approve ? "APPROVE" : "REJECT" })), { kind: "FIXED", need });
  const line = yes.length >= need ? `Approved by ${yes.map((x) => x.name).join(" and ")}` : no.length >= need ? `Rejected by ${no.map((x) => x.name).join(" and ")}` : `Waiting: ${yes.length} of ${need}${no.length ? ` · ${no.length} against` : ""}`;
  return { votes, yes: yes.length, no: no.length, need, panel: v?.panel || null, voters: v?.voters || [], convenerId: v?.omc.convenerId || null, line, decided: t.carried ? "approved" as const : t.failed ? "rejected" as const : null };
}

/** One OMC vote on a request. Returns the decision once it is reached (the caller applies it). */
export async function voteOnRequest(user: { id: string; name: string }, kind: RequestKind, requestId: string, courseId: string, approve: boolean, reason: string) {
  const v = await voters(courseId);
  if (!v) throw new Error("Course not found.");
  if (!v.voters.some((m) => m.id === user.id)) throw new Error(v.panel ? "This course has an OMC panel this semester — only its three members vote." : "Only a member of this course's OMC votes.");
  if (!approve && reason.trim().length < 3) throw new Error("Give the reason for rejecting.");
  await db.omcRequestVote.upsert({ where: { kind_requestId_memberId: { kind, requestId, memberId: user.id } }, create: { kind, requestId, memberId: user.id, approve, reason: reason.trim().slice(0, 1000) || null }, update: { approve, reason: reason.trim().slice(0, 1000) || null, at: new Date() } });
  return requestVotes(kind, requestId, courseId);
}

/** Requests waiting longer than OVERDUE_DAYS (for the Convener). */
export async function overdueRequests(chairmanId: string, departmentId?: string | null) {
  const since = new Date(Date.now() - OVERDUE_DAYS * 864e5);
  const scope = { coordinator: { managedById: chairmanId, ...(departmentId ? { departmentId } : {}) } };
  const [w, t] = await Promise.all([
    prisma.weightExceptionRequest.findMany({ where: { status: "pending", createdAt: { lt: since }, course: scope }, select: { id: true, createdAt: true, course: { select: { id: true, code: true, title: true } } } }),
    prisma.templateChangeRequest.findMany({ where: { status: "pending", createdAt: { lt: since }, courseId: { in: (await prisma.course.findMany({ where: scope, select: { id: true } })).map((c) => c.id).concat("none") } }, select: { id: true, createdAt: true, courseId: true } }),
  ]);
  const tc = await prisma.course.findMany({ where: { id: { in: t.map((x) => x.courseId).concat("none") } }, select: { id: true, code: true, title: true } });
  const out: { kind: RequestKind; id: string; course: string; courseId: string; days: number; votes: string }[] = [];
  for (const r of w) out.push({ kind: "WEIGHT", id: r.id, course: `${r.course.code} ${r.course.title}`, courseId: r.course.id, days: Math.floor((Date.now() - +r.createdAt) / 864e5), votes: (await requestVotes("WEIGHT", r.id, r.course.id)).line });
  for (const r of t) { const c = tc.find((x) => x.id === r.courseId); out.push({ kind: "TEMPLATE", id: r.id, course: c ? `${c.code} ${c.title}` : r.courseId, courseId: r.courseId, days: Math.floor((Date.now() - +r.createdAt) / 864e5), votes: (await requestVotes("TEMPLATE", r.id, r.courseId)).line }); }
  return out.sort((a, b) => b.days - a.days);
}

export { isMember };
