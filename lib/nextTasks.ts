import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { runSources, urgencyOf, dueText, type Source, type Task } from "./nextTasksCore";

// "What's next for me": a person's open tasks, in order, each a link to the exact step — built from what already exists
// (approvals inbox, deadlines, marks due, SE plan steps, OMC votes and batch endorsements, batch set-up, topic
// proposals, registration and timetable red flags, results to publish). Each source is a small function; add one to
// SOURCES and it shows everywhere. A failing source is skipped (lib/nextTasksCore.ts runSources).

const db = prisma as unknown as Record<string, any>;
export type NextUser = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null; name?: string; extraRoles?: string[] | null; omcHat?: boolean };
const day = 864e5;

const approvals: Source<NextUser> = { name: "approvals", run: async (u, now) => {
  if (["STUDENT", "SUPER_USER"].includes(u.role)) return [];
  const { inboxFor } = await import("./approvals/inbox");
  const inbox = await inboxFor({ ...u, name: u.name || "" } as never);
  const byKind = new Map<string, typeof inbox.items>();
  for (const i of inbox.items) byKind.set(i.kind, (byKind.get(i.kind) || []).concat(i));
  const out: Task[] = [];
  for (const [kind, items] of Array.from(byKind.entries())) {
    if (items.length > 2) {
      const due = items.map((i) => i.due).filter((d): d is Date => !!d).sort((a, b) => +new Date(a) - +new Date(b))[0] || null;
      const title = kind === "RESULT" ? `${items.length} results to approve` : `${items.length} ${items[0].label.toLowerCase()} waiting`;
      out.push({ title, href: `/approvals?kind=${kind}`, due, urgency: items.some((i) => i.overdue) ? "overdue" : urgencyOf(due, now), source: "approvals" });
    } else for (const i of items) out.push({ title: i.title, detail: i.label, href: i.href || "/approvals", due: i.due, urgency: i.overdue ? "overdue" : urgencyOf(i.due, now), source: "approvals" });
  }
  return out;
} };

const deadlines: Source<NextUser> = { name: "deadlines", run: async (u, now) => {
  const [se, mine] = await Promise.all([
    prisma.course.findMany({ where: { subjectExpertId: u.id }, select: { id: true } }),
    prisma.course.findMany({ where: { instructorId: u.id, isOffered: true }, select: { id: true } }),
  ]);
  const rows = await prisma.deadline.findMany({
    where: { completedAt: null, dueDate: { lte: new Date(now.getTime() + 14 * day) }, allCourses: false, OR: [{ assigneeId: u.id }, { courseId: { in: se.map((c) => c.id) }, role: "SUBJECT_EXPERT" }, { courseId: { in: mine.map((c) => c.id) }, role: "INSTRUCTOR" }] } as never,
    orderBy: { dueDate: "asc" }, take: 20, select: { title: true, dueDate: true, courseId: true },
  });
  return rows.map((d) => ({ title: d.title, href: "/deadlines", due: d.dueDate, urgency: urgencyOf(d.dueDate, now, "normal"), source: "deadlines" }));
} };

const marks: Source<NextUser> = { name: "marks", run: async (u, now) => {
  const courses = await prisma.course.findMany({ where: { instructorId: u.id, isOffered: true }, select: { id: true, code: true, title: true } });
  if (!courses.length) return [];
  const ids = courses.map((c) => c.id);
  const [insts, enrolled, dls] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: { in: ids }, source: "INSTRUCTOR", lectureLinks: { some: { lectureRow: { actualDate: { lte: now } } } } }, select: { id: true, courseId: true, type: true, label: true, _count: { select: { studentMarks: true } } } }),
    prisma.studentEnrollment.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, status: "ACTIVE" }, _count: { _all: true } }),
    db.marksDeadline?.findMany({ where: { courseId: { in: ids }, enteredAt: null } }).catch(() => []) as Promise<{ instrumentId: string; dueOn: Date }[]>,
  ]);
  const n = new Map(enrolled.map((e) => [e.courseId, e._count._all]));
  const dueOf = new Map((dls || []).map((d) => [d.instrumentId, d.dueOn]));
  const out: Task[] = [];
  const finals = new Set<string>();
  for (const i of insts) {
    if ((n.get(i.courseId) || 0) <= i._count.studentMarks) continue;
    const c = courses.find((x) => x.id === i.courseId)!;
    const due = dueOf.get(i.id) || null;
    if (i.type === "Final") { if (finals.has(c.id)) continue; finals.add(c.id); out.push({ title: `Enter final-exam marks for ${c.code} ${c.title}`, href: `/instructor/courses/${c.id}/marks`, due, urgency: due ? urgencyOf(due, now, "soon") : "soon", source: "marks" }); continue; }
    out.push({ title: `Upload ${i.label} marks — ${c.code}${due ? ` (${dueText(due, now)})` : ""}`, href: `/instructor/courses/${c.id}/marks`, due, urgency: urgencyOf(due, now), source: "marks" });
  }
  return out;
} };

