import { randomUUID } from "crypto";
import { prisma } from "./db";
import { hashPassword } from "./auth";
import { writeAuditLog } from "./audit";
import { MIGRATIONS } from "./migrationProbes";
import * as demo from "./demoInstitute";
import { readyPlan, PROGRAMS, semNow, STUDENTS_PER_BATCH, sampleScore, termDates, rng, ability, roleByKey, type Prog } from "./demoReadyCore";

// "Make demo ready" (Super Admin): builds the demo institute, then finishes the running semester everywhere except one
// course, whose final-exam marks are left for the live demo: enter them, submit, approve (HOD), publish (Controller),
// then open the SAR. Everything is written through the system's own engines and tables. Only an institute flagged in
// DemoFlag is ever touched; the one-click demo logins and "Fill sample marks" are refused anywhere else.

const db = prisma as unknown as Record<string, any>;
type Flag = { chairmanId: string; demoCourseId: string | null; loginsOn: boolean; readyAt: Date | null; resetAt: Date | null; stateJson: string };

export async function flagOf(chairmanId: string | null | undefined): Promise<Flag | null> {
  if (!chairmanId) return null;
  return ((await db.demoFlag?.findUnique({ where: { chairmanId } }).catch(() => null)) as Flag | null) || null;
}
export const isDemoInstitute = async (chairmanId: string | null | undefined) => !!(await flagOf(chairmanId));

/** The demo institute and its flag (null when there is none, or when the institute is not flagged as a demo). */
export async function theDemo() {
  const head = await demo.demoHead();
  if (!head) return null;
  const flag = await flagOf(head.id);
  return flag ? { head, flag } : null;
}

