import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { cdb, rulesOn, isActiveMember } from "./consortium";

// Queue item 21: network degrees on top of the consortium. Forward degree plans with each course labelled, the
// student's network degree planner (home courses + equivalent offerings elsewhere), study centres by city, shared
// teachers' rotations, the network question bank with blind cross-review, complaints and appeals, leaving with notice,
// consent to share records, fee settlement between members, and a yearly quality review with a public scorecard.
// Everything except the existing consortium tables is kept in NetRecord (one table).
const db = prisma as unknown as Record<string, any>;
export const NET_HINT = "Run prisma/migration_adeel_p14.sql (System Health → Database updates) first.";
type Rec = { id: string; kind: string; chairmanId: string; refId: string | null; status: string; json: string; byId: string; at: Date; updatedAt: Date };
const J = <T>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
export async function recs(kind: string, where: Record<string, unknown> = {}) {
  return ((await db.netRecord?.findMany({ where: { kind, ...where }, orderBy: { at: "desc" }, take: 500 }).catch(() => null)) ?? null) as Rec[] | null;
}
async function put(kind: string, chairmanId: string, refId: string | null, data: Record<string, unknown>, byId: string, status = "OPEN", id?: string) {
  if (!db.netRecord) throw new Error(NET_HINT);
  const found = id ? await db.netRecord.findUnique({ where: { id } }) : refId ? await db.netRecord.findFirst({ where: { kind, chairmanId, refId } }) : null;
  if (found) { await db.netRecord.update({ where: { id: found.id }, data: { json: JSON.stringify(data), status, byId, updatedAt: new Date() } }); return found.id as string; }
  const nid = randomUUID(); await db.netRecord.create({ data: { id: nid, kind, chairmanId, refId, status, json: JSON.stringify(data), byId } }); return nid;
}
const nameOf = async (ids: string[]): Promise<Map<string, string>> => new Map<string, string>((await prisma.user.findMany({ where: { id: { in: ids.concat("none") } }, select: { id: true, instituteName: true, name: true } })).map((u) => [u.id, u.instituteName || u.name]));

// ---- 1. Forward degree plans: every course of the program labelled home only / network-open / home or online.
export const LABELS: Record<string, string> = { HOME: "Home only", NETWORK: "Network-open", ONLINE: "Home or online" };
export async function programsOf(chairmanId: string) {
  return Array.from(new Set<string>((await prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { degreeProgram: true } })).map((b) => b.degreeProgram as string))).sort();
}
/** The program's course list (from its newest batch) and any plans saved for coming intakes. */
export async function planOf(chairmanId: string, program: string) {
  const batch = await prisma.batch.findFirst({ where: { degreeProgram: program, coordinator: { managedById: chairmanId } }, orderBy: { createdAt: "desc" }, select: { id: true, batchName: true, courses: { where: { isNonCredit: false }, select: { code: true, title: true, creditHours: true, semesterNumber: true, hasLab: true }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] } } });
  const plans = ((await recs("PLAN", { chairmanId })) || []).filter((r) => r.refId?.startsWith(`${program}|`)).map((r) => ({ ...r, intake: r.refId!.split("|")[1], d: J<{ labels: Record<string, string>; bos: string }>(r.json, { labels: {}, bos: "" }) }));
  const seen = new Set<string>(); const courses = (batch?.courses || []).filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)));
  // Default: every course home only until the Board of Studies opens it to the network.
  const def = (c: { code: string; title: string }) => (c.code ? "HOME" : "HOME");
  return { batch: batch?.batchName || null, courses, plans, def };
}
export async function savePlan(u: { id: string }, chairmanId: string, program: string, intake: string, labels: Record<string, string>, bos: string, publish: boolean) {
  if (!/^(Fall|Spring) \d{4}$/.test(intake)) throw new Error("Give the intake as e.g. Fall 2027.");
  if (publish && !bos.trim()) throw new Error("Give the Board of Studies meeting that approved it before publishing.");
  const clean = Object.fromEntries(Object.entries(labels).filter(([, v]) => v in LABELS));
  await put("PLAN", chairmanId, `${program}|${intake}`, { labels: clean, bos: bos.slice(0, 200) }, u.id, publish ? "APPROVED" : "DRAFT");
  await writeAuditLog({ actorUserId: u.id, action: publish ? "NETWORK_PLAN_PUBLISHED" : "NETWORK_PLAN_SAVED", entityType: "Program", entityId: `${program}|${intake}` });
}
/** Every member's published plans (for the planner and for partner universities). */
export async function publishedPlans() {
  const rows = ((await recs("PLAN")) || []).filter((r) => r.status === "APPROVED");
  const names = await nameOf(rows.map((r) => r.chairmanId));
  return rows.map((r) => ({ chairmanId: r.chairmanId, university: names.get(r.chairmanId) || "—", program: r.refId!.split("|")[0], intake: r.refId!.split("|")[1], ...J<{ labels: Record<string, string>; bos: string }>(r.json, { labels: {}, bos: "" }) }));
}

