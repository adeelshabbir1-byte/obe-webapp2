import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { cdb, rulesOn, isActiveMember, hasValidNoc, myPeople, type Centre, type Rules } from "./consortium";
import { findOwningChairmanId } from "./institutionCurriculum";

// Consortium phase 3: courses opened to students of other member universities, listed on the public catalog.
// A visiting seat is a place in an on-campus section; an ODL course is taught online (live, self-paced or blended).
// Every offering is checked against the rules book when it is opened, and again whenever the catalog is read
// (an ODL course disappears the day the university's ODL NOC expires).

export const MODES: [string, string, string][] = [
  ["ON_CAMPUS", "On campus (visiting seat)", "Attend the host's classes in person"],
  ["LIVE_ONLINE", "Live online (ODL)", "Synchronous online classes"],
  ["BLENDED", "Blended (ODL)", "Online with face-to-face sessions"],
  ["SELF_PACED", "Self-paced online (ODL)", "Recorded material with tutor support"],
];
export const isOdl = (mode: string) => mode !== "ON_CAMPUS";
export const modeLabel = (m: string) => MODES.find(([k]) => k === m)?.[1] || m;
export const OFFER_ROLES = ["CHAIRMAN", "PROGRAM_COORDINATOR", "PROGRAM_LEAD", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR"];

export type Offering = { id: string; chairmanId: string; courseId: string; term: string; mode: string; seats: number; feePerCredit: number; currency: string; campusId: string | null; schedule: string | null; labArrangement: string | null; deadline: Date | null; startsOn: Date | null; centresJson: string; about: string | null; status: string; createdAt: Date };
const j = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
export const centresOf = (o: Offering) => j<string[]>(o.centresJson, []);
/** Lab credit hours of a batch course (from its lab share). */
export const labOf = (c: { creditHours: number; hasLab: boolean; labPct: number }) => (c.hasLab && c.labPct ? Math.round((c.creditHours * c.labPct) / 100) : 0);

/** The coming terms an offering can be for. */
export function terms(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  const seq: string[] = [];
  let t = m < 5 ? "Spring" : m < 8 ? "Summer" : "Fall", yy = y;
  for (let i = 0; i < 4; i++) { seq.push(`${t} ${yy}`); t = t === "Spring" ? "Summer" : t === "Summer" ? "Fall" : "Spring"; if (t === "Spring") yy++; }
  return seq;
}

/** The courses this person may open: everything in the institute for its heads, a coordinator's own courses otherwise. */
export async function openableCourses(user: { id: string; role: string }, chairmanId: string) {
  const coordinators = user.role === "PROGRAM_COORDINATOR" ? [user.id] : [chairmanId, ...(await myPeople(chairmanId))];
  return prisma.course.findMany({ where: { coordinatorId: { in: coordinators }, batchId: { not: null }, isNonCredit: false }, select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, hasLab: true, labPct: true, batch: { select: { batchName: true, degreeProgram: true } } }, orderBy: [{ batch: { batchName: "desc" } }, { semesterNumber: "asc" }, { code: "asc" }], take: 600 });
}

/** What stops this offering from being listed (empty = fine). */
export async function problems(o: Pick<Offering, "chairmanId" | "courseId" | "mode" | "seats" | "labArrangement" | "centresJson" | "status">, rules: Rules) {
  const p: string[] = [];
  if (!(await isActiveMember(o.chairmanId))) p.push("your university is not an active consortium member");
  const c = await prisma.course.findUnique({ where: { id: o.courseId }, select: { creditHours: true, hasLab: true, labPct: true, batch: { select: { degreeProgram: true } } } });
  if (!c) { p.push("course not found"); return p; }
  if (o.seats <= 0) p.push("give the number of consortium seats");
  if (isOdl(o.mode)) {
    if (rules.odlNocRequired && !(await hasValidNoc(o.chairmanId, "ODL_INSTITUTIONAL"))) p.push("ODL needs a valid HEC ODL recognition (NOC) — add it on the Consortium page");
    if (o.seats > Number(rules.odlMaxPerSection)) p.push(`ODL sections take at most ${rules.odlMaxPerSection} students`);
    const coords = await myPeople(o.chairmanId);
    const batches = c.batch ? await prisma.batch.count({ where: { degreeProgram: c.batch.degreeProgram, coordinatorId: { in: [o.chairmanId, ...coords] } } }) : 0;
    if (batches < Number(rules.odlMinF2FBatches)) p.push(`HEC's ODL policy needs at least ${rules.odlMinF2FBatches} face-to-face batches of ${c.batch?.degreeProgram || "the programme"} first (OBEHUB has ${batches})`);
  }
  if (labOf(c) > 0 && rules.labsFaceToFace && (isOdl(o.mode) || o.mode === "ON_CAMPUS") && !o.labArrangement?.trim()) p.push("this course has a lab — say where and when the face-to-face lab sessions happen");
  if (rules.examProctored && !j<string[]>(o.centresJson, []).length) p.push("choose at least one exam centre for the final exam");
  return p;
}

