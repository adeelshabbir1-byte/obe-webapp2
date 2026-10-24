import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { cdb, isActiveMember, rulesOn } from "./consortium";
import { courseKeys } from "./curriculumEquivalence";
import { countsTowardDegree } from "./courseTypes";
import { findOwningChairmanId } from "./institutionCurriculum";
import { canUseCurriculum } from "./curriculumLibrary";

// Consortium phase 2: agreements between member universities and the course equivalences under them.
// An agreement is on ONE curriculum edition (e.g. 2025): both universities' curricula must be on it — 2023 is never
// mixed with 2025. Every course pair carries evidence (CLO coverage, contact hours, lab split, Bloom levels), and is
// approved at each university by its Subject Expert and its Chairman. JOINT_DEGREE needs both universities;
// CREDIT_RECOGNITION only the university that grants the credit (party A, the proposer).

export type Agreement = { id: string; kind: "JOINT_DEGREE" | "CREDIT_RECOGNITION"; title: string; programme: string | null; edition: string; status: string; mouStart: Date | null; mouEnd: Date | null; rulesVersion: number | null; gradeMapJson: string; note: string | null; createdById: string; createdAt: Date };
export type Party = { agreementId: string; chairmanId: string; role: string; curriculumId: string | null; status: string; decidedAt: Date | null };
export type Approval = { by: string; name: string; at: string; ok: boolean; note?: string };
export type Approvals = Record<string, { se?: Approval; chair?: Approval }>; // keyed by chairmanId
export type Evidence = { chA: number; chB: number; labA: number; labB: number; closA: number; closB: number; coverAB: number; coverBA: number; bloomA: string | null; bloomB: string | null; missingInA: string[]; missingInB: string[]; score: number; flags: string[] };
export type Equivalence = { id: string; agreementId: string; courseA: string; courseB: string; chairmanA: string; chairmanB: string; status: string; evidenceJson: string; approvalsJson: string; note: string | null; updatedAt: Date };

export const KIND_LABEL = { JOINT_DEGREE: "Joint degree programme", CREDIT_RECOGNITION: "Credit recognition (our students take their courses)" } as const;
const j = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
/** The edition (a 4-digit year) a curriculum is on, from its version. */
export const editionOf = (version: string) => version.match(/(19|20)\d{2}/)?.[0] || null;

export async function institutionOf(user: { id: string; role: string }) { return user.role === "CHAIRMAN" ? user.id : findOwningChairmanId(user.id); }
export async function agreementsFor(chairmanId: string) {
  const ps = (await cdb.consortiumAgreementParty.findMany({ where: { chairmanId } })) as Party[];
  const ags = (await cdb.consortiumAgreement.findMany({ where: { id: { in: ps.map((p) => p.agreementId) } }, orderBy: { createdAt: "desc" } })) as Agreement[];
  const parties = (await cdb.consortiumAgreementParty.findMany({ where: { agreementId: { in: ags.map((a) => a.id) } } })) as Party[];
  return ags.map((a) => ({ ...a, parties: parties.filter((p) => p.agreementId === a.id) }));
}
export async function loadAgreement(id: string) {
  const a = (await cdb.consortiumAgreement.findUnique({ where: { id } })) as Agreement | null;
  if (!a) return null;
  const parties = (await cdb.consortiumAgreementParty.findMany({ where: { agreementId: id } })) as Party[];
  return { ...a, parties };
}

