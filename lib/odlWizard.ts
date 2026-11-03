import { prisma } from "./db";
import { READINESS, lmsCoverage, creditCheck, type Mode } from "./teachingToolsCore";
import type { Prog, Step } from "./collab";

// Queue item 14 A: the ODL programme wizard in 8 steps. What OBEHUB can tell from its own records is worked out here
// (refreshOdlFacts) and kept on the programme as `auto`, so each step's "still missing" list reads facts, not ticks.
const db = prisma as unknown as Record<string, any>;
export const ODL_ROLES: [string, string, string][] = [
  ["coordinator", "ODL Programme Coordinator", "13.2"], ["designer", "Instructional Designer", "13.3"], ["lmsAdmin", "LMS administrator", "10.i.c"], ["qa", "Quality Assurance Specialist", "13.7"],
];
export const ODL_STEPS: Step[] = [
  { key: "eligibility", title: "Eligibility", intro: "Checked from OBEHUB's own records: two batches of this programme completed face-to-face (2.2), approval by the statutory bodies (2.3), full-time faculty designated for ODL (2.5). The plan's approval (2.6), ICT readiness and planned enrolment (2.7) and the accreditation council's NOC where it applies (2.12) are confirmed with evidence.", checks: ["twoBatches", "statutory", "faculty", "plan", "ict", "council"], moc: [], fields: [], widgets: ["odl-auto"] },
  { key: "proposal", title: "Proposal and readiness", intro: "The programme proposal with its risk assessment (5.ii) and the HEC Toolkit's Program Readiness questions (Part-B), each with its evidence. Answers OBEHUB can show from its records are filled in for you.", checks: ["risk"], moc: [], fields: [], widgets: ["readiness"] },
  { key: "content", title: "Content development", intro: "Per course, the Subject Expert and the Instructional Designer build a module for each lecture topic: recorded video (in general under 30 minutes, 7.iv.h), self-assessment questions, further reading and references (7.v). Both review and sign off the material (7.vi). Content is revised at least every 3 years (7.xiv).", checks: ["review"], moc: [], fields: [], widgets: ["roles", "content"] },
  { key: "delivery", title: "Delivery plan", intro: "Each course's mode and each lecture's delivery, checked against the credit-hour rules (8.1, 8.2.3) and the activities every credit hour needs (8.1.ii.e). No teacher takes more than two ODL courses in a semester (13.1.2).", checks: [], moc: [], fields: [], widgets: ["courses", "delivery"] },
  { key: "systems", title: "LMS and accounts", intro: "The LMS features of 10.ii, from OBEHUB and the connected teaching tools; every student and teacher registered (10.i.b); access limited to the course's people and the HOD (10.i.e); an LMS administrator (10.i.c); training manuals (10.i.g); the Student Information System (17.1) and grievance e-portal (18).", checks: ["lms", "sis", "grievanceEportal"], moc: [], fields: [["manualStudents", "Training manual for students (link)", "text"], ["manualFaculty", "Training manual for faculty (link)", "text"]], widgets: ["lms"] },
  { key: "exams", title: "Exams", intro: "Exams by the Controller at HEC-approved centres with CCTV, biometric attendance and faculty invigilation; practicals face-to-face; the same grading as face-to-face (11).", checks: ["centres", "cctv", "practical", "grading"], moc: [], fields: [], widgets: [] },
  { key: "noc", title: "HEC NOC and admission", intro: "Admit only after HEC recognition (2.10–2.11, 15.xi), within the seats and yearly intake (no more than two intakes a year, 15.xv).", checks: ["noc"], moc: [], fields: [["nocNo", "HEC NOC number", "text"], ["nocDate", "NOC date", "date"], ["nocUntil", "NOC valid until (up to 3 years)", "date"], ["seats", "Seats / yearly intake", "number"]], widgets: ["docs"] },
  { key: "running", title: "Running the term", intro: "Each week: live sessions held against the plan, recordings posted, discussion-board activity and attendance (21.1.viii–ix), kept as the internal monitoring record for the QEC (12.5). Late items go to the ODL Programme Coordinator.", checks: [], moc: [], fields: [], widgets: ["running"] },
];