// ---- 2. The student's network degree planner.
export async function planner(studentId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true, coordinator: { select: { managedById: true } } } } } });
  if (!st?.batch) return null;
  const home = st.batch.coordinator?.managedById || "";
  const [courses, enr, choices, { rules }, plans, centreRec, consent] = await Promise.all([
    prisma.course.findMany({ where: { batchId: st.batchId!, isNonCredit: false }, select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, masterCourseId: true }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] }),
    prisma.studentEnrollment.findMany({ where: { studentId }, select: { courseId: true, status: true } }),
    cdb.consortiumPlanChoice.findMany({ where: { studentId } }).catch(() => []) as Promise<{ courseId: string; chairmanId: string }[]>,
    rulesOn(), publishedPlans().catch(() => []), recs("STUDY_CENTRE", { refId: studentId }), recs("CONSENT", { refId: studentId }),
  ]);
  const plan = plans.filter((p) => p.chairmanId === home && p.program === st.batch!.degreeProgram).sort((a, b) => b.intake.localeCompare(a.intake))[0] || null;
  const ids = courses.map((c) => c.id);
  const eq = (await cdb.consortiumEquivalence.findMany({ where: { status: "APPROVED", OR: [{ courseA: { in: ids.concat("none") } }, { courseB: { in: ids.concat("none") } }] } }).catch(() => [])) as { courseA: string; courseB: string }[];
  const { catalog } = await import("./consortiumOfferings");
  const offs = (await catalog().catch(() => [])) as Awaited<ReturnType<typeof catalog>>;
  const total = courses.reduce((a, c) => a + c.creditHours, 0) || 1;
  const rows = courses.map((c) => {
    const twins = new Set(eq.flatMap((e) => (e.courseA === c.id ? [e.courseB] : e.courseB === c.id ? [e.courseA] : [])));
    const options = offs.filter((o) => o && o.chairmanId !== home && (twins.has(o.courseId) || (!!c.masterCourseId && o.course.masterCourseId === c.masterCourseId))).map((o) => ({ offeringId: o!.id, hostId: o!.chairmanId, university: o!.university, city: o!.city, mode: o!.mode, term: o!.term, seatsLeft: o!.seatsLeft, open: o!.open, fee: o!.feePerCredit }));
    const label = plan?.labels[c.code] || "HOME";
    const done = enr.some((e) => e.courseId === c.id && /COMPLETED|PASSED/.test(e.status));
    return { ...c, label, done, options: label === "HOME" ? [] : options, choice: choices.find((x) => x.courseId === c.id)?.chairmanId || null };
  });
  const outside = rows.filter((r) => r.choice && r.choice !== home).reduce((a, r) => a + r.creditHours, 0);
  const maxOut = Math.min(100 - Number(rules.minHomeResidencyPct || 50), Number(rules.maxOutsidePct ?? 50));
  const names = await nameOf(rows.flatMap((r) => (r.choice ? [r.choice] : [])));
  const centre = centreRec?.[0] ? J<{ city: string; centreId: string | null }>(centreRec[0].json, { city: "", centreId: null }) : null;
  return { home, program: st.batch.degreeProgram, batch: st.batch.batchName, plan, rows: rows.map((r) => ({ ...r, choiceName: r.choice ? names.get(r.choice) || "" : "" })), outsidePct: Math.round((100 * outside) / total), maxOutsidePct: maxOut, centre, consent: !!consent?.length, consentRequired: !!rules.consentRequired };
}
export async function choose(studentId: string, courseId: string, offeringId: string | null) {
  const p = await planner(studentId); if (!p) throw new Error("No batch on record.");
  const row = p.rows.find((r) => r.id === courseId); if (!row) throw new Error("Not a course of your degree plan.");
  if (!offeringId) { await cdb.consortiumPlanChoice.deleteMany({ where: { studentId, courseId } }); return "Back to your own university ✓"; }
  if (row.label === "HOME") throw new Error("Your university keeps this course at home (its Board of Studies plan).");
  const o = row.options.find((x) => x.offeringId === offeringId); if (!o) throw new Error("That offering is not an approved equivalent of this course.");
  const after = p.outsidePct + Math.round((100 * row.creditHours) / Math.max(1, p.rows.reduce((a, r) => a + r.creditHours, 0)));
  if (after > p.maxOutsidePct) throw new Error(`That would take ${after}% of your credits outside your university; the limit is ${p.maxOutsidePct}%.`);
  await cdb.consortiumPlanChoice.upsert({ where: { studentId_courseId: { studentId, courseId } }, create: { studentId, courseId, chairmanId: o.hostId }, update: { chairmanId: o.hostId, updatedAt: new Date() } });
  return `Planned at ${o.university} ✓ — apply for the seat when its applications open`;
}
export async function giveConsent(studentId: string, yes: boolean) {
  const p = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } });
  const home = p?.batch?.coordinator?.managedById || "";
  if (yes) await put("CONSENT", home, studentId, { at: new Date().toISOString(), text: "I agree that my university may share my enrolment, results and CLO records with the member university where I take a course." }, studentId, "GIVEN");
  else await db.netRecord?.deleteMany({ where: { kind: "CONSENT", refId: studentId } });
}
export async function hasConsent(studentId: string) { return !!(await db.netRecord?.findFirst({ where: { kind: "CONSENT", refId: studentId } }).catch(() => null)); }