export async function saveOffering(actor: { id: string; role: string }, chairmanId: string, f: Record<string, unknown>) {
  if (!OFFER_ROLES.includes(actor.role)) throw new Error("The Chairman, Head of Department or a Program Coordinator opens courses to the consortium.");
  const str = (k: string, n = 300) => (typeof f[k] === "string" ? (f[k] as string).trim().slice(0, n) : "");
  const id = str("id", 60) || null;
  const prev = id ? ((await cdb.consortiumOffering.findUnique({ where: { id } })) as Offering | null) : null;
  if (id && (!prev || prev.chairmanId !== chairmanId)) throw new Error("Not found.");
  const courseId = prev?.courseId || str("courseId", 60);
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, coordinatorId: true, code: true } });
  if (!course || (await findOwningChairmanId(course.coordinatorId)) !== chairmanId) throw new Error("Choose one of your university's courses.");
  const mode = str("mode", 20);
  if (!MODES.some(([k]) => k === mode)) throw new Error("Choose how the course is taught.");
  const term = str("term", 20);
  if (!/^(Spring|Summer|Fall) \d{4}$/.test(term)) throw new Error("Choose the term.");
  // Exam centres come as checkboxes centre_<id> (or a list in `centres`).
  const ticked = Object.keys(f).filter((k) => k.startsWith("centre_")).map((k) => [k.slice(7), f[k] === true] as const);
  const centres = ticked.length ? (prev ? centresOf(prev).filter((c) => !ticked.some(([k]) => k === c)) : []).concat(ticked.filter(([, on]) => on).map(([k]) => k))
    : Array.isArray(f.centres) ? (f.centres as unknown[]).map(String) : prev ? centresOf(prev) : [];
  const mine = ((await cdb.examCentre.findMany({ where: { chairmanId, status: "ACTIVE" } })) as Centre[]).map((c) => c.id);
  const d = (k: string) => (str(k) ? new Date(str(k)) : null);
  const data = { mode, term, seats: Math.max(0, Math.round(Number(f.seats) || 0)), feePerCredit: Math.max(0, Math.round(Number(f.feePerCredit) || 0)), currency: str("currency", 3) || "PKR", campusId: str("campusId", 60) || null, schedule: str("schedule", 300) || null, labArrangement: str("labArrangement", 300) || null, deadline: d("deadline"), startsOn: d("startsOn"), centresJson: JSON.stringify(centres.filter((c) => mine.includes(c))), about: str("about", 1500) || null };
  const { rules } = await rulesOn();
  const status = f.status === "CLOSED" || f.status === "WITHDRAWN" ? String(f.status) : "OPEN";
  const p = status === "OPEN" ? await problems({ chairmanId, courseId, ...data, status }, rules) : [];
  if (p.length) throw new Error(`Not listed yet: ${p.join("; ")}.`);
  if (prev) await cdb.consortiumOffering.update({ where: { id: prev.id }, data: { ...data, status } });
  else {
    if (await cdb.consortiumOffering.findFirst({ where: { courseId, term } })) throw new Error(`${course.code} is already open for ${term} — edit that listing.`);
    await cdb.consortiumOffering.create({ data: { id: randomUUID(), chairmanId, courseId, ...data, status, createdById: actor.id } });
  }
  await writeAuditLog({ actorUserId: actor.id, action: prev ? "CONSORTIUM_OFFERING_UPDATED" : "CONSORTIUM_OFFERING_OPENED", entityType: "ConsortiumOffering", entityId: courseId, metadata: { term, mode, seats: data.seats, status } });
  return status === "OPEN" ? `${course.code} is listed on the consortium catalog for ${term}.` : "Saved.";
}