export type Auto = {
  at?: string;
  twoBatches?: { ok: boolean; evidence: string }; statutory?: { ok: boolean; evidence: string }; faculty?: { ok: boolean; evidence: string };
  readiness?: Record<string, { ok: boolean; evidence: string }>;
  content?: Record<string, { courseId: string | null; lectures: number; modules: number; signed: boolean; seAt: string | null; idAt: string | null }>;
  delivery?: Record<string, { courseId: string | null; failing: string[]; lines: ReturnType<typeof creditCheck> }>;
  lms?: { missing: string[]; tools: string[]; students: number; coursesLinked: number; courses: number };
  running?: { late: number; held: number; planned: number };
};
const graduatedBatches = async (cid: string, program: string) => {
  if (!program) return [];
  const b = await prisma.batch.findMany({ where: { degreeProgram: program, coordinator: { managedById: cid } }, select: { batchName: true, _count: { select: { students: { where: { status: "GRADUATED" } } } } } });
  return b.filter((x) => x._count.students > 0).map((x) => `${x.batchName} (${x._count.students} graduated)`);
};
export async function programsOf(cid: string): Promise<string[]> {
  return Array.from(new Set((await prisma.batch.findMany({ where: { coordinator: { managedById: cid } }, select: { degreeProgram: true } })).map((b) => String(b.degreeProgram)))).sort();
}
async function courseIdsByCode(cid: string, codes: string[]) {
  if (!codes.length) return new Map<string, string>();
  const cs = await prisma.course.findMany({ where: { code: { in: codes }, coordinator: { managedById: cid } }, select: { id: true, code: true, isOffered: true }, orderBy: { isOffered: "desc" } });
  const m = new Map<string, string>(); for (const c of cs) if (!m.has(c.code)) m.set(c.code, c.id);
  return m;
}
/** Approvals of this programme recorded in the committee engine (CmtItem kind ODL_PROGRAMME, refId = programme). */
async function approvals(p: Prog) {
  const items = ((await db.cmtItem?.findMany({ where: { kind: "ODL_PROGRAMME", refId: p.id } }).catch(() => [])) || []) as { committeeId: string; outcome: string | null; decidedAt: Date | null; councilStatus: string | null; councilDate: Date | null }[];
  const cms = items.length ? ((await db.cmtCommittee.findMany({ where: { id: { in: items.map((i) => i.committeeId) } } })) as { id: string; type: string; name: string }[]) : [];
  const ok = (o: string | null) => o === "APPROVED" || o === "APPROVED_WITH_CHANGES";
  const typeOf = (id: string) => cms.find((c) => c.id === id)?.type || "";
  const nameOf = (id: string) => cms.find((c) => c.id === id)?.name || "committee";
  const bos = items.filter((i) => typeOf(i.committeeId) === "BOS" && ok(i.outcome));
  const council = items.filter((i) => (typeOf(i.committeeId) === "ACADEMIC_COUNCIL" && ok(i.outcome)) || i.councilStatus === "APPROVED");
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");
  return {
    bos: { ok: bos.length > 0, evidence: bos.length ? bos.map((i) => `${nameOf(i.committeeId)} approved ${d(i.decidedAt)}`).join("; ") : items.length ? "sent, not approved yet" : "not sent to the Board of Studies yet" },
    council: { ok: council.length > 0, evidence: council.length ? council.map((i) => `${i.councilStatus === "APPROVED" ? "Academic Council" : nameOf(i.committeeId)} approved ${d(i.councilDate || i.decidedAt)}`).join("; ") : "no Academic Council approval recorded" },
  };
}
export async function sendToBos(user: { id: string }, p: Prog, committeeId: string, origin: string) {
  const c = (await db.cmtCommittee.findUnique({ where: { id: committeeId } })) as { chairmanId: string; type: string } | null;
  if (!c || c.chairmanId !== p.chairmanId) throw new Error("Choose one of your committees.");
  const { addItem } = await import("./committeeEngine");
  await addItem(user, committeeId, { kind: "ODL_PROGRAMME", refId: p.id, title: `ODL programme proposal: ${p.title}`, summary: "Programme proposal, ODL plan and risk assessment for approval to offer in ODL mode (HEC ODL Part-II 2.3, 2.6, 5.iii).", href: `${origin}/collab?id=${p.id}` });
}