const sePlans: Source<NextUser> = { name: "plans", run: async (u, now) => {
  const cs = await prisma.course.findMany({ where: { subjectExpertId: u.id, templateStatus: { notIn: ["approved", "submitted"] } }, orderBy: { code: "asc" }, take: 15, select: { id: true, code: true, templateStatus: true } });
  if (!cs.length) return [];
  const { planFlags, SE_STEPS } = await import("./sePlan");
  const flags = await planFlags(cs.map((c) => c.id));
  const tabOf = (label: string) => ({ "course details": "clos", clos: "clos", "lecture plan": "schedule", assessments: "weights", "exam questions": "paper-distribution" } as Record<string, string>)[label] || "clos";
  return cs.map((c) => {
    const f = flags.get(c.id);
    const missing = (f?.line || "").split(" · ").filter((x) => x.endsWith("✗")).map((x) => x.replace(/ ✗$/, "").toLowerCase());
    const first = missing[0] ? tabOf(missing[0]) : SE_STEPS[SE_STEPS.length - 1].tab;
    const title = c.templateStatus === "changes-requested" ? `Answer the OMC's suggestions on the ${c.code} plan` : missing.length ? `Finish ${c.code} plan: ${missing.map((m) => `${m === "clos" ? "CLOs" : m} ✗`).join(" · ")}` : `Submit the ${c.code} plan to the OMC`;
    return { title: `${title}${f?.deadline ? ` — ${dueText(f.deadline, now)}` : ""}`, href: `/subjectexpert/courses/${c.id}/${first}`, due: f?.deadline || null, urgency: urgencyOf(f?.deadline, now), source: "plans" };
  });
} };

const omcWork: Source<NextUser> = { name: "omc", run: async (u, now) => {
  const onOmc = u.role === "OMC" || !!u.omcHat || (u.extraRoles || []).includes("OMC_CONVENER");
  if (!onOmc) return [];
  const cid = await chairmanIdFor(u as never);
  const { omcOfCourse, omcOfBatch, isMember } = await import("./omcMembers");
  const out: Task[] = [];
  const submitted = await prisma.course.findMany({ where: { templateStatus: "submitted", coordinator: { managedById: cid } }, take: 80, select: { id: true } });
  let toVote = 0, toConfirm = 0;
  for (const c of submitted) {
    const omc = await omcOfCourse(c.id).catch(() => null);
    if (!omc || !isMember(omc, u.id)) continue;
    const st = await db.sePlanState?.findUnique({ where: { courseId: c.id } }).catch(() => null);
    const votes = ((await db.sePlanVote?.findMany({ where: { courseId: c.id, round: st?.round || 1 } }).catch(() => [])) || []) as { memberId: string; approve: boolean }[];
    if (!votes.some((v) => v.memberId === u.id)) toVote++;
    else if (omc.convenerId === u.id && votes.filter((v) => v.approve).length * 2 > omc.members.length) toConfirm++;
  }
  if (toVote) out.push({ title: `Vote on ${toVote} plan${toVote > 1 ? "s" : ""}`, href: "/omc/queue", due: null, urgency: "normal", source: "omc" });
  if (toConfirm) out.push({ title: `Confirm ${toConfirm} plan${toConfirm > 1 ? "s" : ""} the OMC approved`, href: "/omc/queue", due: null, urgency: "soon", source: "omc" });
  const waiting = ((await db.batchApproval?.findMany({ where: { chairmanId: cid, status: "SUBMITTED" } }).catch(() => [])) || []) as { batchId: string; reviewJson: string; submittedAt: Date }[];
  for (const w of waiting.slice(0, 10)) {
    const omc = await omcOfBatch(w.batchId).catch(() => null);
    if (!omc || !isMember(omc, u.id) || (w.reviewJson || "").includes(u.id)) continue;
    const b = await prisma.batch.findUnique({ where: { id: w.batchId }, select: { degreeProgram: true, batchName: true } });
    out.push({ title: `Endorse ${b?.batchName || b?.degreeProgram || "a batch"}`, href: `/omc/batch-review?batchId=${w.batchId}`, due: null, urgency: urgencyOf(new Date(new Date(w.submittedAt).getTime() + 7 * day), now), source: "omc" });
  }
  return out;
} };

