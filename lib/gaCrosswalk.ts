import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { COUNCIL_SETS, isCouncilKey, attrCode, type CouncilKey } from "./councilAttributes";
import { departmentOfProgram, omcCommittee, majority, isConvener } from "./omcCommittee";
import { requestVote } from "./omcRules";
import { computeCurrentSemesterNumber } from "./termLogic";
import { LIST_TYPES } from "./autoCopyPreviousBatch";

// Courses whose home is another department (e.g. BSCS's Entrepreneurship, home Management Sciences).
//  · GA crosswalk per pair of programs (our GA ← their GA, partial = 50 %), seeded theme by theme from the council sets;
//    our OMC confirms it: endorse → majority → the Convener finalises. History kept.
//  · Each term, our OMC decides course → our GAs (suggested from the crosswalk or last term), confirmed by 2 members or
//    the course's panel. CLO → our GA is never mapped by our OMC: the home SE's CLO → their GA is translated.
//  · Case 2 (the home department doesn't offer it): the SE maps CLOs straight to our GAs, no crosswalk.

const db = prisma as unknown as Record<string, any>;
export type Link = { their: number; ours: number; w: number };
type Theme = Partial<Record<CouncilKey, [number, number][]>>; // council → [attribute, weight]
// The default themes (CGA = NCEAC, BGA = NBEAC, EGA/PGA = PEC).
const THEMES: Theme[] = [
  { NCEAC: [[2, 1], [1, 0.5]], NBEAC: [[1, 1]], PEC: [[1, 1]] },
  { NCEAC: [[3, 1]], NBEAC: [[2, 1]], PEC: [[2, 1], [4, 0.5]] },
  { NCEAC: [[4, 1]], NBEAC: [[2, 1], [8, 0.5]], PEC: [[3, 1]] },
  { NCEAC: [[5, 1]], NBEAC: [[6, 1]], PEC: [[5, 1]] },
  { NCEAC: [[6, 1]], NBEAC: [[5, 1]], PEC: [[9, 1]] },
  { NCEAC: [[7, 1]], NBEAC: [[3, 1]], PEC: [[10, 1]] },
  { NCEAC: [[8, 1]], NBEAC: [[7, 1], [4, 0.5]], PEC: [[6, 1], [7, 0.5]] },
  { NCEAC: [[9, 1]], NBEAC: [[4, 1]], PEC: [[8, 1]] },
  { NCEAC: [[10, 1]], NBEAC: [], PEC: [[12, 1]] },
  { NCEAC: [[6, 0.5]], NBEAC: [[5, 0.5]], PEC: [[11, 1]] },
  { NCEAC: [[4, 0.5]], NBEAC: [[8, 1]], PEC: [[3, 0.5]] },
];
export function seedLinks(ours: CouncilKey, theirs: CouncilKey): Link[] {
  const best = new Map<string, Link>();
  for (const t of THEMES) for (const [a, wa] of t[theirs] || []) for (const [b, wb] of t[ours] || []) {
    const k = `${a}-${b}`, w = Math.min(wa, wb);
    if ((best.get(k)?.w || 0) < w) best.set(k, { their: a, ours: b, w });
  }
  return Array.from(best.values()).sort((x, y) => x.ours - y.ours || x.their - y.their);
}

export async function councilOfProgram(chairmanId: string, program: string): Promise<CouncilKey | null> {
  const dp = await prisma.departmentProgram.findFirst({ where: { chairmanId, degreeProgram: program }, select: { accreditationBody: true } });
  const k = (dp?.accreditationBody || "").toUpperCase();
  return isCouncilKey(k) ? k : /comput|software|\bcs\b|\bit\b|data/i.test(program) ? "NCEAC" : /bba|business|commerce|manage|account/i.test(program) ? "NBEAC" : /engineer|\bbe\b|bsc eng/i.test(program) ? "PEC" : null;
}

export type Crosswalk = { id: string; chairmanId: string; ourProgram: string; theirProgram: string; map: string; status: string; byId: string; at: Date; history: string };
export const linksOf = (c: Crosswalk | null): Link[] => { try { return c ? JSON.parse(c.map) : []; } catch { return []; } };