// ---- 5. Study centres: each student's nearest approved centre (exam centres of members, by city), with capacity.
export async function centres() {
  const rows = (await cdb.examCentre.findMany({ where: { status: { not: "WITHDRAWN" } } }).catch(() => [])) as { id: string; chairmanId: string; name: string; city: string | null; seats: number }[];
  const assigned = ((await recs("STUDY_CENTRE")) || []).map((r) => J<{ centreId: string | null }>(r.json, { centreId: null }).centreId);
  const names = await nameOf(rows.map((r) => r.chairmanId));
  return rows.map((c) => ({ ...c, university: names.get(c.chairmanId) || "—", assigned: assigned.filter((x) => x === c.id).length }));
}
export async function setCity(studentId: string, city: string) {
  const c = city.trim().slice(0, 60); if (!c) throw new Error("Give your city.");
  const all = await centres();
  const inCity = all.filter((x) => (x.city || "").toLowerCase() === c.toLowerCase() && x.assigned < (x.seats || 0)).sort((a, b) => a.assigned - b.assigned);
  const p = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } });
  const home = p?.batch?.coordinator?.managedById || "";
  const pick = inCity.find((x) => x.chairmanId === home) || inCity[0] || null;
  await put("STUDY_CENTRE", home, studentId, { city: c, centreId: pick?.id || null }, studentId);
  return pick ? `Your study centre: ${pick.name} (${pick.university}), ${pick.city}` : `No centre with free places in ${c} yet — your university will place you.`;
}

// ---- 6. Shared teachers: a rotation planner (e.g. two universities, 3 + 2 face-to-face weeks).
export type Rotation = { courseCode: string; teacher: string; start: string; shared: boolean; legs: { university: string; weeks: number; city: string }[]; note: string };
export async function rotations(chairmanId?: string) { return ((await recs("ROTATION", chairmanId ? { chairmanId } : {})) || []).map((r) => ({ id: r.id, chairmanId: r.chairmanId, ...J<Rotation>(r.json, { courseCode: "", teacher: "", start: "", shared: false, legs: [], note: "" }) })); }
export async function saveRotation(u: { id: string }, chairmanId: string, r: Rotation, id?: string) {
  if (!r.courseCode.trim() || !r.teacher.trim()) throw new Error("Give the course and the teacher.");
  const legs = (r.legs || []).filter((l) => l.university && l.weeks > 0).slice(0, 6);
  if (!legs.length) throw new Error("Give at least one university and its face-to-face weeks.");
  return put("ROTATION", chairmanId, null, { ...r, legs, note: String(r.note || "").slice(0, 500) }, u.id, "OPEN", id);
}