/** Recomputes everything OBEHUB can tell for this programme and stores it on the programme. */
export async function refreshOdlFacts(p: Prog): Promise<Auto> {
  const { dataOf, saveData } = await import("./collab");
  const d = dataOf(p) as Record<string, any>;
  const cid = p.chairmanId;
  const auto: Auto = { at: new Date().toISOString() };
  // 2.2 two batches completed face-to-face
  const grads = await graduatedBatches(cid, d.degreeProgram || "");
  auto.twoBatches = { ok: grads.length >= 2, evidence: d.degreeProgram ? (grads.length ? `${d.degreeProgram}: ${grads.join(", ")}` : `${d.degreeProgram}: no batch has graduates in OBEHUB yet`) : "choose the face-to-face programme this ODL programme comes from" };
  const ap = await approvals(p);
  auto.statutory = { ok: ap.bos.ok && ap.council.ok, evidence: `Board of Studies: ${ap.bos.evidence}. Academic Council: ${ap.council.evidence}.` };
  // 2.5 full-time faculty designated for ODL
  const fac = (d.odlFaculty || []) as { id: string; name: string }[];
  const prof = fac.length ? await prisma.facultyProfile.findMany({ where: { userId: { in: fac.map((f) => f.id) } }, select: { userId: true, employmentType: true } }) : [];
  const partTime = fac.filter((f) => /visiting|part/i.test(prof.find((x) => x.userId === f.id)?.employmentType || ""));
  auto.faculty = { ok: fac.length > 0 && !partTime.length, evidence: fac.length ? `${fac.length} designated: ${fac.map((f) => `${f.name} (${prof.find((x) => x.userId === f.id)?.employmentType || "employment type not recorded"})`).join(", ")}${partTime.length ? ` — not full-time: ${partTime.map((f) => f.name).join(", ")}` : ""}` : "no faculty designated for ODL yet" };

  const courses = (d.courses || []) as { code: string; mode: Mode; ch: number; labH?: number; moderatedH?: number; gradedH?: number; labCh?: number }[];
  const ids = await courseIdsByCode(cid, courses.map((c) => c.code));
  const tt = await import("./teachingTools");
  // 7.iv–7.vi content per course
  auto.content = {};
  for (const c of courses) {
    const id = ids.get(c.code) || null;
    const m = id ? await tt.modulesOf(id) : null;
    const done = m ? m.lectures.filter((l) => l.m && (l.m.videoUrl || l.m.readingUrl) && l.m.selfQ > 0).length : 0;
    auto.content[c.code] = { courseId: id, lectures: m?.lectures.length || 0, modules: done, signed: !!(m?.review?.seAt && m.review.idAt), seAt: m?.review?.seAt ? new Date(m.review.seAt).toISOString() : null, idAt: m?.review?.idAt ? new Date(m.review.idAt).toISOString() : null };
  }
  // 8.1 / 8.2.3 / 8.1.ii.e delivery
  auto.delivery = {};
  for (const c of courses) {
    const id = ids.get(c.code) || null;
    if (!id) { auto.delivery[c.code] = { courseId: null, failing: ["the course is not in OBEHUB under this code"], lines: [] }; continue; }
    const f = await tt.courseFacts(id, c.mode, c.ch, { moderatedH: c.moderatedH, gradedH: c.gradedH, labH: c.labH }, c.labCh || ((c.labH || 0) > 0 ? 1 : 0));
    const lines = creditCheck(f, !!d.activitiesPerCh);
    auto.delivery[c.code] = { courseId: id, failing: lines.filter((l) => !l.ok).map((l) => `${l.rule} (${l.clause}): need ${l.need}, have ${l.have}`), lines };
  }
  // 10 LMS, accounts
  const tools = await tt.connected(cid);
  const cov = lmsCoverage(tools);
  const linked = ids.size ? await db.courseToolLink?.count({ where: { courseId: { in: Array.from(ids.values()) } } }).catch(() => 0) : 0;
  const students = ids.size ? await prisma.studentEnrollment.count({ where: { courseId: { in: Array.from(ids.values()) } } }) : 0;
  auto.lms = { missing: cov.filter((x) => !x.ok).map((x) => `10.ii (${x.n}) ${x.name}`), tools, students, coursesLinked: Number(linked || 0), courses: ids.size };
  // Running the term
  let late = 0, held = 0, planned = 0;
  for (const id of Array.from(ids.values())) { const r = await tt.runningOf(id); for (const w of r.weeks) { late += w.late.length; held += w.held; planned += w.planned; } }
  auto.running = { late, held, planned };
  // Toolkit Part-B answers OBEHUB can give
  const idList = Array.from(ids.values());
  const [plos, clos, mapped, rows, rowsClo, insts, surveys, plag, quizzes] = await Promise.all([
    d.degreeProgram ? prisma.pLO.count({ where: { batch: { degreeProgram: d.degreeProgram, coordinator: { managedById: cid } } } }).catch(() => 0) : Promise.resolve(0),
    idList.length ? prisma.cLO.count({ where: { courseId: { in: idList }, source: "SE" } }) : 0,
    idList.length ? prisma.cLO.count({ where: { courseId: { in: idList }, source: "SE", mappedPloId: { not: null } } }) : 0,
    idList.length ? prisma.lectureRow.count({ where: { courseId: { in: idList }, source: "SE" } }) : 0,
    idList.length ? prisma.lectureRow.count({ where: { courseId: { in: idList }, source: "SE", cloId: { not: null } } }) : 0,
    idList.length ? prisma.assessmentInstrument.findMany({ where: { courseId: { in: idList }, source: "SE", marksPct: { gt: 0 } }, select: { type: true } }) : [],
    prisma.surveyTemplate.count({ where: { coordinator: { managedById: cid } } }).catch(() => 0),
    db.plagiarismRecord?.count({ where: { chairmanId: cid } }).catch(() => 0) ?? 0,
    idList.length ? db.onlineQuiz?.count({ where: { courseId: { in: idList } } }).catch(() => 0) : 0,
  ]);
  const cont = Object.values(auto.content);
  const mods = idList.length ? ((await db.odlModule?.findMany({ where: { courseId: { in: idList } }, select: { videoUrl: true, readingUrl: true, selfQ: true } }).catch(() => [])) || []) as { videoUrl: string | null; readingUrl: string | null; selfQ: number }[] : [];
  const types = new Set(insts.map((i: { type: string }) => i.type));
  const R: Record<string, { ok: boolean; evidence: string }> = {
    bos: ap.bos, council: ap.council,
    plos: { ok: plos > 0, evidence: plos ? `${plos} programme learning outcomes in OBEHUB` : "no PLOs recorded for the programme" },
    cloPlo: { ok: clos > 0 && mapped === clos, evidence: clos ? `${mapped} of ${clos} CLOs mapped to PLOs` : "no CLOs in the ODL courses yet" },
    topicClo: { ok: rows > 0 && rowsClo === rows, evidence: rows ? `${rowsClo} of ${rows} lecture topics linked to a CLO` : "no lecture plans yet" },
    modes: { ok: courses.length > 0 && courses.every((c) => !!c.mode), evidence: courses.length ? courses.map((c) => `${c.code}: ${c.mode}`).join(", ") : "no ODL courses added" },
    content: { ok: cont.length > 0 && cont.every((c) => c.signed), evidence: `${cont.filter((c) => c.signed).length} of ${cont.length} courses signed off by SE and Instructional Designer` },
    tools: { ok: tools.some((t) => t === "GOOGLE" || t === "MICROSOFT" || t === "MOODLE"), evidence: tools.length ? `connected: ${tools.join(", ")}` : "no teaching tool connected" },
    assessment: { ok: types.size >= 3, evidence: types.size ? `assessment types in the plans: ${Array.from(types).join(", ")}` : "no assessments planned yet" },
    formats: { ok: mods.some((m) => m.videoUrl) && mods.some((m) => m.readingUrl), evidence: `${mods.filter((m) => m.videoUrl).length} videos, ${mods.filter((m) => m.readingUrl).length} readings in the modules` },
    selfAssess: { ok: mods.some((m) => m.selfQ > 0), evidence: `${mods.filter((m) => m.selfQ > 0).length} modules with self-assessment questions; ${quizzes} online quizzes` },
    obehub: { ok: true, evidence: "OBEHUB: CLO / PLO attainment, course files, CQI records and programme dashboards" },
    surveys: { ok: Number(surveys) > 0, evidence: Number(surveys) ? `${surveys} survey forms` : "no surveys set up" },
    integrity: { ok: Number(plag) > 0 || Number(quizzes) > 0, evidence: `${plag} plagiarism records; ${quizzes} online quizzes with per-student papers and secure-browser option` },
  };
  auto.readiness = Object.fromEntries(READINESS.filter((q) => q.auto && R[q.auto]).map((q) => [String(q.n), R[q.auto!]]));
  await saveData(p, { auto } as never);
  return auto;
}