const leadWork: Source<NextUser> = { name: "setup", run: async (u, now) => {
  if (u.role !== "PROGRAM_COORDINATOR") return [];
  const batches = await prisma.batch.findMany({ where: { coordinatorId: u.id }, orderBy: [{ startYear: "desc" }], select: { id: true, batchName: true, degreeProgram: true, registrationOpen: true, _count: { select: { students: true } } } });
  const started = new Set(((await db.batchSetupProgress?.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, select: { batchId: true } }).catch(() => [])) || []).map((p: { batchId: string }) => p.batchId));
  const { flowOf, stepHref } = await import("./batchFlow");
  const out: Task[] = [];
  for (const b of batches.filter((x) => started.has(x.id)).slice(0, 6)) {
    const f = await flowOf(b.id).catch(() => null);
    if (!f || f.approved || f.done >= f.steps.length) continue;
    out.push({ title: `Set up ${b.batchName} — step ${f.current} of ${f.steps.length}`, href: stepHref(f.current, b.id), due: null, urgency: "normal", source: "setup" });
  }
  // Registration waits for approved plans (the registration gate).
  const { registrationGate } = await import("./sePlan");
  for (const b of batches.filter((x) => !x.registrationOpen && x._count.students > 0).slice(0, 4)) {
    const g = await registrationGate(b.id).catch(() => null);
    if (g && g.offered && g.missing.length) out.push({ title: `Registration of ${b.batchName} waits for ${g.missing.length} plan${g.missing.length > 1 ? "s" : ""}`, detail: g.missing.slice(0, 3).map((m) => m.code).join(", "), href: `/coordinator/batch-review?batchId=${b.id}`, due: null, urgency: "normal", source: "setup" });
  }
  const links = await db.topicLinkProposal?.count({ where: { coordinatorId: u.id, status: "PENDING", seFromAt: { not: null }, seToAt: { not: null }, plAt: null } }).catch(() => 0);
  if (links) out.push({ title: `Confirm ${links} topic link${links > 1 ? "s" : ""}`, href: "/faculty/topic-workspace?tab=proposals", due: null, urgency: "normal", source: "setup" });
  void now;
  return out;
} };

const proposals: Source<NextUser> = { name: "proposals", run: async (u) => {
  const n = await db.planProposal?.count({ where: { toUserId: u.id, status: { in: ["PENDING", "PARTIAL"] }, NOT: { fromUserId: u.id } } }).catch(() => 0);
  return n ? [{ title: `${n} topic proposal${n > 1 ? "s" : ""} waiting`, href: "/faculty/topic-workspace?tab=proposals", due: null, urgency: "normal" as const, source: "proposals" }] : [];
} };