// ---- 7. Network question bank per shared course: contributions per member, blind cross-review.
export async function sharedCourses(chairmanId: string) {
  const eq = (await cdb.consortiumEquivalence.findMany({ where: { status: "APPROVED", OR: [{ chairmanA: chairmanId }, { chairmanB: chairmanId }] } }).catch(() => [])) as { id: string; courseA: string; courseB: string; chairmanA: string; chairmanB: string }[];
  const cs = new Map((await prisma.course.findMany({ where: { id: { in: eq.flatMap((e) => [e.courseA, e.courseB]).concat("none") } }, select: { id: true, code: true, title: true } })).map((c) => [c.id, c]));
  const { rules } = await rulesOn(); const min = Number(rules.minQuestionsPerMember ?? 20);
  const since = new Date(Date.now() - 183 * 864e5);
  const out: { pairId: string; mine: { id: string; code: string; title: string; n: number }; other: { id: string; code: string; title: string; chairmanId: string; n: number }; min: number }[] = [];
  for (const e of eq) {
    const mine = e.chairmanA === chairmanId ? { c: cs.get(e.courseA), id: e.chairmanA } : { c: cs.get(e.courseB), id: e.chairmanB };
    const other = e.chairmanA === chairmanId ? { c: cs.get(e.courseB), id: e.chairmanB } : { c: cs.get(e.courseA), id: e.chairmanA };
    const mc = mine.c as { id: string; code: string; title: string } | undefined, oc = other.c as { id: string; code: string; title: string } | undefined;
    if (!mc || !oc) continue;
    const count = async (cid: string, code: string) => (await db.questionBankItem.count({ where: { chairmanId: cid, courseCode: code, active: true, createdAt: { gte: since } } }).catch(() => 0)) as number;
    out.push({ pairId: e.id, mine: { ...mc, n: await count(mine.id, mc.code) }, other: { ...oc, chairmanId: other.id, n: await count(other.id, oc.code) }, min });
  }
  const names = await nameOf(out.map((o) => o.other.chairmanId));
  return out.map((o) => ({ ...o, otherName: names.get(o.other.chairmanId) || "—" }));
}
/** Questions of the partner's course for blind review: text, marks, CLO and level — never the author or university. */
export async function blindQueue(chairmanId: string, pairId: string) {
  const s = (await sharedCourses(chairmanId)).find((x) => x.pairId === pairId); if (!s) throw new Error("Not a shared course of yours.");
  const items = (await db.questionBankItem.findMany({ where: { chairmanId: s.other.chairmanId, courseCode: s.other.code, active: true }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, text: true, marks: true, cloCode: true, bloom: true } }).catch(() => [])) as { id: string; text: string; marks: number; cloCode: string; bloom: string }[];
  const done = ((await recs("QB_REVIEW", { chairmanId })) || []).map((r) => r.refId);
  return { shared: s, items: items.filter((i) => !done.includes(i.id)), reviewed: done.length };
}
export async function blindReview(u: { id: string }, chairmanId: string, pairId: string, itemId: string, ok: boolean, note: string) {
  const q = await blindQueue(chairmanId, pairId);
  if (!q.items.some((i) => i.id === itemId)) throw new Error("Already reviewed or not in this course's bank.");
  await put("QB_REVIEW", chairmanId, itemId, { pairId, ok, note: note.slice(0, 500), reviewer: u.id }, u.id, ok ? "APPROVED" : "RETURNED");
  const author = (await db.questionBankItem.findUnique({ where: { id: itemId }, select: { createdById: true } }).catch(() => null)) as { createdById: string } | null;
  if (author) await notifyUsers([author.createdById], { kind: "INFO", title: `A partner university ${ok ? "approved" : "returned"} one of your questions (${q.shared.other.code})`, body: note.slice(0, 200) || undefined, href: "/question-bank" }).catch(() => null);
}