/** Seats already taken (accepted visiting students) per offering — filled in by phase 4. */
export async function seatsTaken(ids: string[]) {
  const rows = (await cdb.consortiumApplication?.groupBy({ by: ["offeringId"], where: { offeringId: { in: ids }, status: { in: ["ACCEPTED", "ENROLLED"] } }, _count: { _all: true } }).catch(() => [])) as { offeringId: string; _count: { _all: number } }[] | undefined;
  return new Map((rows || []).map((r) => [r.offeringId, r._count._all]));
}

export type Listing = Awaited<ReturnType<typeof catalog>>[number];
/** The public catalog: open offerings of active members that still meet the rules today. */
export async function catalog(f: { q?: string; uni?: string; mode?: string; term?: string; id?: string } = {}) {
  const { rules } = await rulesOn();
  const active = ((await cdb.consortiumMember.findMany({ where: { status: "ACTIVE" }, select: { chairmanId: true, city: true } })) as { chairmanId: string; city: string | null }[]);
  const where: Record<string, unknown> = { status: "OPEN", chairmanId: { in: active.map((a) => a.chairmanId) } };
  if (f.id) where.id = f.id;
  if (f.uni) where.chairmanId = f.uni;
  if (f.mode) where.mode = f.mode;
  if (f.term) where.term = f.term;
  const offs = (await cdb.consortiumOffering.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 })) as Offering[];
  const courses = await prisma.course.findMany({ where: { id: { in: offs.map((o) => o.courseId) } }, select: { id: true, code: true, title: true, creditHours: true, hasLab: true, labPct: true, masterCourseId: true, catalogDescription: true, prerequisiteCourse: { select: { code: true, title: true } }, instructor: { select: { id: true, name: true } }, clos: { where: { source: "SE" }, orderBy: { code: "asc" }, select: { code: true, statement: true, bloomLevel: true } }, batch: { select: { degreeProgram: true } } } });
  const heads = await prisma.user.findMany({ where: { id: { in: offs.map((o) => o.chairmanId) } }, select: { id: true, instituteName: true, name: true } });
  const centres = (await cdb.examCentre.findMany({ where: { id: { in: offs.flatMap(centresOf) } } })) as Centre[];
  const odlOk = new Map<string, boolean>();
  for (const o of offs.filter((x) => isOdl(x.mode))) if (!odlOk.has(o.chairmanId)) odlOk.set(o.chairmanId, !rules.odlNocRequired || (await hasValidNoc(o.chairmanId, "ODL_INSTITUTIONAL")));
  const taken = await seatsTaken(offs.map((o) => o.id));
  const q = (f.q || "").toLowerCase().trim();
  return offs.map((o) => {
    const c = courses.find((x) => x.id === o.courseId);
    const h = heads.find((x) => x.id === o.chairmanId);
    if (!c) return null;
    if (isOdl(o.mode) && !odlOk.get(o.chairmanId)) return null;
    const row = { ...o, course: c, lab: labOf(c), university: h?.instituteName || h?.name || "—", city: active.find((a) => a.chairmanId === o.chairmanId)?.city || null, centres: centres.filter((x) => centresOf(o).includes(x.id) && x.status === "ACTIVE"), seatsLeft: Math.max(0, o.seats - (taken.get(o.id) || 0)), open: !o.deadline || o.deadline >= new Date(new Date().toDateString()) };
    if (q && !`${c.code} ${c.title} ${row.university} ${c.batch?.degreeProgram || ""}`.toLowerCase().includes(q)) return null;
    return row;
  }).filter((x): x is NonNullable<typeof x> => !!x);
}