// ------------------------------------------------------------------ Proposing and accepting
export async function propose(actorId: string, me: string, f: { kind: string; partnerId: string; title: string; programme?: string; curriculumId: string; mouStart?: string; mouEnd?: string; note?: string }) {
  if (f.kind !== "JOINT_DEGREE" && f.kind !== "CREDIT_RECOGNITION") throw new Error("Choose the kind of agreement.");
  if (!(await isActiveMember(me))) throw new Error("Your university must be a consortium member first.");
  if (!f.partnerId || f.partnerId === me || !(await isActiveMember(f.partnerId))) throw new Error("Choose a partner university that is a consortium member.");
  const cur = await prisma.masterCurriculum.findUnique({ where: { id: f.curriculumId }, select: { id: true, chairmanId: true, title: true, version: true } });
  if (!cur || !(await canUseCurriculum(cur, me))) throw new Error("Choose one of your university's curricula.");
  const edition = editionOf(cur.version);
  if (!edition) throw new Error(`${cur.title} ${cur.version}: its version has no year, so its edition is unclear — name the version (e.g. 2025) first.`);
  const { rules, version } = await rulesOn();
  const d = (s?: string) => (s ? new Date(s) : null);
  const mouStart = d(f.mouStart), mouEnd = d(f.mouEnd);
  if (f.kind === "JOINT_DEGREE") {
    if (!mouStart || !mouEnd) throw new Error("A joint degree needs the agreement's start and end dates.");
    const yrs = (mouEnd.getTime() - mouStart.getTime()) / (365.25 * 86400000);
    if (yrs + 0.01 < Number(rules.mouMinYears)) throw new Error(`HEC asks for an agreement of at least ${rules.mouMinYears} years for a joint degree (this one is ${yrs.toFixed(1)}).`);
  }
  const id = randomUUID();
  await cdb.consortiumAgreement.create({ data: { id, kind: f.kind, title: f.title.trim().slice(0, 160) || `${cur.title} ${edition}`, programme: f.programme?.trim().slice(0, 160) || cur.title, edition, status: "PROPOSED", mouStart, mouEnd, rulesVersion: version || null, note: f.note?.trim().slice(0, 800) || null, createdById: actorId } });
  await cdb.consortiumAgreementParty.create({ data: { agreementId: id, chairmanId: me, role: "LEAD", curriculumId: cur.id, status: "ACCEPTED", decidedById: actorId, decidedAt: new Date() } });
  await cdb.consortiumAgreementParty.create({ data: { agreementId: id, chairmanId: f.partnerId, role: "PARTNER", status: "INVITED" } });
  await writeAuditLog({ actorUserId: actorId, action: "CONSORTIUM_AGREEMENT_PROPOSED", entityType: "ConsortiumAgreement", entityId: id, metadata: { kind: f.kind, partner: f.partnerId, edition } });
  return id;
}
export async function respond(actorId: string, me: string, agreementId: string, accept: boolean, curriculumId?: string) {
  const a = await loadAgreement(agreementId);
  const p = a?.parties.find((x) => x.chairmanId === me);
  if (!a || !p) throw new Error("Not found.");
  if (p.status !== "INVITED") throw new Error("Already answered.");
  if (!accept) {
    await cdb.consortiumAgreementParty.update({ where: { agreementId_chairmanId: { agreementId, chairmanId: me } }, data: { status: "DECLINED", decidedById: actorId, decidedAt: new Date() } });
    await cdb.consortiumAgreement.update({ where: { id: agreementId }, data: { status: "ENDED" } });
    return "Declined.";
  }
  const cur = curriculumId ? await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { id: true, chairmanId: true, title: true, version: true } }) : null;
  if (!cur || !(await canUseCurriculum(cur, me))) throw new Error("Choose the curriculum of yours this agreement uses.");
  if (editionOf(cur.version) !== a.edition) throw new Error(`This agreement is on the ${a.edition} edition; ${cur.title} ${cur.version} is not. Curricula of different editions (e.g. 2023 and 2025) are never mixed — choose your ${a.edition} curriculum.`);
  await cdb.consortiumAgreementParty.update({ where: { agreementId_chairmanId: { agreementId, chairmanId: me } }, data: { status: "ACCEPTED", curriculumId: cur.id, decidedById: actorId, decidedAt: new Date() } });
  const all = (await cdb.consortiumAgreementParty.findMany({ where: { agreementId } })) as Party[];
  if (all.every((x) => x.status === "ACCEPTED")) {
    const { version } = await rulesOn();
    await cdb.consortiumAgreement.update({ where: { id: agreementId }, data: { status: "ACTIVE", rulesVersion: version || null } });
    await autoPair(actorId, agreementId);
  }
  await writeAuditLog({ actorUserId: actorId, action: "CONSORTIUM_AGREEMENT_ACCEPTED", entityType: "ConsortiumAgreement", entityId: agreementId, metadata: { curriculumId: cur.id } });
  return "Accepted. Courses have been paired automatically — review them on the agreement.";
}