// ---- 9. Network rules: complaints and appeals, leaving with notice, fee settlement.
export const LEVELS = ["HOST", "PANEL", "HEC"] as const;
export type Complaint = { about: string; against: string; text: string; level: (typeof LEVELS)[number]; history: { at: string; level: string; decision: string; by: string }[]; from: string };
export async function complaints(chairmanId: string) {
  const all = ((await recs("COMPLAINT")) || []).map((r) => ({ id: r.id, chairmanId: r.chairmanId, status: r.status, at: r.at, ...J<Complaint>(r.json, { about: "", against: "", text: "", level: "HOST", history: [], from: "" }) }));
  return all.filter((c) => c.chairmanId === chairmanId || c.against === chairmanId);
}
export async function fileComplaint(u: { id: string; name: string }, chairmanId: string, against: string, about: string, text: string) {
  if (!text.trim()) throw new Error("Describe the complaint.");
  if (!(await isActiveMember(against))) throw new Error("Choose a member university.");
  const id = await put("COMPLAINT", chairmanId, null, { about: about.slice(0, 200), against, text: text.slice(0, 3000), level: "HOST", history: [], from: u.name } as Complaint, u.id, "OPEN");
  const head = await prisma.user.findUnique({ where: { id: against }, select: { id: true } });
  if (head) await notifyUsers([head.id], { kind: "APPROVAL", title: "A consortium complaint names your university", body: about.slice(0, 200), href: "/consortium/network?tab=rules" }).catch(() => null);
  return id;
}
/** The named university answers first; either side can appeal to the consortium panel, then to HEC. */
export async function decideComplaint(u: { id: string; name: string }, chairmanId: string, id: string, decision: string, appeal: boolean) {
  const r = (await db.netRecord.findUnique({ where: { id } })) as Rec | null; if (!r || r.kind !== "COMPLAINT") throw new Error("Not found.");
  const c = J<Complaint>(r.json, { about: "", against: "", text: "", level: "HOST", history: [], from: "" });
  if (r.chairmanId !== chairmanId && c.against !== chairmanId && !(await import("./platformTeam").then((m) => m.adminCan(u as never, "CONSORTIUM_ODL")))) throw new Error("Not a party to this complaint.");
  const history = [...c.history, { at: new Date().toISOString(), level: c.level, decision: decision.slice(0, 2000) || (appeal ? "appealed" : "decided"), by: u.name }];
  const next = appeal ? LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(c.level) + 1)] : c.level;
  await put("COMPLAINT", r.chairmanId, null, { ...c, history, level: next }, u.id, appeal ? "APPEALED" : "DECIDED", id);
}
export async function giveNotice(u: { id: string }, chairmanId: string, months: number, teachOut: string) {
  const { rules } = await rulesOn(); const min = Number(rules.leaveNoticeMonths ?? 6);
  if (months < min) throw new Error(`Notice must be at least ${min} months (consortium rules).`);
  const until = new Date(); until.setUTCMonth(until.getUTCMonth() + months);
  await put("LEAVING", chairmanId, chairmanId, { months, until: until.toISOString().slice(0, 10), teachOut: teachOut.slice(0, 2000) }, u.id, "NOTICE");
  await writeAuditLog({ actorUserId: u.id, action: "CONSORTIUM_NOTICE_GIVEN", entityType: "ConsortiumMember", entityId: chairmanId });
}
/** What each home university owes each host for this term's accepted visiting students (the host's fees). */
export async function settlement(chairmanId: string) {
  const apps = (await cdb.consortiumApplication.findMany({ where: { status: "ACCEPTED", OR: [{ homeChairmanId: chairmanId }, { hostChairmanId: chairmanId }] } }).catch(() => [])) as { id: string; homeChairmanId: string; hostChairmanId: string; fee: number | null; currency: string | null; paymentStatus: string | null; offeringId: string }[];
  const offs = new Map(((await cdb.consortiumOffering.findMany({ where: { id: { in: apps.map((a) => a.offeringId).concat("none") } }, select: { id: true, term: true } }).catch(() => [])) as { id: string; term: string }[]).map((o) => [o.id, o.term]));
  const m = new Map<string, { home: string; host: string; term: string; students: number; due: number; paidByStudents: number; currency: string }>();
  for (const a of apps) { const term = offs.get(a.offeringId) || "—"; const k = `${a.homeChairmanId}|${a.hostChairmanId}|${term}`; const x = m.get(k) || { home: a.homeChairmanId, host: a.hostChairmanId, term, students: 0, due: 0, paidByStudents: 0, currency: a.currency || "PKR" }; x.students++; x.due += a.fee || 0; if (a.paymentStatus === "VERIFIED") x.paidByStudents += a.fee || 0; m.set(k, x); }
  const settled = ((await recs("SETTLEMENT")) || []).filter((r) => r.status === "SETTLED").map((r) => r.refId);
  const names = await nameOf(Array.from(m.values()).flatMap((x) => [x.home, x.host]));
  return Array.from(m.entries()).map(([k, x]) => ({ key: k, ...x, homeName: names.get(x.home) || "—", hostName: names.get(x.host) || "—", settled: settled.includes(k) }));
}
export async function markSettled(u: { id: string }, chairmanId: string, key: string, ref: string) {
  const [home, host] = key.split("|"); if (chairmanId !== host && chairmanId !== home) throw new Error("Not your settlement.");
  await put("SETTLEMENT", chairmanId, key, { ref: ref.slice(0, 120) }, u.id, "SETTLED");
}