/** What is still missing in the new ODL widgets (the check / field parts are handled by collab.missingIn). */
export function odlMissing(st: Step, d: Record<string, any>) {
  const a = (d.auto || {}) as Auto; const out: string[] = [];
  if (st.widgets.includes("readiness")) {
    const no = READINESS.filter((q) => !(d.readiness?.[q.n]?.yes) && !a.readiness?.[q.n]?.ok);
    if (no.length) out.push(`${no.length} of ${READINESS.length} readiness questions not answered Yes (Toolkit Part-B)`);
  }
  if (st.widgets.includes("roles")) for (const [k, label, cl] of ODL_ROLES) if (!d.roles?.[k]?.id) out.push(`${label} named (${cl})`);
  if (st.widgets.includes("content")) for (const [code, c] of Object.entries(a.content || {})) {
    if (!c.courseId) out.push(`${code}: not found in OBEHUB`);
    else { if (c.modules < c.lectures) out.push(`${code}: ${c.lectures - c.modules} of ${c.lectures} lecture modules incomplete (video or reading, and self-assessment)`); if (!c.signed) out.push(`${code}: SE and Instructional Designer sign-off (7.vi)`); }
  }
  if (st.widgets.includes("delivery")) for (const [code, x] of Object.entries(a.delivery || {})) for (const f of x.failing) out.push(`${code}: ${f}`);
  if (st.widgets.includes("lms")) { out.push(...(a.lms?.missing || [])); if (!d.roles?.lmsAdmin?.id) out.push("LMS administrator named (10.i.c)"); }
  if (st.widgets.includes("running") && (a.running?.late || 0) > 0) out.push(`${a.running!.late} late item(s) this term (sessions not confirmed or recordings not linked)`);
  return out;
}
/** A check is met by a tick or by OBEHUB's own records. */
export const autoMet = (d: Record<string, any>, k: string) => !!(d.auto?.[k] as { ok?: boolean } | undefined)?.ok;