export async function crosswalk(chairmanId: string, ourProgram: string, theirProgram: string): Promise<Crosswalk | null> {
  const found = await db.gaCrosswalk.findUnique({ where: { chairmanId_ourProgram_theirProgram: { chairmanId, ourProgram, theirProgram } } }).catch(() => null);
  if (found) return found;
  const [o, t] = await Promise.all([councilOfProgram(chairmanId, ourProgram), councilOfProgram(chairmanId, theirProgram)]);
  if (!o || !t) return null;
  return db.gaCrosswalk.create({ data: { id: randomUUID(), chairmanId, ourProgram, theirProgram, map: JSON.stringify(seedLinks(o, t)), status: "DRAFT", byId: "system", history: JSON.stringify([{ at: new Date(), by: "system", what: `Seeded from ${COUNCIL_SETS[t].prefix} → ${COUNCIL_SETS[o].prefix} themes` }]) } }).catch(() => null);
}
export function translate(links: Link[], theirGas: number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const g of theirGas) for (const l of links.filter((x) => x.their === g)) out.set(l.ours, Math.max(out.get(l.ours) || 0, l.w));
  return out;
}

export async function crosswalkAct(user: { id: string; name: string }, chairmanId: string, body: any): Promise<{ ok: true } | { error: string }> {
  const cw = (await db.gaCrosswalk.findUnique({ where: { id: String(body.id || "") } }).catch(() => null)) as Crosswalk | null;
  if (!cw || cw.chairmanId !== chairmanId) return { error: "Crosswalk not found." };
  const dept = await departmentOfProgram(chairmanId, cw.ourProgram);
  const com = await omcCommittee(chairmanId, dept);
  const hist = (() => { try { return JSON.parse(cw.history) as unknown[]; } catch { return []; } })();
  const a = String(body.action || "");
  if (a === "edit") {
    if (!com.all.includes(user.id)) return { error: "Only our OMC edits the crosswalk." };
    const their = Number(body.their), ours = Number(body.ours), w = body.w === "" || body.w == null ? 1 : Number(body.w);
    if (!their || !ours) return { error: "Choose both attributes." };
    let links = linksOf(cw).filter((l) => !(l.their === their && l.ours === ours));
    if (w > 0) links = [...links, { their, ours, w: Math.min(1, w) }].sort((x, y) => x.ours - y.ours || x.their - y.their);
    hist.push({ at: new Date(), by: user.name, what: w > 0 ? `${their} → ${ours} at ${Math.round(w * 100)} %` : `removed ${their} → ${ours}` });
    await db.gaCrosswalk.update({ where: { id: cw.id }, data: { map: JSON.stringify(links), status: "DRAFT", byId: user.id, at: new Date(), history: JSON.stringify(hist) } });
    await db.gaCrosswalkEndorse.deleteMany({ where: { crosswalkId: cw.id } });
    return { ok: true };
  }
  if (a === "endorse") {
    if (!com.all.includes(user.id)) return { error: "You are not on this department's OMC." };
    const yes = !(body.endorse === false || body.endorse === "no");
    await db.gaCrosswalkEndorse.upsert({ where: { crosswalkId_userId: { crosswalkId: cw.id, userId: user.id } }, create: { crosswalkId: cw.id, userId: user.id, userName: user.name, endorse: yes, comment: body.note || null }, update: { endorse: yes, comment: body.note || null, at: new Date() } });
    return { ok: true };
  }
  if (a === "finalise") {
    if (!isConvener(com, user.id)) return { error: "Only the OMC Convener finalises." };
    const e = ((await db.gaCrosswalkEndorse.findMany({ where: { crosswalkId: cw.id, endorse: true } })) as { userId: string }[]).filter((x) => com.all.includes(x.userId));
    if (!majority(e.length, com.all.length)) return { error: `A majority must endorse first (${e.length} of ${com.all.length}).` };
    hist.push({ at: new Date(), by: user.name, what: "Finalised" });
    await db.gaCrosswalk.update({ where: { id: cw.id }, data: { status: "FINAL", history: JSON.stringify(hist) } });
    await notifyUsers(com.all, { kind: "OMC", title: `GA crosswalk ${cw.ourProgram} ↔ ${cw.theirProgram} finalised`, href: "/omc/ga-crosswalk", exceptId: user.id });
    return { ok: true };
  }
  return { error: "Unknown action." };
}