const timetable: Source<NextUser> = { name: "timetable", run: async (u) => {
  if (u.role !== "DEPARTMENT_COORDINATOR" || !u.departmentId) return [];
  const batches = await prisma.batch.findMany({ where: { coordinator: { departmentId: u.departmentId } }, select: { id: true, batchName: true, courses: { where: { isOffered: true }, select: { id: true } } } });
  const withCourses = batches.filter((b) => b.courses.length);
  const secs = await prisma.scheduleSection.groupBy({ by: ["courseId"], where: { courseId: { in: withCourses.flatMap((b) => b.courses.map((c) => c.id)).concat("none") } }, _count: { _all: true } });
  const has = new Set(secs.map((s) => s.courseId));
  return withCourses.filter((b) => !b.courses.some((c) => has.has(c.id))).slice(0, 6).map((b) => ({ title: `Timetable: ${b.batchName} has no sections`, href: "/coordinator/timetable", due: null, urgency: "normal" as const, source: "timetable" }));
} };

// The question bank below the readiness target (3 approved per CLO per Bloom level): a warning, never a block.
const bank: Source<NextUser> = { name: "bank", run: async (u) => {
  if (u.role !== "SUBJECT_EXPERT") return [];
  const courses = await prisma.course.findMany({ where: { subjectExpertId: u.id }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, code: true } });
  const { bankWarnings } = await import("./qbankAnalytics");
  return (await bankWarnings(courses)).map((w) => ({ title: `Question bank of ${w.code} is below target`, detail: w.text, href: `/question-bank?courseId=${w.courseId}`, due: null, urgency: "normal" as const, source: "bank" }));
} };

const publish: Source<NextUser> = { name: "publish", run: async (u) => {
  if (!(u.extraRoles || []).includes("EXAM_CONTROLLER")) return [];
  const cid = await chairmanIdFor(u as never);
  const ids = (await prisma.course.findMany({ where: { coordinator: { managedById: cid }, isOffered: true }, select: { id: true } })).map((c) => c.id);
  const approved = ((await db.courseResult?.findMany({ where: { courseId: { in: ids.concat("none") }, status: "APPROVED" }, select: { courseId: true } }).catch(() => [])) || []) as { courseId: string }[];
  const published = new Set((((await db.resultPublication?.findMany({ where: { courseId: { in: approved.map((a) => a.courseId).concat("none") } }, select: { courseId: true } }).catch(() => [])) || []) as { courseId: string }[]).map((p) => p.courseId));
  const n = approved.filter((a) => !published.has(a.courseId)).length;
  return n ? [{ title: `${n} approved result${n > 1 ? "s" : ""} to publish`, href: "/controller", due: null, urgency: "soon" as const, source: "publish" }] : [];
} };

// "Waiting on someone else" (Adeel prompt §1): someone marked a task as waiting on this person — it is red for them.
// When the recheck date passes without it being cleared, it is red again for the person who was waiting too.
const waitingOnMe: Source<NextUser> = { name: "waiting", run: async (u, now) => {
  const rows = ((await db.userFlag?.findMany({ where: { key: { startsWith: "wait:" }, value: { contains: `"onUserId":"${u.id}"` } }, take: 20 }).catch(() => [])) || []) as { userId: string; key: string; value: string }[];
  if (!rows.length) return [];
  const who = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  const out: Task[] = [];
  for (const r of rows) {
    try {
      const w = JSON.parse(r.value) as { reason: string; title?: string };
      const [title, href] = r.key.slice(5).split("|");
      out.push({ title: `${who.get(r.userId) || "A colleague"} is waiting on you: ${w.title || title}`, detail: w.reason, href: href || "/dashboard", due: null, urgency: "overdue", source: "waiting" });
    } catch { /* skip */ }
  }
  void now;
  return out;
} };

// Committee action items owned by this person (Adeel prompt §24.6).
const cmtActions: Source<NextUser> = { name: "meetings", run: async (u, now) => {
  const rows = ((await db.cmtAction?.findMany({ where: { ownerId: u.id, status: "OPEN" }, take: 20 }).catch(() => [])) || []) as { title: string; due: Date | null }[];
  return rows.map((a) => ({ title: `Committee action: ${a.title}`, href: "/meetings-hub", due: a.due, urgency: urgencyOf(a.due, now), source: "meetings" }));
} };