// ---- 10. Quality per offering: a yearly review and the public scorecard.
export async function quality(chairmanId?: string) {
  const offs = (await cdb.consortiumOffering.findMany({ where: chairmanId ? { chairmanId } : {}, select: { id: true, chairmanId: true, courseId: true, term: true, mode: true } }).catch(() => [])) as { id: string; chairmanId: string; courseId: string; term: string; mode: string }[];
  const apps = (await cdb.consortiumApplication.findMany({ where: { offeringId: { in: offs.map((o) => o.id).concat("none") }, status: "ACCEPTED" }, select: { id: true, offeringId: true } }).catch(() => [])) as { id: string; offeringId: string }[];
  const tr = (await cdb.consortiumTransfer.findMany({ where: { applicationId: { in: apps.map((a) => a.id).concat("none") } }, select: { applicationId: true, hostPoints: true } }).catch(() => [])) as { applicationId: string; hostPoints: number | null }[];
  const courses = new Map((await prisma.course.findMany({ where: { id: { in: offs.map((o) => o.courseId).concat("none") } }, select: { id: true, code: true, title: true } })).map((c) => [c.id, c]));
  const reviews = ((await recs("QUALITY")) || []);
  const names = await nameOf(offs.map((o) => o.chairmanId));
  const rows = offs.map((o) => { const a = apps.filter((x) => x.offeringId === o.id); const t = tr.filter((x) => a.some((y) => y.id === x.applicationId));
    const r = reviews.find((x) => x.refId === o.id);
    return { ...o, course: courses.get(o.courseId), university: names.get(o.chairmanId) || "—", students: a.length, results: t.length, passed: t.filter((x) => (x.hostPoints ?? 0) >= 1).length, review: r ? J<{ year: string; cloPct: number | null; moderation: string; feedback: number | null; actions: string }>(r.json, { year: "", cloPct: null, moderation: "", feedback: null, actions: "" }) : null };
  });
  return rows;
}
export async function saveReview(u: { id: string }, chairmanId: string, offeringId: string, d: { year: string; cloPct?: number | null; moderation?: string; feedback?: number | null; actions?: string }) {
  const o = (await cdb.consortiumOffering.findUnique({ where: { id: offeringId }, select: { chairmanId: true } })) as { chairmanId: string } | null;
  if (!o || o.chairmanId !== chairmanId) throw new Error("Only the host reviews its offering.");
  await put("QUALITY", chairmanId, offeringId, { year: String(d.year || new Date().getUTCFullYear()), cloPct: d.cloPct ?? null, moderation: String(d.moderation || "").slice(0, 500), feedback: d.feedback ?? null, actions: String(d.actions || "").slice(0, 2000) }, u.id, "DONE");
}
/** Public: per member university — offerings, students taught, results, pass rate, reviews done. */
export async function scorecard() {
  const rows = await quality();
  const members = ((await cdb.consortiumMember.findMany({ where: { status: "ACTIVE" }, select: { chairmanId: true, city: true } }).catch(() => [])) as { chairmanId: string; city: string | null }[]);
  const names = await nameOf(members.map((m) => m.chairmanId));
  return members.map((m) => { const r = rows.filter((x) => x.chairmanId === m.chairmanId); const res = r.reduce((a, x) => a + x.results, 0);
    return { university: names.get(m.chairmanId) || "—", city: m.city, offerings: r.length, students: r.reduce((a, x) => a + x.students, 0), results: res, passPct: res ? Math.round((100 * r.reduce((a, x) => a + x.passed, 0)) / res) : null, reviewed: r.filter((x) => x.review).length };
  }).sort((a, b) => b.students - a.students);
}