// ── Courses of other departments, per term ─────────────────────────────────────────────────────────────────────────
export type ForeignRow = { courseId: string; code: string; title: string; batchId: string; batchLabel: string; ourProgram: string; homeDept: string; mode: "LINKED" | "PLANNED_FOR_PROGRAM" | "UNLINKED"; theirProgram: string | null; homeCourse: string | null;
  plos: { id: string; number: number; title: string }[]; current: string[]; suggested: string[]; from: string; reached: string[]; mismatchChosen: string[]; mismatchExtra: string[]; term: string; status: string; votes: { userName: string; approve: boolean }[] };

export async function foreignCourses(chairmanId: string, coordinatorIds: string[]): Promise<ForeignRow[]> {
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds.concat("none") } }, select: { id: true, batchName: true, degreeProgram: true, coordinatorId: true, startTerm: true, startYear: true } });
  const terms = new Map((await prisma.currentTerm.findMany({ where: { coordinatorId: { in: coordinatorIds.concat("none") } } })).map((t) => [t.coordinatorId, t]));
  const depts = await prisma.department.findMany({ select: { id: true, name: true } });
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const out: ForeignRow[] = [];
  for (const b of batches) {
    const own = await departmentOfProgram(chairmanId, b.degreeProgram);
    const t = terms.get(b.coordinatorId);
    const sem = t ? computeCurrentSemesterNumber(b as never, t as never) : 0;
    const cs = await prisma.course.findMany({ where: { batchId: b.id, courseType: { notIn: LIST_TYPES }, subjectHomeDepartmentId: { not: null }, OR: [{ isOffered: true }, ...(sem > 0 ? [{ semesterNumber: sem }, { semesterNumber: sem + 1 }] : [])] }, select: { id: true, code: true, title: true, subjectHomeDepartmentId: true, contentSyncMember: { select: { groupId: true, isBase: true } }, ploMappings: { select: { ploId: true } }, clos: { where: { source: "SE" }, select: { mappedPlo: { select: { id: true } } } } } });
    const foreign = cs.filter((c) => own && c.subjectHomeDepartmentId !== own);
    if (!foreign.length) continue;
    const plos = await prisma.pLO.findMany({ where: { batchId: b.id }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } });
    const term = t ? `${t.termName} ${t.year}` : "";
    for (const c of foreign) {
      const plan = (await db.courseHomePlan.findUnique({ where: { courseId: c.id } }).catch(() => null)) as { mode: string } | null;
      const base = c.contentSyncMember && !c.contentSyncMember.isBase ? await prisma.courseContentSyncMember.findFirst({ where: { groupId: c.contentSyncMember.groupId, isBase: true }, select: { course: { select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true } }, clos: { where: { source: "SE" }, select: { mappedPlo: { select: { number: true } } } } } } } }) : null;
      const mode: ForeignRow["mode"] = plan?.mode === "PLANNED_FOR_PROGRAM" ? "PLANNED_FOR_PROGRAM" : base ? "LINKED" : "UNLINKED";
      const theirProgram = base?.course.batch?.degreeProgram || null;
      let reachedNums = new Map<number, number>();
      if (mode === "PLANNED_FOR_PROGRAM") for (const x of c.clos) { const p = plos.find((y) => y.id === x.mappedPlo?.id); if (p) reachedNums.set(p.number, 1); }
      else if (base && theirProgram) {
        const cw = await crosswalk(chairmanId, b.degreeProgram, theirProgram);
        reachedNums = translate(linksOf(cw), base.course.clos.map((x) => x.mappedPlo?.number).filter((n): n is number => !!n));
      }
      const reached = plos.filter((p) => reachedNums.has(p.number)).map((p) => p.id);
      const rec = (await db.foreignCourseGa.findUnique({ where: { courseId_term: { courseId: c.id, term } } }).catch(() => null)) as { gas: string; status: string } | null;
      const last = rec ? null : ((await db.foreignCourseGa.findFirst({ where: { courseId: c.id, status: "CONFIRMED" }, orderBy: { at: "desc" } }).catch(() => null)) as { gas: string; term: string } | null);
      const parse = (s?: string) => { try { return s ? (JSON.parse(s) as string[]) : []; } catch { return []; } };
      const suggested = rec ? parse(rec.gas) : last ? parse(last.gas) : reached;
      const current = c.ploMappings.map((m) => m.ploId);
      const chosen = rec?.status === "CONFIRMED" ? parse(rec.gas) : suggested;
      const votes = ((await db.requestVote.findMany({ where: { kind: "FOREIGN_GA", requestId: `${c.id}|${term}` } }).catch(() => [])) as { userName: string; approve: boolean }[]);
      out.push({ courseId: c.id, code: c.code, title: c.title, batchId: b.id, batchLabel: `${b.degreeProgram} — ${b.batchName}`, ourProgram: b.degreeProgram, homeDept: deptName.get(c.subjectHomeDepartmentId || "") || "?", mode, theirProgram, homeCourse: base ? `${base.course.code} ${base.course.title}` : null,
        plos, current, suggested, from: rec ? (rec.status === "CONFIRMED" ? "confirmed" : "proposed") : last ? `last term (${last.term})` : mode === "PLANNED_FOR_PROGRAM" ? "the SE's CLO → GA" : "the crosswalk", reached,
        mismatchChosen: chosen.filter((g) => !reached.includes(g)), mismatchExtra: reached.filter((g) => !chosen.includes(g)), term, status: rec?.status || "PENDING", votes });
    }
  }
  return out;
}