// ------------------------------------------------------------------ Comparing two courses
type MC = { id: string; code: string; title: string; creditHours: number; category: string; clos: { statement: string; bloomLevel: string }[]; lab: number };
const STOP = new Set("the and for with using use from into that this their such able will student students course understand basic".split(" "));
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, "")));
const sim = (a: Set<string>, b: Set<string>) => { const n = Array.from(a).filter((x) => b.has(x)).length; return n / Math.max(1, Math.min(a.size, b.size)); };
/** Share of `from`'s CLOs that some CLO of `to` covers (word overlap ≥ 0.4), and the ones not covered. */
function cover(from: MC["clos"], to: MC["clos"]) {
  const tw = to.map((c) => words(c.statement));
  const missing = from.filter((c) => { const w = words(c.statement); return !tw.some((t) => sim(w, t) >= 0.4); }).map((c) => c.statement);
  return { pct: from.length ? Math.round((100 * (from.length - missing.length)) / from.length) : 0, missing };
}
const top = (cs: MC["clos"]) => cs.map((c) => c.bloomLevel).sort().pop() || null;
export function evidenceOf(A: MC, B: MC): Evidence {
  const ab = cover(A.clos, B.clos), ba = cover(B.clos, A.clos);
  const flags: string[] = [];
  if (A.creditHours !== B.creditHours) flags.push(`credit hours differ (${A.creditHours} vs ${B.creditHours})`);
  if (A.lab !== B.lab) flags.push(`lab part differs (${A.lab} vs ${B.lab} CH) — labs must be face-to-face`);
  if (!A.clos.length || !B.clos.length) flags.push("CLOs missing on one side");
  else if (ab.pct < 70 || ba.pct < 70) flags.push("CLOs cover each other less than 70%");
  const bA = top(A.clos), bB = top(B.clos);
  if (bA && bB && bA !== bB) flags.push(`highest Bloom level differs (${bA} vs ${bB})`);
  const score = Math.round((A.creditHours === B.creditHours ? 30 : 0) + (A.lab === B.lab ? 10 : 0) + 0.3 * ab.pct + 0.3 * ba.pct);
  return { chA: A.creditHours, chB: B.creditHours, labA: A.lab, labB: B.lab, closA: A.clos.length, closB: B.clos.length, coverAB: ab.pct, coverBA: ba.pct, bloomA: bA, bloomB: bB, missingInB: ab.missing, missingInA: ba.missing, score, flags };
}
async function loadCourses(ids: string[]) {
  const cs = await prisma.masterCourse.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, title: true, creditHours: true, category: true, masterCurriculumId: true, seedClos: { orderBy: { orderIndex: "asc" }, select: { statement: true, bloomLevel: true } } } });
  const labs = new Map(((await cdb.masterCourseLab.findMany({ where: { masterCourseId: { in: ids } } }).catch(() => [])) as { masterCourseId: string; labCredits: number }[]).map((l) => [l.masterCourseId, l.labCredits]));
  return new Map(cs.map((c) => [c.id, { id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, category: c.category, curriculumId: c.masterCurriculumId, clos: c.seedClos, lab: labs.get(c.id) || 0 }]));
}
async function curriculumCourses(curriculumId: string) {
  return prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, title: true, category: true }, orderBy: { code: "asc" } });
}