/** Migrations not yet run on this database (the button says to run them first). */
export async function missingMigrations() {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`);
  const tables = new Set(rows.map((r) => r.table_name)), cols = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  return MIGRATIONS.filter((m) => !(m.c ? cols.has(`${m.t}.${m.c}`) : tables.has(m.t))).map((m) => m.f);
}

/** The Super Admin confirms that the institute with the demo head's login is the demo, so it can be rebuilt and
 *  signed into (an institute built before the flag existed, or renamed). Only that one login's institute. */
export async function adoptDemo(byId: string) {
  const head = await demo.demoHead();
  if (!head) throw new Error("There is no institute with the demo head's login.");
  if (!db.demoFlag) throw new Error("Run prisma/migration_demo_ready.sql in Supabase first.");
  try { await db.demoFlag.upsert({ where: { chairmanId: head.id }, create: { chairmanId: head.id }, update: {} }); }
  catch { throw new Error("Run prisma/migration_demo_ready.sql in Supabase first (the demo flag table is missing)."); }
  await writeAuditLog({ actorUserId: byId, action: "DEMO_ADOPTED", entityType: "User", entityId: head.id });
  const h = await prisma.user.findUnique({ where: { id: head.id }, select: { instituteName: true } });
  return `“${h?.instituteName || head.name}” is now flagged as the demo.`;
}
export async function readyStatus() {
  const head = await demo.demoHead();
  const flag = head ? await flagOf(head.id) : null;
  const course = flag?.demoCourseId ? await prisma.course.findUnique({ where: { id: flag.demoCourseId }, select: { id: true, code: true, title: true, instructor: { select: { name: true, username: true } } } }) : null;
  const result = course ? await db.courseResult.findUnique({ where: { courseId: course.id } }).catch(() => null) : null;
  const nm = head ? await prisma.user.findUnique({ where: { id: head.id }, select: { instituteName: true } }).catch(() => null) : null;
  return { exists: !!head, flagged: !!flag, notDemo: !!head && !flag, headInstitute: nm?.instituteName || null, steps: readyPlan().map((s) => s.label), missing: await missingMigrations().catch(() => [] as string[]),
    demoCourse: course ? { ...course, result: (result?.status as string) || "NOT SUBMITTED" } : null, loginsOn: flag?.loginsOn ?? false, readyAt: flag?.readyAt || null, resetAt: flag?.resetAt || null, state: J<Record<string, unknown>>(flag?.stateJson, {}) };
}
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

// ---- people and batches
const user = (username: string) => prisma.user.findUnique({ where: { username }, select: { id: true, name: true, role: true, managedById: true, departmentId: true, extraRoles: true } });
async function must(username: string) { const u = await user(username); if (!u) throw new Error(`Demo user ${username} is missing — run the earlier steps first.`); return u; }
const progOf = (p: Prog) => PROGRAMS.find((x) => x.p === p)!;
async function batchOf(p: Prog, start: number) {
  const lead = await must(progOf(p).lead);
  const b = await prisma.batch.findFirst({ where: { coordinatorId: lead.id, startTerm: "Fall", startYear: start }, select: { id: true, coordinatorId: true, degreeProgram: true, batchName: true, startTerm: true, startYear: true } });
  return { lead, batch: b };
}
async function teachersOf(leadId: string) {
  return (await prisma.user.findMany({ where: { managedById: leadId, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] as never } }, orderBy: { username: "asc" }, select: { id: true } })).map((t) => t.id);
}
async function headUser() { const h = await demo.demoHead(); if (!h) throw new Error("Build the demo institute first."); return (await prisma.user.findUnique({ where: { id: h.id } }))!; }

/** One step of the plan. `again` asks the page to call the same step once more (removing a big demo takes several passes). */
export async function runReadyStep(i: number, superUserId: string): Promise<{ label: string; again?: boolean; info?: string }> {
  const st = readyPlan()[i];
  if (!st) throw new Error("No such step.");
  const out = (info?: string, again?: boolean) => ({ label: st.label, info, again });
  switch (st.key) {
    case "delete": {
      const head = await demo.demoHead();
      if (!head) return out("Nothing to remove.");
      if (!(await flagOf(head.id))) {
        // A demo built before the flag existed is recognised by its name; anything else is never touched.
        const h = await prisma.user.findUnique({ where: { id: head.id }, select: { instituteName: true } });
        if (!/\(DEMO\)/.test(h?.instituteName || "")) throw new Error("This institute is not flagged as a demo. Nothing was changed.");
        await db.demoFlag.create({ data: { chairmanId: head.id } });
      }
      const r = await demo.deletePass();
      return out(`${r.removed ?? 0} rows removed`, r.left > 0);
    }
    case "setup": {
      if (await demo.demoHead()) return out("Already there.");
      await demo.setupDemo(superUserId, [{ sourceBatchId: demo.BUILTIN_CS, short: "CS" }, { sourceBatchId: demo.BUILTIN_CS, short: "AI" }], { students: STUDENTS_PER_BATCH, teachers: 10 });
      return out();
    }
    case "courses": {
      const { lead, batch } = await batchOf(st.p!, st.start!);
      if (!batch) throw new Error(`Batch ${st.p} ${st.start} is missing.`);
      const source = st.start === 2024 ? (st.p === "BBA" ? "BUILTIN:BBA" : demo.BUILTIN_CS) : (await batchOf(st.p!, 2024)).batch!.id;
      return out(`${await demo.coursesStep(batch.id, source, st.sem!, await teachersOf(lead.id))} courses`);
    }
    case "activity": {
      const { batch } = await batchOf(st.p!, st.start!);
      if (!batch) throw new Error(`Batch ${st.p} ${st.start} is missing.`);
      return out(`${await demo.activityStep(batch.id, st.sem!)} courses`);
    }
    case "finish": await demo.finishDemo(); return out();
    case "business": { const { addBusinessSchool } = await import("./demoCampus"); await addBusinessSchool({ students: STUDENTS_PER_BATCH }); return out(); }
    case "finishBatch": { const { batch } = await batchOf(st.p!, st.start!); if (batch) await demo.finishDemo([batch.id]); return out(); }
    case "campus": { const r = await campusPart(st.part!, 35_000); return out(String(r ?? "").slice(0, 300), !!(r as { more?: boolean } | null)?.more); }
    case "people": return out(await people());
    case "addBatch": return out(await addBatch(st.p!, st.start!));
    case "bos": return out(await bosApproval());
    case "plans": return out(await planVotes());
    case "batchApproval": return out(await batchApprovals());
    case "method": return out(await methodAndLimits());
    case "pickDemo": return out(await pickDemoCourse());
    case "endTerm": return out(await endTerm(st.p!, st.start!));
    case "approve": { const r = await approveResults(st.p!, st.start!); return out(r.text, r.more); }
    case "warning": return out(await earlyWarning());
    case "faulty": return out(await faultyQuestion());
    case "history": return out(await history(st.p!, st.start!));
    case "samples": return out(await samples());
    case "polish": return out(await polish(st.p!));
    case "facilities": return out(await facilities());
    case "newer": return out(await (await import("./demoNewer")).newerPart(st.part!, superUserId));
    case "check": return out(await finalCheck());
  }
  throw new Error(`Unknown step ${st.key}.`);
}

/** The campus / accreditation parts the demo page has always run (one call each). */
export async function campusPart(part: string, budgetMs?: number) {
  const m = (await import("./demoCampus"));
  const map: Record<string, () => Promise<unknown>> = {
    people: m.campusPeople, students: m.campusStudents, accreditation: m.campusAccreditation, activity: m.campusActivity, surveys: m.campusSurveys, content: m.campusBbaContent, fixes: m.campusFixes,
    governance: async () => (await import("./demoGovernance")).campusGovernance(), nceac: async () => (await import("./demoNceacPortal")).campusNceacPortal(), complex: async () => (await import("./demoComplex")).campusComplexProblems(),
    ugpolicy: async () => (await import("./demoUgPolicy")).campusUgPolicy(), hemis: async () => (await import("./demoHemis")).campusHemis(), coursefiles: async () => (await import("./demoCourseFiles")).campusCourseFiles(budgetMs),
    labs: async () => (await import("./demoLabTheory")).campusLabTheory(), moderation: async () => (await import("./demoModeration")).campusModeration(), registers: async () => (await import("./demoRegisters")).campusRegisters(),
    approvals: async () => (await import("./demoApprovals")).campusApprovals(), dashboard: async () => (await import("./demoDashboard")).campusDashboard(), signoff: async () => (await import("./demoSignoff")).campusSignoff(),
    support: async () => (await import("./demoSupport")).campusSupport(), library: async () => (await import("./demoLibrary")).campusLibrary(), assets: async () => (await import("./demoAssets")).campusAssets(),
    recruitment: async () => (await import("./demoRecruitment")).campusRecruitment(), research: async () => (await import("./demoResearch")).campusResearch(), billing: async () => (await import("./demoBilling")).campusBilling(),
    quality: async () => (await import("./demoQuality")).campusQuality(), campusfees: async () => (await import("./demoQuality")).campusMultiFees(),
  };
  const f = map[part];
  if (!f) throw new Error(`Unknown campus part ${part}.`);
  return f();
}

/** The organisation chart's people: OMC Convener and 4 members, BOS Convener, Controller, QEC, Department Coordinator,
 *  faculty types (permanent / shared / visiting) and advisors. */
async function people() {
  const head = await headUser();
  const computing = await prisma.department.findFirst({ where: { chairmanId: head.id, name: "Department of Computing" }, select: { id: true } });
  const business = await prisma.department.findFirst({ where: { chairmanId: head.id, name: "Dream Business School" }, select: { id: true } });
  const hash = await hashPassword(demo.DEMO_PASSWORD);
  const ensure = async (username: string, name: string, role: string, extra: Record<string, unknown> = {}) => {
    const u = await user(username);
    if (u) { if (Object.keys(extra).length) await prisma.user.update({ where: { id: u.id }, data: extra as never }); return u.id; }
    const id = randomUUID();
    await prisma.user.create({ data: { id, username, email: `${username}@dreaminstitute.demo`, passwordHash: hash, name, role, mustChangePassword: false, managedById: head.id, ...extra } as never });
    return id;
  };
  const dept = computing?.id || null;
  await ensure("dream.dc", "Dr. Rehan Aslam", "DEPARTMENT_COORDINATOR", { departmentId: dept });
  await ensure("dream.omc", "Dr. Nida Farooq", "OMC", { departmentId: dept, extraRoles: ["OMC_CONVENER"] });
  const omcNames = ["Dr. Sana Javed", "Dr. Bilal Hassan", "Dr. Uzma Rafiq", "Mr. Zeeshan Haider"];
  for (let i = 0; i < 4; i++) await ensure(`dream.omc${i + 2}`, omcNames[i], "OMC", { departmentId: dept });
  const bos = await ensure("dream.bos", "Prof. Dr. Javed Iqbal", "INSTRUCTOR", { departmentId: dept });
  const controller = await ensure("dream.controller", "Mr. Asif Nawaz", "INSTRUCTOR", { extraRoles: ["EXAM_CONTROLLER"] });
  const qec = await ensure("dream.qec", "Dr. Farah Naz", "INSTRUCTOR", { departmentId: dept });
  // The QEC In-charge duty moves to the QEC login; the chart's Controller and QEC posts get their holders.
  const { setDuty, QEC_INCHARGE } = await import("./duties");
  const t3 = await user("dream.t3");
  if (t3?.extraRoles?.includes(QEC_INCHARGE)) await setDuty(head.id, QEC_INCHARGE, t3.id, false).catch(() => null);
  await setDuty(head.id, QEC_INCHARGE, qec, true).catch(() => null);
  await db.orgPosition?.updateMany({ where: { chairmanId: head.id, role: "EXAM_CONTROLLER" }, data: { holderId: controller } }).catch(() => null);
  await db.orgPosition?.updateMany({ where: { chairmanId: head.id, role: "QEC_INCHARGE" }, data: { holderId: qec } }).catch(() => null);
  void bos;
  // Faculty types: most permanent, one shared with the business school, two visiting.
  const teachers = await prisma.user.findMany({ where: { OR: [{ managedById: head.id }, { managedBy: { managedById: head.id } }], role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] as never } }, orderBy: { username: "asc" }, select: { id: true, username: true } });
  for (const t of teachers) {
    const type = ["dream.t4", "dream.b6"].includes(t.username) ? "Visiting" : "Permanent";
    const extra = t.username === "dream.t5" ? { affiliation: "Shared with Dream Business School (teaches Business Statistics)" } : {};
    await db.facultyProfile.upsert({ where: { userId: t.id }, create: { userId: t.id, employmentType: type, ...extra }, update: { employmentType: type, ...extra } }).catch(() => null);
  }
  void business;
  return `${teachers.length} teachers typed; OMC of 5, BOS Convener, Controller, QEC, Department Coordinator`;
}

/** A further batch of a program (S1, S3 or S7 now), with its PLOs and 120 students. */
async function addBatch(p: Prog, start: number) {
  const { lead, batch } = await batchOf(p, start);
  if (batch) return "Already there.";
  const base = (await batchOf(p, 2024)).batch;
  if (!base) throw new Error(`The ${p} 2024 batch is missing.`);
  const pr = progOf(p);
  const teachers = await teachersOf(lead.id);
  const b = await prisma.batch.create({ data: { coordinatorId: lead.id, degreeProgram: base.degreeProgram, batchName: `${pr.code} Fall ${start}`, startTerm: "Fall", startYear: start, studentCount: STUDENTS_PER_BATCH, advisorId: teachers[(start % teachers.length)] || null } as never });
  const plos = await prisma.pLO.findMany({ where: { batchId: base.id }, orderBy: { number: "asc" } });
  await prisma.pLO.createMany({ data: plos.map((x) => ({ coordinatorId: lead.id, batchId: b.id, number: x.number, title: x.title, description: x.description, status: "approved" })) as never });
  const F = ["Ali", "Sara", "Hamza", "Ayesha", "Bilal", "Zainab", "Usman", "Hira", "Fahad", "Maryam", "Saad", "Iqra", "Omar", "Noor", "Taha", "Amna", "Danish", "Fatima", "Hassan", "Laiba", "Zain", "Areeba", "Talha", "Mahnoor"];
  const L = ["Khan", "Ahmed", "Raza", "Malik", "Shah", "Iqbal", "Butt", "Qureshi", "Javed", "Riaz", "Aslam", "Siddiqui", "Mirza", "Haider"];
  const r = rng(`students-${p}-${start}`);
  const hash = await hashPassword(demo.DEMO_PASSWORD);
  await prisma.student.createMany({ data: Array.from({ length: STUDENTS_PER_BATCH }, (_, i) => ({ id: randomUUID(), batchId: b.id, name: `${F[Math.floor(r() * F.length)]} ${L[Math.floor(r() * L.length)]}`, rollNumber: `DRM-${pr.roll}-${String(start).slice(2)}-${String(i + 1).padStart(3, "0")}`, passwordHash: hash, mustChangePassword: false, currentSemesterNumber: semNow(start) })) as never });
  return `${pr.code} Fall ${start}: ${STUDENTS_PER_BATCH} students`;
}

/** Course homes and PREFIX-YCN codes, sent to the Board of Studies, voted, approved at a meeting, minutes made. */
async function bosApproval() {
  const head = await headUser();
  const computing = await prisma.department.findFirst({ where: { chairmanId: head.id, name: "Department of Computing" }, select: { id: true } });
  const business = await prisma.department.findFirst({ where: { chairmanId: head.id, name: "Dream Business School" }, select: { id: true } });
  if (!computing) throw new Error("The Computing department is missing.");
  const cm = await import("./committeeEngine");
  const homes = await import("./courseHomes");
  if ((await db.courseHomeDraft.count({ where: { chairmanId: head.id, status: "APPROVED" } }).catch(() => 0)) > 0) return "Already approved.";
  // Code prefixes: CS for Computing (AI for BS AI), MGT for the business school; 4 digits (year, chain, number).
  for (const [departmentId, program, prefix] of [[computing.id, null, "CS"], [computing.id, "BS Artificial Intelligence", "AI"], ...(business ? [[business.id, null, "MGT"]] : [])] as [string, string | null, string][]) {
    if (!(await db.courseCodeScheme.findFirst({ where: { chairmanId: head.id, departmentId, program } }).catch(() => null))) await db.courseCodeScheme.create({ data: { id: randomUUID(), chairmanId: head.id, departmentId, program, prefix, digits: 4, effectiveTerm: "Fall", effectiveYear: 2026, setById: head.id } }).catch(() => null);
  }
  const bos = await must("dream.bos");
  const bosUser = (await prisma.user.findUnique({ where: { id: bos.id } }))!;
  let committeeId = ((await db.cmtCommittee.findFirst({ where: { chairmanId: head.id, type: "BOS" } }).catch(() => null)) as { id: string } | null)?.id;
  if (!committeeId) committeeId = await cm.saveCommittee(head as never, head.id, { type: "BOS", scope: "DEPARTMENT", scopeId: computing.id, name: "Board of Studies — Computing", mode: "FULL", quorumPct: 50, majorityPct: 50, convenerId: bos.id });
  const have = new Set((await cm.membersOf(committeeId)).map((m) => m.userId));
  for (const u of ["dream.hod.cs", "dream.lead.cs", "dream.lead.ai", "dream.se", "dream.omc"]) { const x = await user(u); if (x && !have.has(x.id)) await cm.addMember(head as never, committeeId, { userId: x.id }).catch(() => null); }
  if (!(await cm.membersOf(committeeId)).some((m) => m.external)) await cm.addMember(head as never, committeeId, { name: "Prof. Rubina Khan", organisation: "Quaid-i-Azam University", external: true }).catch(() => null);
  const meetingId = await cm.addMeeting(head as never, committeeId, { date: "2026-06-20", venue: "Committee Room, Computing Block" });
  const draftId = await homes.saveDraft(head as never, head.id, null, {}, "Course homes and codes for the Fall 2026 offerings.");
  const itemId = await homes.sendToBos(head as never, head.id, draftId, committeeId);
  await db.cmtItem.update({ where: { id: itemId }, data: { meetingId } });
  const members = await cm.membersOf(committeeId);
  for (const m of members) await cm.vote(m.id, itemId, "APPROVE" as never, "").catch(() => null);
  await cm.setAttendance(head as never, meetingId, members.map((m) => m.id));
  await cm.finalise(bosUser as never, itemId, { outcome: "APPROVED" as never, note: "Homes and codes approved as proposed.", meetingDate: "2026-06-20" });
  try { const pdf = await cm.minutesPdf(meetingId); await cm.uploadMinutes(bosUser as never, meetingId, { buf: Buffer.from(pdf.bytes), name: pdf.name, type: "application/pdf" }); } catch { /* storage not set up: the minutes PDF is still made on demand */ }
  const n = await db.courseHome.count({ where: { chairmanId: head.id } }).catch(() => 0);
  return `${n} course homes approved by the BOS`;
}

/** Every Subject Expert's plan approved by the OMC's votes (with the history), one OMC suggestion answered by the SE,
 *  and one plan "Finalised by the OMC". */
async function planVotes() {
  const head = await headUser();
  const courses = await prisma.course.findMany({ where: { coordinator: { managedById: head.id }, templateStatus: "approved" }, orderBy: [{ batchId: "asc" }, { semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, subjectExpertId: true, coordinator: { select: { departmentId: true } }, batch: { select: { startYear: true, degreeProgram: true } } } });
  const done = new Set(((await db.sePlanState.findMany({ where: { courseId: { in: courses.map((c) => c.id) } }, select: { courseId: true } }).catch(() => [])) as { courseId: string }[]).map((x) => x.courseId));
  const { omcOf } = await import("./omcMembers");
  const omcByDept = new Map<string, Awaited<ReturnType<typeof omcOf>>>();
  const states: Record<string, unknown>[] = [], votes: Record<string, unknown>[] = [];
  const at = (k: number) => new Date(Date.UTC(2026, 5, 1 + (k % 25), 9, k % 60));
  let k = 0, suggested = false, finalised = false;
  for (const c of courses) {
    if (done.has(c.id)) continue;
    const dep = c.coordinator.departmentId || "";
    if (!omcByDept.has(dep)) omcByDept.set(dep, await omcOf(head.id, dep || null));
    const omc = omcByDept.get(dep)!;
    if (!omc.members.length) continue;
    k++;
    const special = c.batch?.startYear === 2024 && /Computer/.test(c.batch?.degreeProgram || "");
    let round = 1;
    if (special && !suggested && omc.members.length > 1) {
      // Round 1: one member suggests a change; the SE replies and resubmits; round 2 carries.
      suggested = true; round = 2;
      await db.sePlanSuggestion.create({ data: { id: randomUUID(), courseId: c.id, round: 1, step: "assessments", item: "Final exam", text: "Give CLO-3 at least 20% of the final exam.", reason: "CLO-3 is assessed only once; one weak question would decide its attainment.", byId: omc.members[1].id, byName: omc.members[1].name, status: "REPLIED", reply: "Agreed — Q3 of the final now carries CLO-3 (25%).", repliedAt: at(k) } });
      votes.push(...omc.members.map((m, i) => ({ courseId: c.id, round: 1, memberId: m.id, approve: i !== 1, comment: i === 1 ? "CLO-3 needs more weight in the final." : null, at: at(k) })));
    }
    const byOmc = special && !finalised && suggested && round === 1;
    if (byOmc) finalised = true;
    votes.push(...omc.members.map((m) => ({ courseId: c.id, round, memberId: m.id, approve: true, comment: null, at: at(k + 1) })));
    states.push({ courseId: c.id, round, stepsJson: JSON.stringify({ details: "done", clos: "done", lectures: "done", assessments: "done", questions: "done" }), approvedAt: at(k + 2), approvedById: omc.convenerId || head.id, finalisedByOmc: byOmc, overriddenJson: byOmc ? JSON.stringify(["Assessment plan: the OMC's weights (quizzes 10%, assignments 15%)"]) : null });
  }
  for (let i = 0; i < states.length; i += 500) await db.sePlanState.createMany({ data: states.slice(i, i + 500), skipDuplicates: true });
  for (let i = 0; i < votes.length; i += 1000) await db.sePlanVote.createMany({ data: votes.slice(i, i + 1000), skipDuplicates: true });
  return `${states.length} plans approved with ${votes.length} votes`;
}

async function batchApprovals() {
  const head = await headUser();
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: head.id } }, select: { id: true, coordinatorId: true, startYear: true, coordinator: { select: { departmentId: true } } } });
  const omc = await must("dream.omc");
  let n = 0;
  for (const b of batches) {
    if (await db.batchApproval.findUnique({ where: { batchId: b.id } }).catch(() => null)) continue;
    const when = new Date(Date.UTC(b.startYear, 6, 20));
    await db.batchApproval.create({ data: { batchId: b.id, chairmanId: head.id, departmentId: b.coordinator.departmentId, status: "APPROVED", submittedAt: when, submittedById: b.coordinatorId, reviewJson: JSON.stringify({ omc: "Courses, CLO–GA mapping and assessment limits checked." }), finalisedAt: new Date(when.getTime() + 5 * 864e5), finalisedById: omc.id } });
    n++;
  }
  return `${n} batches approved by the OMC`;
}

/** Attainment method 4 (grade weights) for the institute; the OMC's assessment limits stay at the system's defaults. */
async function methodAndLimits() {
  const head = await headUser();
  const { saveMethodSettings } = await import("./cloMethods");
  await saveMethodSettings({ id: head.id }, head.id, "", { method: "GRADE", passPct: 50, targetPct: 60 } as never);
  return "Method 4 (grade weights), pass 50%, target 60%";
}

/** The one course left for the live demo: a BS CS semester-5 course taught by dream.instructor. */
async function pickDemoCourse() {
  const head = await headUser();
  const flag = await flagOf(head.id);
  if (flag?.demoCourseId && (await prisma.course.findUnique({ where: { id: flag.demoCourseId }, select: { id: true } }))) return "Already chosen.";
  const { batch } = await batchOf("CS", 2024);
  const ins = await must("dream.instructor");
  const now = await prisma.course.findMany({ where: { batchId: batch!.id, semesterNumber: 5, isOffered: true }, orderBy: { code: "asc" }, select: { id: true, code: true, title: true, instructorId: true, courseType: true, assessmentInstruments: { where: { source: "INSTRUCTOR", type: "Final" }, select: { id: true } } } });
  const withFinal = now.filter((c) => c.assessmentInstruments.length);
  const c = withFinal.find((x) => x.instructorId === ins.id && x.courseType === "Core") || withFinal.find((x) => x.instructorId === ins.id) || withFinal.find((x) => x.courseType === "Core") || withFinal[0];
  if (!c) throw new Error("No course of semester 5 has a final exam.");
  if (c.instructorId !== ins.id) {
    await prisma.course.update({ where: { id: c.id }, data: { instructorId: ins.id } });
    await prisma.courseSectionAssignment.updateMany({ where: { courseId: c.id }, data: { instructorId: ins.id } });
  }
  await db.demoFlag.upsert({ where: { chairmanId: head.id }, create: { chairmanId: head.id, demoCourseId: c.id }, update: { demoCourseId: c.id } });
  return `${c.code} ${c.title}`;
}

/** End of teaching for a batch's running semester: every lecture held, attendance, all marks (late entries stamped),
 *  grade cutoffs, sections of at most 50. The demo course keeps its final exam without marks. */
async function endTerm(p: Prog, start: number) {
  const { batch } = await batchOf(p, start);
  if (!batch) throw new Error(`Batch ${p} ${start} is missing.`);
  const flag = await flagOf((await headUser()).id);
  const cur = semNow(start);
  const courses = await prisma.course.findMany({ where: { batchId: batch.id, semesterNumber: cur, isOffered: true }, orderBy: { code: "asc" }, select: { id: true, code: true, instructorId: true, coordinatorId: true } });
  if (!courses.length) return "No running courses.";
  const ids = courses.map((c) => c.id);
  if ((await db.marksDeadline.count({ where: { courseId: { in: ids } } }).catch(() => 0)) > 0) return "Already done.";
  const students = await prisma.student.findMany({ where: { batchId: batch.id }, orderBy: { rollNumber: "asc" }, select: { id: true, rollNumber: true } });
  const T = termDates(new Date());
  const GRADES: [string, number][] = [["A", 85], ["A-", 80], ["B+", 75], ["B", 71], ["B-", 68], ["C+", 64], ["C", 61], ["C-", 58], ["D+", 54], ["D", 50], ["F", 0]];
  let lateLeft = p === "CS" && start === 2024 ? 2 : 0, marksMade = 0;
  for (const c of courses) {
    const by = c.instructorId || c.coordinatorId;
    const rows = await prisma.lectureRow.findMany({ where: { courseId: c.id }, select: { id: true, lectureNumber: true, week: true, source: true } });
    for (const x of rows) await prisma.lectureRow.update({ where: { id: x.id }, data: { actualDate: x.source === "INSTRUCTOR" ? T.lecture(x.lectureNumber, x.week) : null } });
    const have = new Set((await prisma.attendanceRecord.findMany({ where: { courseId: c.id }, distinct: ["lectureRowId"], select: { lectureRowId: true } })).map((a) => a.lectureRowId));
    const r = rng(`attend-${c.id}`);
    const att = rows.filter((x) => x.source === "INSTRUCTOR" && x.lectureNumber !== 16 && !have.has(x.id)).flatMap((x) => students.map((s) => ({ courseId: c.id, lectureRowId: x.id, studentId: s.id, status: r() < 0.62 + 0.35 * ability(s.rollNumber) ? "PRESENT" : r() < 0.15 ? "LATE" : "ABSENT", markedById: by })));
    for (let k = 0; k < att.length; k += 2000) await prisma.attendanceRecord.createMany({ data: att.slice(k, k + 2000) as never, skipDuplicates: true });
    const insts = await prisma.assessmentInstrument.findMany({ where: { courseId: c.id, source: "INSTRUCTOR" }, select: { id: true, type: true, maxScore: true, label: true, lectureLinks: { select: { lectureRow: { select: { lectureNumber: true, week: true } } } } } });
    const marked = new Set((await prisma.studentMark.groupBy({ by: ["instrumentId"], where: { courseId: c.id } })).map((m) => m.instrumentId));
    const isDemo = c.id === flag?.demoCourseId;
    const marks: Record<string, unknown>[] = [], deadlines: Record<string, unknown>[] = [];
    for (const i of insts) {
      const last = i.lectureLinks.reduce((m, l) => (l.lectureRow.lectureNumber > m.n ? { n: l.lectureRow.lectureNumber, w: l.lectureRow.week } : m), { n: 0, w: 0 });
      const held = i.type === "Final" ? T.finalHeld : i.type === "Midterm" ? T.lecture(16, 8) : T.lecture(last.n || 2, last.w || 1);
      const due = new Date(held.getTime() + 7 * 864e5);
      const blank = isDemo && i.type === "Final";
      const late = !blank && lateLeft > 0 && i.type === "Assignment" && !isDemo ? (lateLeft--, true) : false;
      deadlines.push({ instrumentId: i.id, courseId: c.id, heldOn: held, dueOn: due, enteredAt: blank ? null : new Date(held.getTime() + (late ? 11 : 3) * 864e5), late });
      if (blank || marked.has(i.id)) continue;
      for (const s of students) marks.push({ studentId: s.id, courseId: c.id, instrumentId: i.id, score: sampleScore(s.rollNumber, i.id, i.maxScore, i.type), enteredById: by });
    }
    for (let k = 0; k < marks.length; k += 2000) await prisma.studentMark.createMany({ data: marks.slice(k, k + 2000) as never, skipDuplicates: true });
    marksMade += marks.length;
    await db.marksDeadline.createMany({ data: deadlines, skipDuplicates: true });
    if (!(await prisma.courseGradeCutoff.count({ where: { courseId: c.id } }))) await prisma.courseGradeCutoff.createMany({ data: GRADES.map(([letter, minPercent]) => ({ courseId: c.id, letter, minPercent, setById: by })) as never });
    await prisma.courseSectionAssignment.updateMany({ where: { courseId: c.id }, data: { sectionCount: Math.max(1, Math.ceil(students.length / 50)) } });
  }
  return `${courses.length} courses, ${marksMade.toLocaleString()} marks`;
}

/** Results of the running semester submitted, approved by the HOD and published by the Controller — all but the demo course. */
async function approveResults(p: Prog, start: number) {
  const head = await headUser();
  const { batch } = await batchOf(p, start);
  if (!batch) throw new Error(`Batch ${p} ${start} is missing.`);
  const flag = await flagOf(head.id);
  const courses = await prisma.course.findMany({ where: { batchId: batch.id, semesterNumber: semNow(start), isOffered: true, id: { not: flag?.demoCourseId || "none" } }, select: { id: true, code: true, instructorId: true, offeredTermName: true, offeredTermYear: true } });
  const controller = await user("dream.controller");
  const { resultSummary, approversFor } = await import("./resultApproval");
  const day = 864e5, now = Date.now(), deadline = now + 35_000;
  let n = 0, more = false;
  for (const c of courses) {
    if (await db.courseResult.findUnique({ where: { courseId: c.id } }).catch(() => null)) continue;
    if (Date.now() > deadline) { more = true; break; }
    const summary = await resultSummary(c.id);
    const hod = (await approversFor(c.id)).ids[0] || head.id;
    await db.courseResult.create({ data: { courseId: c.id, status: "APPROVED", termName: c.offeredTermName, termYear: c.offeredTermYear, submittedById: c.instructorId, submittedAt: new Date(now - 1.5 * day), decidedById: hod, decidedAt: new Date(now - day), summaryJson: JSON.stringify(summary) } });
    await db.resultPublication.create({ data: { courseId: c.id, chairmanId: head.id, publishedById: controller?.id || head.id, recheckUntil: new Date(now + 7 * day) } }).catch(() => null);
    await writeAuditLog({ actorUserId: c.instructorId || undefined, action: "RESULT_SUBMITTED", entityType: "Course", entityId: c.id, metadata: { students: summary.students, passRate: summary.passRate, mean: summary.mean } });
    await writeAuditLog({ actorUserId: hod, action: "RESULT_APPROVED", entityType: "Course", entityId: c.id, metadata: { students: summary.students, passRate: summary.passRate } });
    await import("./cloMethods").then((m) => m.lockTerm(c.id)).catch(() => null);
    await import("./topicPerformance").then((m) => m.storeTopicPerformance(c.id)).catch(() => 0);
    await import("./ploDelta").then((m) => m.recordPloChange(c.id)).catch(() => null);
    n++;
  }
  if (n) await writeAuditLog({ actorUserId: controller?.id, action: "RESULTS_PUBLISHED", entityType: "Course", entityId: courses[0].id, metadata: { count: n, recheckDays: 7 } });
  return { text: `${n} results approved and published${more ? " — continuing" : ""}`, more };
}

/** One early warning (a lab topic): most of the class below the pass mark on a quiz, the teacher's extra tutorial
 *  (a CQI record), and the next item on that topic showing the improvement. */
async function earlyWarning() {
  const head = await headUser();
  const flag = await flagOf(head.id);
  const { batch } = await batchOf("CS", 2024);
  if ((await db.itemWarning.count({ where: { courseId: { in: (await prisma.course.findMany({ where: { batchId: batch!.id }, select: { id: true } })).map((c) => c.id) } } }).catch(() => 0)) > 0) return "Already there.";
  const courses = await prisma.course.findMany({ where: { batchId: batch!.id, semesterNumber: 5, isOffered: true, id: { not: flag?.demoCourseId || "none" } }, orderBy: { code: "asc" }, select: { id: true, code: true, title: true, instructorId: true, subjectExpertId: true } });
  const real = [];
  for (const x of courses) if (await prisma.lectureRow.count({ where: { courseId: x.id, source: "INSTRUCTOR", NOT: { topic: { contains: "— Unit" } } } }) > 10) real.push(x);
  const c = real.find((x) => /lab|program|data|network|operating|database|web|software/i.test(x.title)) || real[0] || courses[0];
  if (!c) return "No course.";
  const insts = await prisma.assessmentInstrument.findMany({ where: { courseId: c.id, source: "INSTRUCTOR", type: "Quiz" }, orderBy: { label: "asc" }, select: { id: true, label: true, maxScore: true, lectureLinks: { select: { lectureRow: { select: { topic: true } } } } } });
  if (insts.length < 2) return "Not enough quizzes.";
  const [weak, next] = insts;
  const topic = `Lab task: ${weak.lectureLinks[0]?.lectureRow.topic || "practical exercise"}`;
  // The quiz really went badly: scores pulled down so about 58% of the class is below half marks.
  const ms = await prisma.studentMark.findMany({ where: { instrumentId: weak.id }, select: { id: true, score: true } });
  for (const [k, m] of ms.entries()) if (k % 3 !== 0 && m.score / weak.maxScore >= 0.5) await prisma.studentMark.update({ where: { id: m.id }, data: { score: Math.round(weak.maxScore * (0.3 + 0.18 * ((k % 7) / 7)) * 2) / 2 } });
  // After the tutorial most students pass the next quiz on the topic, though not all of them.
  const nm = await prisma.studentMark.findMany({ where: { instrumentId: next.id }, select: { id: true, score: true } });
  for (const [k, m] of nm.entries()) if (k % 4 === 1 && m.score / next.maxScore >= 0.5) await prisma.studentMark.update({ where: { id: m.id }, data: { score: Math.round(next.maxScore * 0.4 * 2) / 2 } });
  const after = await prisma.studentMark.findMany({ where: { instrumentId: weak.id }, select: { score: true } });
  const below = after.filter((m) => m.score / weak.maxScore < 0.5).length;
  const belowPct = Math.round((100 * below) / Math.max(1, after.length));
  const nextMarks = await prisma.studentMark.findMany({ where: { instrumentId: next.id }, select: { score: true } });
  const passing = Math.round((100 * nextMarks.filter((m) => m.score / next.maxScore >= 0.5).length) / Math.max(1, nextMarks.length));
  const raised = new Date(Date.now() - 60 * 864e5), responded = new Date(Date.now() - 58 * 864e5);
  const cqi = await prisma.cqiRecord.create({ data: { chairmanId: head.id, authorId: c.instructorId || head.id, batchId: batch!.id, courseId: c.id, finding: `Early warning: ${weak.label} (${topic}) — ${belowPct}% of students below the pass mark.`, actionTaken: "Extra tutorial: a two-hour lab tutorial with worked examples before the next quiz.", status: "verified-effective", sourceType: "CLO", sourceReference: topic.slice(0, 120), metricBefore: 100 - belowPct, metricAfter: passing, verifiedAt: new Date(Date.now() - 40 * 864e5) } as never });
  const line = `${topic}: ${100 - belowPct}% → ${passing}% passing after extra tutorial`;
  await db.itemWarning.create({ data: { id: randomUUID(), courseId: c.id, instrumentId: weak.id, level: "RED", belowPct, sat: after.length, below, topic, diagnosis: "Most of the class could not finish the lab task in time.", toJson: JSON.stringify([c.instructorId].filter(Boolean)), ccJson: JSON.stringify([c.subjectExpertId].filter(Boolean)), stage: "RESPONDED", raisedAt: raised, respondedAt: responded, respondedById: c.instructorId, actionsJson: JSON.stringify(["TUTORIAL"]), note: "Two-hour lab tutorial with worked examples.", cqiRecordId: cqi.id, effectJson: JSON.stringify({ before: 100 - belowPct, after: passing, line, instrumentId: next.id }) } });
  return line;
}

/** A final-exam question the OMC marks faulty: left out of CLO attainment, still counted in the grade. */
async function faultyQuestion() {
  const head = await headUser();
  const flag = await flagOf(head.id);
  const { batch } = await batchOf("CS", 2024);
  const courses = await prisma.course.findMany({ where: { batchId: batch!.id, semesterNumber: 5, isOffered: true, id: { not: flag?.demoCourseId || "none" } }, orderBy: { code: "asc" }, select: { id: true, assessmentInstruments: { where: { source: "INSTRUCTOR", type: "Final" }, orderBy: { label: "asc" }, select: { id: true, label: true } } } });
  const c = courses.find((x) => x.assessmentInstruments.length >= 2) || courses.find((x) => x.assessmentInstruments.length);
  if (!c) return "No final question.";
  const q = c.assessmentInstruments[c.assessmentInstruments.length - 1];
  if ((await db.cloItemMap.findUnique({ where: { instrumentId: q.id } }).catch(() => null))?.faulty) return "Already there.";
  const omc = (await prisma.user.findUnique({ where: { username: "dream.omc" }, select: { id: true, name: true } }))!;
  const { markFaulty } = await import("./cloMethods");
  await markFaulty(omc, q.id, { faulty: true, reason: "Ambiguous wording: part (b) can be read two ways; the class average was 31%.", noGrade: false });
  return q.label;
}

/** Topic performance of every finished offering and the GA change each approved result made. */
async function history(p: Prog, start: number) {
  const { batch } = await batchOf(p, start);
  if (!batch) return "No batch.";
  const done = await prisma.course.findMany({ where: { batchId: batch.id, isOffered: true, semesterNumber: { lt: semNow(start) } }, select: { id: true } });
  const stored = new Set(((await db.topicPerformance.findMany({ where: { courseId: { in: done.map((c) => c.id) } }, distinct: ["courseId"], select: { courseId: true } }).catch(() => [])) as { courseId: string }[]).map((x) => x.courseId));
  const { storeTopicPerformance } = await import("./topicPerformance");
  let n = 0;
  for (const c of done) if (!stored.has(c.id)) { await storeTopicPerformance(c.id, "BACKFILL").catch(() => 0); n++; }
  await import("./ploDelta").then((m) => m.backfillPloChanges(batch.id)).catch(() => null);
  return `${n} offerings`;
}

/** Best, average and weakest scripts (whole course) of BS CS semester 4 and 5, as generated PDFs. */
async function samples() {
  const head = await headUser();
  const flag = await flagOf(head.id);
  const { batch } = await batchOf("CS", 2024);
  const courses = await prisma.course.findMany({ where: { batchId: batch!.id, semesterNumber: { in: [4, 5] }, id: { not: flag?.demoCourseId || "none" } }, select: { id: true, code: true, instructorId: true, coordinatorId: true } });
  const { courseSampling, COURSE_SAMPLE } = await import("./portfolio");
  const { samplesPdf } = await import("./samplesPdf");
  let n = 0;
  for (const c of courses) {
    if ((await db.studentWorkSample.count({ where: { courseId: c.id } }).catch(() => 0)) > 0) continue;
    const s = await courseSampling(c.id);
    const whole = s.items.find((i) => i.id === COURSE_SAMPLE);
    if (!whole) continue;
    const pdf = await samplesPdf(c.id, { instrumentId: COURSE_SAMPLE, names: false }).catch(() => null);
    const url = pdf ? `data:application/pdf;base64,${Buffer.from(pdf.bytes).toString("base64")}` : "";
    if (!url) continue;
    for (const lv of ["HIGH", "MEDIUM", "LOW"] as const) {
      const st = whole.suggest[lv];
      if (st) { await db.studentWorkSample.create({ data: { id: randomUUID(), courseId: c.id, instrumentId: COURSE_SAMPLE, studentId: st.id, level: lv, score: st.score, fileName: `${c.code}-${lv.toLowerCase()}.pdf`, fileUrl: url, uploadedById: c.instructorId || c.coordinatorId } }); n++; }
    }
  }
  return `${n} samples`;
}

/** What a program's visit needs from everyday records: faculty profiles, degrees and research, teaching loads within
 *  9 credit hours, the lab's 15 tasks with an open-ended one and its Lab Engineer, activities, the Program Lead's
 *  evidence (reviews, advisory board, guest lectures, actions on the last visit), CQI actions closed, course folders. */
async function polish(p: Prog) {
  const head = await headUser();
  const { lead, batch } = await batchOf(p, 2024);
  if (!batch) return "No batch.";
  const flag = await flagOf(head.id);
  const done: string[] = [];
  const faculty = await prisma.user.findMany({ where: { managedById: lead.id, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] as never }, isActive: true, isVisitingPlaceholder: false }, orderBy: { username: "asc" }, select: { id: true, name: true, username: true, normalLoad: true } });
  // Faculty profiles, degrees and a recent paper each.
  const BLOOD = ["A+", "B+", "O+", "AB+", "A-", "O-"], DESIG = ["Professor", "Associate Professor", "Assistant Professor", "Assistant Professor", "Lecturer"];
  const photo = (n: string) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#7A1F2B"/><text x="48" y="58" font-size="34" text-anchor="middle" fill="#fff" font-family="Arial">${n.replace(/^(Dr|Mr|Ms|Prof)\.?\s*/g, "").split(" ").map((w) => w[0]).join("").slice(0, 2)}</text></svg>`).toString("base64")}`;
  for (const [i, f] of faculty.entries()) {
    const prof = { photo: photo(f.name), designation: DESIG[i % DESIG.length], dateOfJoining: new Date(Date.UTC(2012 + (i % 10), (i * 3) % 12, 1)), bloodGroup: BLOOD[i % BLOOD.length], phone: `0300-55${String(10000 + i * 137).slice(-5)}`, nextOfKinName: `Next of kin of ${f.name.split(" ").slice(-1)[0]}`, nextOfKinPhone: `0321-44${String(20000 + i * 211).slice(-5)}`, officeHours: ["Mon & Wed 11:00–12:00", "Tue & Thu 2:00–3:00", "Mon & Thu 9:00–10:00"][i % 3] };
    await db.facultyProfile.upsert({ where: { userId: f.id }, create: { userId: f.id, employmentType: "Permanent", ...prof }, update: prof });
    if (!(await prisma.facultyRecord.count({ where: { userId: f.id, kind: "EDUCATION" } }))) await prisma.facultyRecord.create({ data: { id: randomUUID(), userId: f.id, kind: "EDUCATION", title: i % 3 === 0 ? "PhD Computer Science" : "MS Computer Science", organisation: ["NUST", "LUMS", "FAST-NUCES", "COMSATS", "UET Lahore"][i % 5], startYear: 2005 + (i % 10) } as never });
    if (!(await prisma.facultyRecord.count({ where: { userId: f.id, kind: { in: ["PUBLICATION", "GRANT", "PROJECT"] } } }))) await prisma.facultyRecord.create({ data: { id: randomUUID(), userId: f.id, kind: "PUBLICATION", title: ["Outcome-based assessment in undergraduate computing", "A study of program comprehension by novice programmers", "Federated learning for low-resource Urdu text", "Energy-aware scheduling in edge clusters", "Detecting plagiarism in source code with token graphs"][i % 5], organisation: ["IEEE Access", "Journal of Computing (HEC Y)", "ICOSST", "Pakistan Journal of Engineering and Technology"][i % 4], startYear: new Date().getFullYear() - (i % 2), category: "Journal" } as never });
  }
  done.push(`${faculty.length} faculty profiles`);
  // Teaching loads: at most 9 credit hours of this batch per teacher (the demo course stays with the demo Instructor).
  const offered = await prisma.course.findMany({ where: { batchId: batch.id, isOffered: true }, orderBy: [{ creditHours: "desc" }, { code: "asc" }], select: { id: true, creditHours: true, isNonCredit: true, instructorId: true } });
  const load = new Map(faculty.map((f) => [f.id, { ch: 0, n: 0, max: f.normalLoad || 3 }]));
  const assign = new Map<string, string>();
  const demoCourse = offered.find((c) => c.id === flag?.demoCourseId);
  if (demoCourse?.instructorId && load.has(demoCourse.instructorId)) { assign.set(demoCourse.id, demoCourse.instructorId); const l = load.get(demoCourse.instructorId)!; l.ch += demoCourse.creditHours; l.n++; }
  for (const c of offered) {
    if (assign.has(c.id)) continue;
    const ch = c.isNonCredit ? 0 : c.creditHours;
    const fits = (id: string) => { const l = load.get(id)!; return l.ch + ch <= 9 && l.n + 1 <= l.max; };
    const keep = c.instructorId && load.has(c.instructorId) && fits(c.instructorId) ? c.instructorId : null;
    const pick = keep || faculty.map((f) => f.id).filter(fits).sort((a, b) => load.get(a)!.ch - load.get(b)!.ch)[0] || faculty.map((f) => f.id).sort((a, b) => load.get(a)!.ch - load.get(b)!.ch)[0];
    assign.set(c.id, pick); const l = load.get(pick)!; l.ch += ch; l.n++;
  }
  let moved = 0;
  for (const c of offered) {
    const to = assign.get(c.id)!;
    if (to === c.instructorId) continue;
    await prisma.course.update({ where: { id: c.id }, data: { instructorId: to } });
    await prisma.courseSectionAssignment.updateMany({ where: { courseId: c.id }, data: { instructorId: to } });
    moved++;
  }
  done.push(`loads balanced (${moved} courses moved)`);
  // The lab under its theory course: Lab Engineer, 15 weekly tasks, one open-ended.
  const labs = await prisma.course.findMany({ where: { coordinatorId: lead.id, courseType: "Lab" }, select: { id: true, code: true, title: true } });
  if (labs.length) {
    const hash = await hashPassword(demo.DEMO_PASSWORD);
    const uname = `dream.labeng.${p.toLowerCase()}`;
    let eng = await user(uname);
    if (!eng) { await prisma.user.create({ data: { id: randomUUID(), username: uname, email: `${uname}@dreaminstitute.demo`, passwordHash: hash, name: p === "CS" ? "Engr. Kamran Shafiq" : "Engr. Sadia Batool", role: "LAB_ENGINEER", mustChangePassword: false, managedById: lead.id, departmentId: lead.departmentId } as never }); eng = await user(uname); }
    for (const l of labs) {
      await prisma.course.update({ where: { id: l.id }, data: { labEngineerId: eng!.id } });
      if (await db.labTaskPlan.count({ where: { labCourseId: l.id } }).catch(() => 1)) continue;
      const tasks = Array.from({ length: 15 }, (_, i) => ({ id: randomUUID(), labCourseId: l.id, labNumber: i + 1, week: i + 1, topicsJson: JSON.stringify([{ lectureNumber: i * 2 + 1, topic: `Lab ${i + 1}` }]), openEnded: i === 11, oelBrief: i === 11 ? "Design and build a small working system for a real client in the community; justify the design choices." : null, updatedById: eng!.id }));
      await db.labTaskPlan.createMany({ data: tasks });
      await prisma.labManual.createMany({ data: tasks.map((t) => ({ courseId: l.id, labNumber: t.labNumber, title: t.openEnded ? "Open-ended lab: design your own solution" : `Lab ${t.labNumber}: guided exercise` })) as never, skipDuplicates: true }).catch(() => null);
    }
    done.push(`${labs.length} lab courses with 15 tasks (one open-ended)`);
  }
  // Activities of the last year, the Program Lead's evidence, CQI actions closed.
  const ago = (d: number) => new Date(Date.now() - d * 864e5);
  if (!(await prisma.activityLog.count({ where: { coordinatorId: lead.id, activityDate: { gte: ago(365) } } }))) {
    await prisma.activityLog.createMany({ data: [
      ["Inter-university programming contest (ICPC regional)", "Technical competition", 70, 36], ["Blood donation and free computer literacy camp", "Community service", 110, 48],
      ["Annual sports gala", "Sports", 150, 210], ["Computing society: hackathon week", "Society event", 40, 95], ["Final year project exhibition", "Technical competition", 200, 160],
    ].map(([title, category, d, n]) => ({ id: randomUUID(), coordinatorId: lead.id, batchId: batch.id, title: String(title), category: String(category), activityDate: ago(Number(d)), organizer: "Computing Society", participants: Number(n) })) as never });
  }
  {
    const E = (area: string, kind: string, title: string, days: number | null, organization?: string) => ({ id: randomUUID(), coordinatorId: lead.id, area, kind, title, organization: organization || null, date: days === null ? null : ago(days) });
    const have = new Set((await prisma.programEvidence.findMany({ where: { coordinatorId: lead.id }, select: { area: true, kind: true, title: true } })).map((e) => `${e.area}|${e.kind}|${e.title}`));
    const want = [
      E("QUALITY", "Review of POs / GAs / CLOs", "OMC review of CLO and GA attainment after Spring 2026", 120), E("QUALITY", "Review of POs / GAs / CLOs", "Curriculum review meeting after Fall 2025", 280),
      E("QUALITY", "Action on last visit observation", "Lab-to-student ratio improved: two new labs of 48 PCs", 200), E("QUALITY", "New initiative", "Early warning per assessment with CQI tutorials", 150),
      E("INDUSTRY", "Advisory board member", "Mr. Usman Tariq — CTO, Systems Ltd", null, "Systems Ltd"), E("INDUSTRY", "Advisory board member", "Ms. Hina Aslam — Engineering Manager, Arbisoft", null, "Arbisoft"), E("INDUSTRY", "Advisory board member", "Dr. Khalid Mehmood — Director, PITB", null, "PITB"),
      E("INDUSTRY", "Guest lecture", "Guest lecture: cloud-native systems in practice", 60, "10Pearls"), E("INDUSTRY", "Industrial visit", "Industrial visit to NetSol Technologies", 95, "NetSol Technologies"),
    ].filter((e) => !have.has(`${e.area}|${e.kind}|${e.title}`));
    if (want.length) await prisma.programEvidence.createMany({ data: want as never });
  }
  const cqi = await prisma.cqiRecord.findMany({ where: { chairmanId: head.id, batchId: batch.id, status: { notIn: ["closed", "verified-effective", "verified-ineffective"] } }, select: { id: true, actionTaken: true, metricBefore: true } });
  for (const c of cqi) await prisma.cqiRecord.update({ where: { id: c.id }, data: { status: "closed", actionTaken: c.actionTaken || "Extra problem-solving sessions and a revision quiz before the final.", metricAfter: (c.metricBefore || 50) + 12, verifiedAt: ago(20) } as never });
  // Course folders of the running semester: the teacher's observations, then the folders are checked again.
  const now = await prisma.course.findMany({ where: { coordinatorId: lead.id, isOffered: true }, select: { id: true, code: true, coordinatorId: true, instructorObservations: true } });
  for (const c of now.filter((x) => !x.instructorObservations?.trim())) await prisma.course.update({ where: { id: c.id }, data: { instructorObservations: "The class did well on the practical work; the early-warning tutorial helped the weaker group. Next term: one more worked example before the midterm." } });
  const { syncCourseFolders } = await import("./courseFile");
  const st = await syncCourseFolders(now.map((c) => ({ id: c.id, coordinatorId: c.coordinatorId })));
  done.push(`${Array.from(st.values()).filter((s) => s.complete).length} of ${now.length} course folders complete`, `${cqi.length} CQI actions closed`);
  return done.join(" · ");
}

/** Lecture rooms (3 for every 200 students) and working lab computers (1 for 3 students) for the computing department. */
async function facilities() {
  const head = await headUser();
  const computing = await prisma.department.findFirst({ where: { chairmanId: head.id, name: "Department of Computing" }, select: { id: true } });
  const { labRatio } = await import("./resources");
  const r = await labRatio(head.id, computing?.id || null);
  const roomsNeeded = Math.ceil(r.students / 200) * 3 + 1;
  const have = await prisma.room.count({ where: { chairmanId: head.id, type: "LECTURE" } });
  if (have < roomsNeeded) await prisma.room.createMany({ data: Array.from({ length: roomsNeeded - have }, (_, i) => ({ id: randomUUID(), chairmanId: head.id, name: `C-${201 + i}`, type: "LECTURE", capacity: 50, departmentId: computing?.id || null })) as never });
  let working = r.working, k = 0;
  while (working < Math.ceil(r.students / 3)) {
    const id = randomUUID();
    await prisma.labInfo.create({ data: { id, chairmanId: head.id, departmentId: computing?.id || null, name: `Computing Lab ${String.fromCharCode(67 + k)}`, location: "Computing Block", seats: 48, computers: 48, computersWorking: 48, software: "Windows 11, Ubuntu 24.04, VS Code, JDK 21, Python 3.12, MySQL, Packet Tracer", internetMbps: 100, lastAudit: new Date() } as never });
    await prisma.labComputerSpec.create({ data: { id: randomUUID(), chairmanId: head.id, labId: id, quantity: 48, makeModel: "Dell OptiPlex 7010", processor: "Core i7-13700", ramGb: 16, storage: "512 GB SSD", os: "Windows 11 / Ubuntu", purchaseYear: 2025 } as never });
    working += 48; k++;
  }
  return `${Math.max(0, roomsNeeded - have)} rooms and ${k} labs added (${r.students} students)`;
}

/** Readiness of BS CS semester 5 now: what is still open (only the demo course should be). */
async function finalCheck() {
  const head = await headUser();
  const lead = await must("dream.lead.cs");
  const { batch } = await batchOf("CS", 2024);
  const { computeReadiness } = await import("./readiness");
  const { standardsFor } = await import("./accreditation/bodies");
  const r = await computeReadiness(lead, batch!.id, await standardsFor(lead.managedById, "NCEAC")).catch(() => null);
  const open = r ? r.areas.flatMap((a) => a.checks.filter((c) => c.total > 0 && c.done < c.total).map((c) => `${a.no}. ${c.label} (${c.done}/${c.total})`)) : [];
  const flag = await flagOf(head.id);
  const course = flag?.demoCourseId ? await prisma.course.findUnique({ where: { id: flag.demoCourseId }, select: { code: true, title: true } }) : null;
  await db.demoFlag.update({ where: { chairmanId: head.id }, data: { readyAt: new Date(), loginsOn: true, stateJson: JSON.stringify({ overall: r?.overall ?? null, open: open.slice(0, 60), demoCourse: course ? `${course.code} ${course.title}` : null }) } });
  return `Overall ${r?.overall ?? "—"}% · ${open.length} checks open`;
}

// ---- after the build: reset, sample marks, logins

/** Back to the starting state: the demo course's final-exam marks, its result, publication and history removed. */
export async function resetDemo(by: { id: string }) {
  const d = await theDemo();
  if (!d) throw new Error("There is no demo institute (or it is not flagged as a demo).");
  const courseId = d.flag.demoCourseId;
  if (!courseId) throw new Error("Make the demo ready first.");
  const finals = (await prisma.assessmentInstrument.findMany({ where: { courseId, type: "Final" }, select: { id: true } })).map((i) => i.id);
  const removed = (await prisma.studentMark.deleteMany({ where: { courseId, instrumentId: { in: finals.concat("none") } } })).count;
  for (const t of ["courseResult", "resultPublication", "topicPerformance", "ploChangeLog", "cloTermLock", "gradeChangeRequest", "recheckRequest"]) await db[t]?.deleteMany({ where: { courseId } }).catch(() => null);
  await db.itemWarning?.deleteMany({ where: { instrumentId: { in: finals.concat("none") } } }).catch(() => null);
  const T = termDates(new Date());
  await db.marksDeadline?.updateMany({ where: { instrumentId: { in: finals.concat("none") } }, data: { heldOn: T.finalHeld, dueOn: new Date(T.finalHeld.getTime() + 7 * 864e5), enteredAt: null, late: false, remindedJson: "[]", escalatedAt: null } }).catch(() => null);
  await db.demoFlag.update({ where: { chairmanId: d.head.id }, data: { resetAt: new Date() } });
  await writeAuditLog({ actorUserId: by.id, action: "DEMO_RESET", entityType: "Course", entityId: courseId, metadata: { marksRemoved: removed } });
  return { removed };
}

/** "Fill sample marks": realistic marks for every enrolled student still without one, on the course's final exam
 *  (or any item with gaps). Only in a demo institute, only by the course's teacher; the marks stay editable. */
export async function fillSampleMarks(u: { id: string }, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, instructorId: true, coordinator: { select: { managedById: true } } } });
  if (!course || course.instructorId !== u.id) throw new Error("Only the course's teacher fills its marks.");
  if (!(await isDemoInstitute(course.coordinator.managedById))) throw new Error("Sample marks are only for the demo institute.");
  const { resultLockMessage } = await import("./resultApproval");
  const locked = await resultLockMessage(courseId);
  if (locked) throw new Error(locked);
  const [insts, enr, marks] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { id: true, type: true, maxScore: true } }),
    prisma.studentEnrollment.findMany({ where: { courseId, status: { not: "WITHDRAWN" } }, select: { student: { select: { id: true, rollNumber: true } } } }),
    prisma.studentMark.findMany({ where: { courseId }, select: { studentId: true, instrumentId: true } }),
  ]);
  const have = new Set(marks.map((m) => `${m.studentId}|${m.instrumentId}`));
  const gaps = insts.filter((i) => enr.some((e) => !have.has(`${e.student.id}|${i.id}`)));
  const target = gaps.some((i) => i.type === "Final") ? gaps.filter((i) => i.type === "Final") : gaps;
  const rows = target.flatMap((i) => enr.filter((e) => !have.has(`${e.student.id}|${i.id}`)).map((e) => ({ studentId: e.student.id, courseId, instrumentId: i.id, score: sampleScore(e.student.rollNumber, i.id, i.maxScore, i.type), enteredById: u.id })));
  if (!rows.length) return { filled: 0 };
  await prisma.studentMark.createMany({ data: rows as never, skipDuplicates: true });
  await writeAuditLog({ actorUserId: u.id, action: "MARKS_SAMPLE_FILLED", entityType: "Course", entityId: courseId, metadata: { marks: rows.length, items: target.length } });
  const { afterMarks } = await import("./itemWarnings");
  for (const i of target) await afterMarks(courseId, i.id).catch(() => null);
  return { filled: rows.length };
}

/** Who a one-click demo login signs in as. Refused unless the demo institute is flagged and its logins are on. */
export async function demoLoginTarget(key: string): Promise<{ kind: "staff"; id: string } | { kind: "student"; id: string }> {
  const role = roleByKey(key);
  if (!role) throw new Error("Unknown demo role.");
  const d = await theDemo();
  if (!d) throw new Error("There is no demo institute.");
  if (!d.flag.loginsOn) throw new Error("Demo logins are switched off.");
  if (role.student) {
    const courseId = d.flag.demoCourseId;
    const e = courseId ? await prisma.studentEnrollment.findFirst({ where: { courseId }, orderBy: { student: { rollNumber: "asc" } }, select: { studentId: true } }) : null;
    const s = e ? { id: e.studentId } : await prisma.student.findFirst({ where: { batch: { coordinator: { managedById: d.head.id } } }, orderBy: { rollNumber: "asc" }, select: { id: true } });
    if (!s) throw new Error("No demo student yet.");
    return { kind: "student", id: s.id };
  }
  const u = await prisma.user.findUnique({ where: { username: role.username! }, select: { id: true, role: true, isActive: true, managedById: true, managedBy: { select: { managedById: true } } } });
  if (!u || !u.isActive) throw new Error("That demo account is not built yet — run Make demo ready.");
  // Only people of the flagged demo institute (directly under its head, or under one of its Program Leads).
  // The demo's affiliated college has its own head, linked to the demo as its university.
  const college = role.username === "dream.college" && (await (await import("./curriculumLibrary")).universityOf(u.id).catch(() => null)) === d.head.id;
  if (!college && (u.role === "SUPER_USER" || (u.managedById !== d.head.id && u.managedBy?.managedById !== d.head.id))) throw new Error("Not a demo account.");
  return { kind: "staff", id: u.id };
}

export async function setLogins(on: boolean) {
  const d = await theDemo();
  if (!d) throw new Error("There is no demo institute.");
  await db.demoFlag.update({ where: { chairmanId: d.head.id }, data: { loginsOn: on } });
}

/** The demo course and how far the live demo has got (for the demo script and the logins page). */
export async function demoProgress() {
  const d = await theDemo();
  if (!d?.flag.demoCourseId) return null;
  const c = await prisma.course.findUnique({ where: { id: d.flag.demoCourseId }, select: { id: true, code: true, title: true, batchId: true } });
  if (!c) return null;
  const [finals, enrolled, result, pub] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: c.id, source: "INSTRUCTOR", type: "Final" }, select: { id: true, _count: { select: { studentMarks: true } } } }),
    prisma.studentEnrollment.count({ where: { courseId: c.id } }),
    db.courseResult.findUnique({ where: { courseId: c.id } }).catch(() => null),
    db.resultPublication.findUnique({ where: { courseId: c.id } }).catch(() => null),
  ]);
  const marked = finals.length > 0 && finals.every((f) => f._count.studentMarks >= enrolled);
  return { course: c, marked, result: (result?.status as string) || null, published: !!pub };
}