// Weak prerequisite topics waiting for a remedy (Adeel prompt §26).
const remedies: Source<NextUser> = { name: "remedies", run: async (u, now) => {
  const cs = await prisma.course.findMany({ where: { isOffered: true, OR: [{ instructorId: u.id }, { sectionAssignments: { some: { instructorId: u.id } } }] }, select: { id: true } });
  const rows = ((await db.prereqRemedy?.findMany({ where: { courseId: { in: cs.map((c) => c.id).concat("none") }, status: "OPEN" }, take: 10 }).catch(() => [])) || []) as { prereqTopic: string; dependentTopic: string; dueBy: Date | null }[];
  return rows.map((r) => ({ title: `Choose a remedy: weak “${r.prereqTopic}” before “${r.dependentTopic}”`, href: "/cqi/remedies", due: r.dueBy, urgency: r.dueBy && r.dueBy < now ? "overdue" as const : "soon" as const, source: "remedies" }));
} };

// Affiliated colleges (Adeel prompt §28.5): the university disclosed the final's lectures — the teacher sees what is not taught yet.
const finalCoverage: Source<NextUser> = { name: "finalCoverage", run: async (u, now) => {
  const cs = await prisma.course.findMany({ where: { isOffered: true, OR: [{ instructorId: u.id }, { sectionAssignments: { some: { instructorId: u.id } } }] }, select: { id: true, code: true, coordinator: { select: { managedById: true } } } });
  if (!cs.length || !db.affRecord) return [];
  const college = cs[0].coordinator?.managedById || "";
  const uni = await (await import("./curriculumLibrary")).universityOf(college).catch(() => null);
  if (!uni) return [];
  const papers = ((await db.affRecord.findMany({ where: { universityId: uni, kind: "FINAL_PAPER", status: "RELEASED", OR: [{ collegeId: null }, { collegeId: college }] }, take: 50 }).catch(() => [])) || []) as { dataJson: string }[];
  const { lectureSet } = await import("./affWork");
  const out: { title: string; href: string; due: Date | null; urgency: "overdue" | "soon"; source: string }[] = [];
  for (const p of papers) {
    let d: Record<string, any> = {}; try { d = JSON.parse(p.dataJson); } catch { continue; }
    if (!/Topic/.test(d.disclosure || "") || !d.releaseDate || new Date(d.releaseDate) > now) continue;
    const mine = cs.filter((c) => c.code.toUpperCase() === String(d.course || "").toUpperCase()); if (!mine.length) continue;
    const want = lectureSet(d.topics || "");
    const done = new Set((await prisma.lectureRow.findMany({ where: { courseId: { in: mine.map((c) => c.id) }, source: "INSTRUCTOR", actualDate: { not: null } }, select: { lectureNumber: true } })).map((x) => x.lectureNumber));
    const miss = want.filter((n) => !done.has(n));
    if (miss.length) out.push({ title: `${d.course}: final covers ${miss.length} lecture(s) not taught yet (${miss.slice(0, 6).map((n) => `L${n}`).join(", ")}${miss.length > 6 ? "…" : ""})`, href: "/instructor/courses", due: null, urgency: "soon", source: "finalCoverage" });
  }
  return out;
} };
export const SOURCES: Source<NextUser>[] = [marks, approvals, deadlines, sePlans, omcWork, leadWork, proposals, timetable, publish, waitingOnMe, cmtActions, remedies, finalCoverage, bank];

/** This person's open tasks, in order (overdue, due soon, the rest). */
export async function nextTasks(user: NextUser, now = new Date()) {
  const full = await prisma.user.findUnique({ where: { id: user.id }, select: { extraRoles: true, omcHat: true, name: true } }).catch(() => null);
  return runSources(SOURCES, { ...user, extraRoles: user.extraRoles ?? full?.extraRoles ?? [], omcHat: user.omcHat ?? full?.omcHat ?? false, name: user.name ?? full?.name ?? "" }, now);
}

// A short-lived count for the top bar, so the tasks are not worked out on every page.
const cache = new Map<string, { n: number; at: number }>();
export async function nextTasksCount(user: NextUser): Promise<number> {
  const c = cache.get(user.id);
  if (c && Date.now() - c.at < 180_000) return c.n;
  const n = (await nextTasks(user).catch(() => ({ tasks: [] as Task[] }))).tasks.length;
  cache.set(user.id, { n, at: Date.now() });
  return n;
}