/** Pair every degree course of the lead university with its counterpart at each partner (same edition only). */
export async function autoPair(actorId: string, agreementId: string) {
  const a = await loadAgreement(agreementId);
  if (!a || a.status !== "ACTIVE") return 0;
  const lead = a.parties.find((p) => p.role === "LEAD")!;
  let n = 0;
  for (const p of a.parties.filter((x) => x.role !== "LEAD" && x.curriculumId)) {
    const [As, Bs] = await Promise.all([curriculumCourses(lead.curriculumId!), curriculumCourses(p.curriculumId!)]);
    const kb = Bs.map((b) => courseKeys(b.title, a.edition as "2025" | "2023"));
    const used = new Set<string>();
    for (const x of As.filter((c) => countsTowardDegree(c.category))) {
      const ks = courseKeys(x.title, a.edition as "2025" | "2023");
      const i = kb.findIndex((k, idx) => !used.has(Bs[idx].id) && k.some((y) => ks.includes(y)));
      if (i < 0) continue;
      used.add(Bs[i].id);
      if (await addPair(actorId, a, x.id, Bs[i].id, lead.chairmanId, p.chairmanId).catch(() => false)) n++;
    }
  }
  return n;
}
async function addPair(actorId: string, a: Agreement, courseA: string, courseB: string, chairmanA: string, chairmanB: string) {
  if (await cdb.consortiumEquivalence.findFirst({ where: { agreementId: a.id, courseA, courseB } })) return false;
  const m = await loadCourses([courseA, courseB]);
  const A = m.get(courseA), B = m.get(courseB);
  if (!A || !B) throw new Error("Course not found.");
  await cdb.consortiumEquivalence.create({ data: { id: randomUUID(), agreementId: a.id, courseA, courseB, chairmanA, chairmanB, status: "PROPOSED", evidenceJson: JSON.stringify(evidenceOf(A, B)), approvalsJson: "{}", createdById: actorId } });
  return true;
}
export async function manualPair(actorId: string, me: string, agreementId: string, courseA: string, courseB: string) {
  const a = await loadAgreement(agreementId);
  if (!a || a.status !== "ACTIVE" || !a.parties.some((p) => p.chairmanId === me)) throw new Error("Not found.");
  const lead = a.parties.find((p) => p.role === "LEAD")!, partner = a.parties.find((p) => p.role !== "LEAD")!;
  const m = await loadCourses([courseA, courseB]);
  if (m.get(courseA)?.curriculumId !== lead.curriculumId || m.get(courseB)?.curriculumId !== partner.curriculumId) throw new Error("Choose a course from each university's curriculum in this agreement.");
  if (!(await addPair(actorId, a, courseA, courseB, lead.chairmanId, partner.chairmanId))) throw new Error("This pair is already there.");
}