/** Our OMC member proposes / confirms the course's GAs for the term; 2 confirmations (or the panel's 2 of 3) settle it. */
export async function confirmForeignGa(user: { id: string; name: string }, courseId: string, term: string, gas: string[]) {
  const key = `${courseId}|${term}`;
  const rec = await db.foreignCourseGa.findUnique({ where: { courseId_term: { courseId, term } } }).catch(() => null);
  const sameSet = rec && JSON.stringify((JSON.parse(rec.gas) as string[]).slice().sort()) === JSON.stringify(gas.slice().sort());
  if (!rec || !sameSet) { // a different set starts the confirmations again
    await db.requestVote.deleteMany({ where: { kind: "FOREIGN_GA", requestId: key } });
    await db.foreignCourseGa.upsert({ where: { courseId_term: { courseId, term } }, create: { courseId, term, gas: JSON.stringify(gas), status: "PENDING" }, update: { gas: JSON.stringify(gas), status: "PENDING", at: new Date() } });
  }
  const v = await requestVote({ kind: "FOREIGN_GA", requestId: key, courseId, user, approve: true });
  if ("error" in v) return v;
  if (v.decided === "approved") {
    await db.foreignCourseGa.update({ where: { courseId_term: { courseId, term } }, data: { status: "CONFIRMED", confirmedBy: JSON.stringify(v.votes.filter((x) => x.approve).map((x) => x.userName)), at: new Date() } });
    await prisma.coursePloMapping.deleteMany({ where: { courseId, ploId: { notIn: gas.concat("none") } } });
    for (const ploId of gas) await prisma.coursePloMapping.upsert({ where: { courseId_ploId: { courseId, ploId } }, create: { courseId, ploId, assignedById: user.id, source: "MANUAL" }, update: {} });
  }
  return { ok: true as const, message: v.message };
}

/** For the home SE: the other programs that take this course and the GAs it counts toward there. */
export async function alsoUsedIn(courseId: string) {
  const m = await prisma.courseContentSyncMember.findUnique({ where: { courseId }, select: { groupId: true, isBase: true } });
  if (!m?.isBase) return [];
  const followers = await prisma.courseContentSyncMember.findMany({ where: { groupId: m.groupId, isBase: false }, select: { course: { select: { id: true, title: true, batch: { select: { degreeProgram: true, batchName: true } }, ploMappings: { select: { plo: { select: { number: true } } } } } } } });
  const home = await prisma.course.findUnique({ where: { id: courseId }, select: { batch: { select: { degreeProgram: true, coordinator: { select: { managedById: true } } } } } });
  const out: { program: string; batch: string; title: string; gas: string[] }[] = [];
  for (const f of followers) {
    const prog = f.course.batch?.degreeProgram || "";
    if (!prog || prog === home?.batch?.degreeProgram) continue;
    const k = await councilOfProgram(home?.batch?.coordinator.managedById || "", prog);
    out.push({ program: prog, batch: f.course.batch?.batchName || "", title: f.course.title, gas: f.course.ploMappings.map((p) => (k ? attrCode(k, p.plo.number) : `GA-${p.plo.number}`)) });
  }
  return out;
}