// ------------------------------------------------------------------ Approving
/** The universities that must approve an equivalence: both for a joint degree; for credit recognition only A. */
export const requiredSides = (a: Agreement, e: Equivalence) => (a.kind === "JOINT_DEGREE" ? [e.chairmanA, e.chairmanB] : [e.chairmanA]);
export function statusFrom(a: Agreement, e: Equivalence, ap: Approvals) {
  const sides = requiredSides(a, e);
  if (sides.some((s) => ap[s]?.se?.ok === false || ap[s]?.chair?.ok === false)) return "REJECTED";
  return sides.every((s) => ap[s]?.se?.ok && ap[s]?.chair?.ok) ? "APPROVED" : "PROPOSED";
}
export async function decide(user: { id: string; role: string; name: string; secondaryRole?: string | null; tertiaryRole?: string | null; extraRoles?: string[] }, eqId: string, ok: boolean, note?: string) {
  const e = (await cdb.consortiumEquivalence.findUnique({ where: { id: eqId } })) as Equivalence | null;
  if (!e) throw new Error("Not found.");
  const a = (await loadAgreement(e.agreementId))!;
  const me = await institutionOf(user);
  if (!me || (me !== e.chairmanA && me !== e.chairmanB)) throw new Error("Only the two universities in this agreement decide.");
  if (!requiredSides(a, e).includes(me)) throw new Error("Under credit recognition only the university granting the credit approves.");
  const hats = [user.role, user.secondaryRole, user.tertiaryRole, ...(user.extraRoles || [])];
  const slot = user.role === "CHAIRMAN" ? "chair" : hats.includes("SUBJECT_EXPERT") ? "se" : null;
  if (!slot) throw new Error("A Subject Expert or the Chairman approves course equivalences.");
  if (!ok && !note?.trim()) throw new Error("Say why it is not equivalent.");
  const ap = j<Approvals>(e.approvalsJson, {});
  ap[me] = { ...(ap[me] || {}), [slot]: { by: user.id, name: user.name, at: new Date().toISOString(), ok, note: note?.trim().slice(0, 500) || undefined } };
  const status = statusFrom(a, e, ap);
  await cdb.consortiumEquivalence.update({ where: { id: eqId }, data: { approvalsJson: JSON.stringify(ap), status, updatedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: ok ? "EQUIVALENCE_APPROVED" : "EQUIVALENCE_REJECTED", entityType: "ConsortiumEquivalence", entityId: eqId, metadata: { as: slot, status, note: note || null } });
  return status === "APPROVED" ? "Approved — the equivalence is now in force." : ok ? "Your approval is recorded." : "Recorded as not equivalent.";
}

/** Equalise: copy the partner course's CLOs that our course does not cover into our course (our own curriculum
 *  only). The pair's evidence is recomputed and its approvals start again, since the course changed. */
export async function adoptClos(actorId: string, me: string, eqId: string) {
  const e = (await cdb.consortiumEquivalence.findUnique({ where: { id: eqId } })) as Equivalence | null;
  if (!e || (me !== e.chairmanA && me !== e.chairmanB)) throw new Error("Not found.");
  const mine = me === e.chairmanA ? e.courseA : e.courseB, theirs = me === e.chairmanA ? e.courseB : e.courseA;
  const own = await prisma.masterCourse.findUnique({ where: { id: mine }, select: { masterCurriculum: { select: { chairmanId: true } } } });
  if (own?.masterCurriculum.chairmanId !== me) throw new Error("Your course belongs to a curriculum your university does not own (e.g. your affiliating university's) — it changes there.");
  const m = await loadCourses([mine, theirs]);
  const ev = evidenceOf(m.get(mine)!, m.get(theirs)!);
  const add = m.get(theirs)!.clos.filter((c) => ev.missingInA.includes(c.statement)); // theirs, not covered by ours
  if (!add.length) throw new Error("Your course already covers all of their CLOs.");
  const n = m.get(mine)!.clos.length;
  await prisma.masterCourseClo.createMany({ data: add.map((c, i) => ({ masterCourseId: mine, statement: c.statement, bloomLevel: c.bloomLevel, orderIndex: n + i })) });
  await refresh(eqId, true);
  await writeAuditLog({ actorUserId: actorId, action: "EQUIVALENCE_CLOS_ADOPTED", entityType: "ConsortiumEquivalence", entityId: eqId, metadata: { added: add.length } });
  return `${add.length} CLO(s) added to your course. Map them to your PLOs in the curriculum editor; approvals start again.`;
}
/** Recompute a pair's evidence (and clear approvals when a course changed). */
export async function refresh(eqId: string, clear = false) {
  const e = (await cdb.consortiumEquivalence.findUnique({ where: { id: eqId } })) as Equivalence | null;
  if (!e) return;
  const m = await loadCourses([e.courseA, e.courseB]);
  if (!m.get(e.courseA) || !m.get(e.courseB)) return;
  await cdb.consortiumEquivalence.update({ where: { id: eqId }, data: { evidenceJson: JSON.stringify(evidenceOf(m.get(e.courseA)!, m.get(e.courseB)!)), ...(clear ? { approvalsJson: "{}", status: "PROPOSED" } : {}), updatedAt: new Date() } });
}

// ------------------------------------------------------------------ The matrix
export async function matrix(agreementId: string) {
  const a = await loadAgreement(agreementId);
  if (!a) return null;
  const eqs = (await cdb.consortiumEquivalence.findMany({ where: { agreementId } })) as Equivalence[];
  const cs = await loadCourses(eqs.flatMap((e) => [e.courseA, e.courseB]));
  const heads = await prisma.user.findMany({ where: { id: { in: a.parties.map((p) => p.chairmanId) } }, select: { id: true, instituteName: true, name: true } });
  const uni = (id: string) => heads.find((h) => h.id === id)?.instituteName || heads.find((h) => h.id === id)?.name || "—";
  const curIds = a.parties.map((p) => p.curriculumId).filter((x): x is string => !!x);
  const curs = await prisma.masterCurriculum.findMany({ where: { id: { in: curIds } }, select: { id: true, title: true, version: true, authority: true } });
  const rows = eqs.map((e) => ({ ...e, A: cs.get(e.courseA)!, B: cs.get(e.courseB)!, evidence: j<Evidence>(e.evidenceJson, {} as Evidence), approvals: j<Approvals>(e.approvalsJson, {}) })).filter((r) => r.A && r.B).sort((x, y) => x.A.code.localeCompare(y.A.code));
  return { agreement: a, rows, uni, curricula: curs };
}

/** Phase 4+: is host course B recognised at university `home` (as which of home's courses)? */
export async function recognisedAt(home: string, hostCourseId: string) {
  const es = (await cdb.consortiumEquivalence.findMany({ where: { status: "APPROVED", OR: [{ chairmanA: home, courseB: hostCourseId }, { chairmanB: home, courseA: hostCourseId }] } }).catch(() => [])) as Equivalence[];
  return es.map((e) => (e.chairmanA === home ? e.courseA : e.courseB));
}
