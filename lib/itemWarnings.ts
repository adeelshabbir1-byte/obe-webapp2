import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { workCalendar } from "./workdays";
import { logChanges } from "./cloMethods";
import { DEFAULT_WARN, diagnose, escalationStage, marksDue, marksStatus, resolveSettings, warningLevel, warningRecipients, workdayNumber, type WarnSettings } from "./cloMethodCore";

// Early warning on each item's marks, CQI actions and their effect, and marks within one week.
// Settings: the OMC sets the department default; the Program Lead sets his program's, and his setting is final.

const db = prisma as unknown as Record<string, any>;
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
export const WARN_FIELDS: (keyof WarnSettings)[] = ["passPct", "amberPct", "redPct", "respondDays", "escalateDays", "marksDays", "remind1", "remind2", "redDay", "escalateDay", "lateMode"];
export const deptScope = (departmentId: string | null | undefined) => `DEPT:${departmentId || ""}`;
export const programScope = (coordinatorId: string, program: string) => `PROGRAM:${coordinatorId}|${program}`;

export async function warnSettingsFor(chairmanId: string, departmentId: string | null | undefined, coordinatorId?: string | null, program?: string | null) {
  const scopes = [deptScope(null), deptScope(departmentId), ...(coordinatorId && program ? [programScope(coordinatorId, program)] : [])];
  const rows = (await db.warnSetting.findMany({ where: { chairmanId, scope: { in: scopes } } }).catch(() => [])) as { scope: string; valuesJson: string }[];
  const get = (s: string) => J<Partial<WarnSettings>>(rows.find((r) => r.scope === s)?.valuesJson, {});
  const dept = resolveSettings(resolveSettings(DEFAULT_WARN, get(deptScope(null))), get(deptScope(departmentId)));
  const prog = coordinatorId && program ? get(programScope(coordinatorId, program)) : {};
  return { dept, program: Object.keys(prog).length ? prog : null, effective: resolveSettings(dept, prog) };
}
async function courseScope(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, courseType: true, coordinatorId: true, subjectExpertId: true, instructorId: true, labEngineerId: true, batchId: true, coordinator: { select: { managedById: true, departmentId: true } }, batch: { select: { degreeProgram: true } } } });
  return c;
}
export async function courseWarnSettings(courseId: string) {
  const c = await courseScope(courseId);
  return (await warnSettingsFor(c?.coordinator.managedById || "", c?.coordinator.departmentId, c?.coordinatorId, c?.batch?.degreeProgram)).effective;
}
/** Save department defaults (OMC) or a program's own (its Program Lead — final, no approval). null clears a field (back to the default). */
export async function saveWarnSettings(user: { id: string }, chairmanId: string, scope: string, values: Partial<Record<keyof WarnSettings, unknown>> | null) {
  const row = await db.warnSetting.findUnique({ where: { chairmanId_scope: { chairmanId, scope } } }).catch(() => null);
  const before = J<Record<string, unknown>>(row?.valuesJson, {});
  const after: Record<string, unknown> = {};
  if (values) for (const k of WARN_FIELDS) {
    const v = values[k];
    if (v === undefined || v === null || v === "") continue;
    if (k === "lateMode") { after[k] = v === "LOCK" ? "LOCK" : "STAMP"; continue; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${k} must be a number from 0 to 100.`);
    after[k] = n;
  }
  const merged = { ...DEFAULT_WARN, ...after } as WarnSettings;
  if (merged.amberPct > merged.redPct) throw new Error("Amber must not be above red.");
  if (merged.redDay <= merged.marksDays - 1 && after.redDay !== undefined) throw new Error("Overdue must come after the due day.");
  await db.warnSetting.upsert({ where: { chairmanId_scope: { chairmanId, scope } }, create: { id: randomUUID(), chairmanId, scope, valuesJson: JSON.stringify(after), updatedById: user.id }, update: { valuesJson: JSON.stringify(after), updatedById: user.id, updatedAt: new Date() } });
  await logChanges(chairmanId, "WARN", scope, before, Object.fromEntries(WARN_FIELDS.map((k) => [k, after[k] ?? null])), user.id);
}
export async function changeLog(chairmanId: string, area: string, take = 50) {
  const rows = (await db.settingChange.findMany({ where: { chairmanId, area }, orderBy: { at: "desc" }, take }).catch(() => [])) as { scope: string; field: string; oldValue: string | null; newValue: string | null; byUserId: string; at: Date }[];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.byUserId).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, by: names.get(r.byUserId) || "—" }));
}

// ---- topics of an item, and the theory teacher of a lab item
async function itemTopics(courseId: string, instrumentId: string, label: string) {
  const links = await prisma.lectureRowInstrument.findMany({ where: { instrumentId }, select: { lectureRow: { select: { lectureNumber: true, week: true, topic: true, actualDate: true } } } });
  const own = links.map((l) => l.lectureRow).filter((l) => l.topic);
  if (own.length) return { topics: own.map((l) => l.topic), lectures: own, theoryCourseId: courseId };
  // A lab task: its lab plan row's theory topics.
  const n = Number(/(\d+)/.exec(label)?.[1]);
  const plan = n ? await db.labTaskPlan.findUnique({ where: { labCourseId_labNumber: { labCourseId: courseId, labNumber: n } } }).catch(() => null) : null;
  const refs = J<{ lectureNumber: number; topic: string }[]>(plan?.topicsJson, []);
  if (!refs.length) return { topics: [] as string[], lectures: [] as { lectureNumber: number; week: number; topic: string; actualDate: Date | null }[], theoryCourseId: null as string | null };
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, coordinatorId: true, batchId: true } });
  const theory = c ? await prisma.course.findFirst({ where: { coordinatorId: c.coordinatorId, batchId: c.batchId, code: c.code.replace(/-L$/i, "") }, select: { id: true } }) : null;
  const lectures = theory ? await prisma.lectureRow.findMany({ where: { courseId: theory.id, topic: { in: refs.map((r) => r.topic) } }, select: { lectureNumber: true, week: true, topic: true, actualDate: true }, orderBy: { lectureNumber: "asc" } }) : [];
  return { topics: refs.map((r) => r.topic), lectures, theoryCourseId: theory?.id || null };
}

/** After marks are saved: the deadline's entry stamp, and the early warning for the item. */
export async function afterMarks(courseId: string, instrumentId: string) {
  const inst = await prisma.assessmentInstrument.findUnique({ where: { id: instrumentId }, select: { id: true, label: true, type: true, maxScore: true, courseId: true } });
  if (!inst) return;
  const c = await courseScope(courseId);
  if (!c) return;
  const w = await courseWarnSettings(courseId);
  // Deadline: the first entry is stamped late after the due day.
  const d = await db.marksDeadline.findUnique({ where: { instrumentId } }).catch(() => null);
  if (d && !d.enteredAt) {
    const cal = await workCalendar(c.coordinator.managedById || "");
    const st = marksStatus(cal, new Date(d.heldOn), new Date(), new Date(), w);
    await db.marksDeadline.update({ where: { instrumentId }, data: { enteredAt: new Date(), late: st.late, updatedAt: new Date() } });
  }
  // Early warning once most of the class has marks.
  const [marks, enrolled] = await Promise.all([
    prisma.studentMark.findMany({ where: { instrumentId }, select: { studentId: true, score: true } }),
    prisma.studentEnrollment.count({ where: { courseId, status: { not: "WITHDRAWN" } } }),
  ]);
  await evaluate(c, w, { instrumentId, label: inst.label, type: inst.type, scores: marks.map((m) => m.score), max: inst.maxScore, enrolled });
}
/** Lab marks (entered by the lab engineer) are checked the same way; the alert goes to the theory teacher of the topic. */
export async function afterLabMarks(labCourseId: string, labNumber: number) {
  const c = await courseScope(labCourseId);
  if (!c) return;
  const w = await courseWarnSettings(labCourseId);
  const [marks, enrolled] = await Promise.all([
    prisma.labMark.findMany({ where: { courseId: labCourseId, labNumber }, select: { score: true, maxScore: true } }),
    prisma.studentEnrollment.count({ where: { courseId: labCourseId, status: { not: "WITHDRAWN" } } }),
  ]);
  if (!marks.length) return;
  await evaluate(c, w, { instrumentId: `lab:${labCourseId}:${labNumber}`, label: `Lab ${labNumber}`, type: "Lab", scores: marks.map((m) => (100 * m.score) / (m.maxScore || 1)), max: 100, enrolled });
}
async function evaluate(c: NonNullable<Awaited<ReturnType<typeof courseScope>>>, w: WarnSettings, inst: { instrumentId: string; label: string; type: string; scores: number[]; max: number; enrolled: number }) {
  const courseId = c.id, instrumentId = inst.instrumentId;
  if (inst.scores.length < Math.max(3, Math.ceil(inst.enrolled * 0.6))) return;
  const lv = warningLevel(inst.scores, inst.max, w);
  const topics = await itemTopics(courseId, instrumentId, inst.label);
  await recordEffect(courseId, instrumentId, topics.topics, 100 - lv.belowPct);
  if (!lv.level) return;
  const existing = await db.itemWarning.findUnique({ where: { instrumentId } }).catch(() => null);
  const isLab = /^lab$/i.test(c.courseType) || /lab/i.test(inst.type);
  const theory = isLab && topics.theoryCourseId && topics.theoryCourseId !== courseId ? await prisma.course.findUnique({ where: { id: topics.theoryCourseId }, select: { instructorId: true } }) : null;
  const who = warningRecipients({ part: isLab ? "LAB" : "THEORY", teacherId: c.instructorId, theoryTeacherId: theory?.instructorId || null, labEngineerId: c.labEngineerId, seId: c.subjectExpertId });
  const other = await otherPartBelow(courseId, topics.theoryCourseId, instrumentId, topics.topics, isLab, w);
  const dx = diagnose({ thisBelowPct: lv.belowPct, otherPartBelowPct: other.otherPart, classOtherItemsBelowPct: other.sameCourse });
  const taught = topics.lectures.length ? ` You taught it in L${topics.lectures.map((l) => l.lectureNumber).join("–L")} (Week ${topics.lectures[0].week}).` : "";
  const title = `${inst.label}${topics.topics[0] ? ` – ${topics.topics[0]}` : ""}: ${Math.round(lv.belowPct)}% of students below ${w.passPct}%`;
  const data = { courseId, level: lv.level, belowPct: lv.belowPct, sat: lv.sat, below: lv.below, topic: topics.topics.join("; ").slice(0, 300) || null, diagnosis: dx.text, toJson: JSON.stringify(who.to), ccJson: JSON.stringify(who.cc) };
  if (existing) {
    await db.itemWarning.update({ where: { instrumentId }, data });
    if (existing.level === "AMBER" && lv.level === "RED" && !existing.respondedAt) await notifyUsers([...who.to, ...who.cc], { kind: "EARLY_WARNING", title: `Now red — ${title}`, body: `${dx.text}${taught}`, href: `/courses/${courseId}/clo-attainment#warnings` });
    return;
  }
  await db.itemWarning.create({ data: { id: randomUUID(), instrumentId, ...data } });
  await notifyUsers(who.to, { kind: "EARLY_WARNING", title: `${lv.level === "RED" ? "🔴" : "🟠"} ${c.code} ${title}`, body: `${dx.text}${taught} Choose a CQI action within ${w.respondDays} days.`, href: `/courses/${courseId}/clo-attainment#warnings` });
  await notifyUsers(who.cc, { kind: "EARLY_WARNING", title: `(copy) ${c.code} ${title}`, body: dx.text, href: `/courses/${courseId}/clo-attainment#warnings` });
  if (dx.kind === "FAULTY") {
    const omc = await import("./omcMembers").then((m) => m.omcOfCourse(courseId)).catch(() => null);
    await notifyUsers(omc?.members.map((m) => m.id) || [], { kind: "EARLY_WARNING", title: `${c.code} ${inst.label}: possibly a faulty item`, body: `${Math.round(lv.belowPct)}% below the pass mark on this item only.`, href: "/omc/clo-attainment?tab=faulty" }).catch(() => null);
  }
  await flagStudents(courseId, c, w).catch(() => null);
}
/** % below the pass mark on the other part's items (lab vs theory) and on this course's other items, on the same topics. */
async function otherPartBelow(courseId: string, theoryId: string | null, instrumentId: string, topics: string[], isLab: boolean, w: WarnSettings) {
  const below = async (ids: string[]) => {
    if (!ids.length) return null;
    const [ms, insts] = await Promise.all([prisma.studentMark.findMany({ where: { instrumentId: { in: ids } }, select: { instrumentId: true, score: true } }), prisma.assessmentInstrument.findMany({ where: { id: { in: ids } }, select: { id: true, maxScore: true } })]);
    if (!ms.length) return null;
    const max = new Map(insts.map((i) => [i.id, i.maxScore]));
    return (100 * ms.filter((m) => (100 * m.score) / (max.get(m.instrumentId) || 1) < w.passPct).length) / ms.length;
  };
  const otherCourse = isLab ? theoryId : null;
  const linkIds = otherCourse && topics.length ? (await prisma.lectureRowInstrument.findMany({ where: { lectureRow: { courseId: otherCourse, topic: { in: topics } }, instrument: { source: "INSTRUCTOR" } }, select: { instrumentId: true } })).map((l) => l.instrumentId) : [];
  const same = (await prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR", id: { not: instrumentId } }, select: { id: true } })).map((i) => i.id);
  return { otherPart: await below(linkIds), sameCourse: await below(same) };
}
/** A student below the pass mark on two or more items of one CLO: his advisor is told (once). */
async function flagStudents(courseId: string, c: NonNullable<Awaited<ReturnType<typeof courseScope>>>, w: WarnSettings) {
  const { courseItems, courseMarks } = await import("./cloMethods");
  const { items, clos } = await courseItems(courseId, "INSTRUCTOR");
  const students = await courseMarks(courseId, items);
  const batch = c.batchId ? await prisma.batch.findUnique({ where: { id: c.batchId }, select: { advisorId: true } }) : null;
  if (!batch?.advisorId) return;
  for (const s of students) for (const clo of clos) {
    const weak = items.filter((i) => i.clos.some((x) => x.cloId === clo.id) && typeof s.marks[i.id] === "number" && (100 * (s.marks[i.id] as number)) / i.maxMarks < w.passPct);
    if (weak.length < 2) continue;
    const title = `${s.name} (${s.roll}) is below ${w.passPct}% on ${weak.length} items of ${c.code} ${clo.code}`;
    if (await prisma.notification.count({ where: { userId: batch.advisorId, title } })) continue;
    await notifyUsers([batch.advisorId], { kind: "RISK", title, body: weak.map((i) => i.label).join(", "), href: "/early-warning" });
  }
}

/** The next item on the same topic shows the effect of the CQI action: "Recursion: 32% → 61% passing after tutorial". */
async function recordEffect(courseId: string, instrumentId: string, topics: string[], passingPct: number) {
  if (!topics.length) return;
  const open = (await db.itemWarning.findMany({ where: { instrumentId: { not: instrumentId }, respondedAt: { not: null }, effectJson: null, topic: { not: null } } }).catch(() => [])) as { id: string; topic: string; belowPct: number; actionsJson: string; cqiRecordId: string | null; courseId: string; respondedAt: Date }[];
  for (const w of open) {
    const theirs = w.topic.split("; ").map((t) => t.trim().toLowerCase());
    if (!topics.some((t) => theirs.includes(t.trim().toLowerCase()))) continue;
    const before = Math.round(100 - w.belowPct), after = Math.round(passingPct);
    const acts = J<string[]>(w.actionsJson, []);
    const line = `${topics[0]}: ${before}% → ${after}% passing after ${acts.map((a) => ACTIONS[a as Action]?.toLowerCase() || a).join(", ") || "the action"}`;
    await db.itemWarning.update({ where: { id: w.id }, data: { effectJson: JSON.stringify({ before, after, line, instrumentId }) } });
    if (w.cqiRecordId) await prisma.cqiRecord.update({ where: { id: w.cqiRecordId }, data: { metricAfter: after, status: after > before ? "verified-effective" : "verified-ineffective", verifiedAt: new Date() } }).catch(() => null);
  }
}

export const ACTIONS = { TUTORIAL: "Extra tutorial", RETEACH: "Re-teach in the next lecture", PRACTICE_LAB: "Extra practice lab", REMEDIATION: "Help weak students only", SHARE: "Share material", FOLLOW_UP: "Tell the dependent course" } as const;
export type Action = keyof typeof ACTIONS;
/** The teacher's response: one or more CQI actions with a note → a CQI Record (closes the warning's deadline). */
export async function respond(user: { id: string; name: string }, warningId: string, actions: string[], note: string) {
  const w = await db.itemWarning.findUnique({ where: { id: warningId } });
  if (!w) throw new Error("Warning not found.");
  const allowed = [...J<string[]>(w.toJson, []), ...J<string[]>(w.ccJson, [])];
  const c = await courseScope(w.courseId);
  if (!allowed.includes(user.id) && c?.coordinatorId !== user.id) throw new Error("Only the teacher (or the SE / Program Lead) responds.");
  const acts = actions.filter((a): a is Action => a in ACTIONS);
  if (!acts.length) throw new Error("Choose at least one action.");
  if (note.trim().length < 3) throw new Error("Add a short note.");
  const inst = await prisma.assessmentInstrument.findUnique({ where: { id: w.instrumentId }, select: { label: true } });
  const cqi = await prisma.cqiRecord.create({ data: { chairmanId: c?.coordinator.managedById || "", authorId: user.id, batchId: c?.batchId || null, courseId: w.courseId, finding: `Early warning: ${inst?.label}${w.topic ? ` (${w.topic})` : ""} — ${Math.round(w.belowPct)}% of students below the pass mark. ${w.diagnosis || ""}`.slice(0, 2000), actionTaken: `${acts.map((a) => ACTIONS[a]).join(", ")}: ${note.trim()}`.slice(0, 2000), status: "in-progress", sourceType: "CLO", sourceReference: w.topic?.slice(0, 120) || inst?.label || null, metricBefore: Math.round(100 - w.belowPct) } });
  await db.itemWarning.update({ where: { id: warningId }, data: { respondedAt: new Date(), respondedById: user.id, actionsJson: JSON.stringify(acts), note: note.trim().slice(0, 1000), cqiRecordId: cqi.id, stage: "RESPONDED" } });
  return cqi.id;
}
export async function warningsOf(courseIds: string[]) {
  return (await db.itemWarning.findMany({ where: { courseId: { in: courseIds.concat("none") } }, orderBy: { raisedAt: "desc" } }).catch(() => [])) as { id: string; courseId: string; instrumentId: string; level: string; belowPct: number; sat: number; below: number; topic: string | null; diagnosis: string | null; stage: string; raisedAt: Date; respondedAt: Date | null; actionsJson: string; note: string | null; effectJson: string | null; cqiRecordId: string | null }[];
}

// ---- marks within one week
/** When the item was held: the date set (by the plan or corrected by the teacher), else its lecture's actual date. */
export async function setHeldOn(courseId: string, instrumentId: string, heldOn: Date) {
  const c = await courseScope(courseId);
  const w = await courseWarnSettings(courseId);
  const cal = await workCalendar(c?.coordinator.managedById || "");
  const due = marksDue(cal, heldOn, w.marksDays);
  await db.marksDeadline.upsert({ where: { instrumentId }, create: { instrumentId, courseId, heldOn, dueOn: due }, update: { heldOn, dueOn: due, updatedAt: new Date() } });
  return due;
}
/** Items of these courses with their marks status (for the teacher's home and the readiness board). */
export async function marksBoard(courseIds: string[], now = new Date()) {
  const rows = (await db.marksDeadline.findMany({ where: { courseId: { in: courseIds.concat("none") } } }).catch(() => [])) as { instrumentId: string; courseId: string; heldOn: Date; dueOn: Date; enteredAt: Date | null; late: boolean }[];
  const insts = await prisma.assessmentInstrument.findMany({ where: { id: { in: rows.map((r) => r.instrumentId).concat("none") } }, select: { id: true, label: true, course: { select: { code: true, coordinator: { select: { managedById: true } } } } } });
  const cals = new Map<string, Awaited<ReturnType<typeof workCalendar>>>();
  const out = [];
  for (const r of rows) {
    const i = insts.find((x) => x.id === r.instrumentId); if (!i) continue;
    const ch = i.course.coordinator.managedById || "";
    if (!cals.has(ch)) cals.set(ch, await workCalendar(ch));
    const w = await courseWarnSettings(r.courseId);
    const st = marksStatus(cals.get(ch)!, new Date(r.heldOn), now, r.enteredAt ? new Date(r.enteredAt) : null, w);
    out.push({ ...r, label: `${i.course.code} ${i.label}`, stage: st.stage, day: st.day, late: r.late || st.late });
  }
  return out.sort((a, b) => +new Date(a.dueOn) - +new Date(b.dueOn));
}
/** Daily: held dates from the lecture plan, reminders on working days 4 and 5, overdue from 6, HOD on 8; warnings escalate. */
export async function dailyMarksAndWarnings(now: Date) {
  let reminded = 0, escalated = 0;
  // Held dates from lectures the teacher has dated (the plan's actual dates) for items with no deadline yet.
  const links = await prisma.lectureRowInstrument.findMany({ where: { instrument: { source: "INSTRUCTOR", course: { isOffered: true } }, lectureRow: { actualDate: { not: null, lte: now } } }, select: { instrumentId: true, instrument: { select: { courseId: true } }, lectureRow: { select: { actualDate: true } } }, take: 5000 });
  const have = new Set(((await db.marksDeadline.findMany({ where: { instrumentId: { in: links.map((l) => l.instrumentId).concat("none") } }, select: { instrumentId: true } }).catch(() => [])) as { instrumentId: string }[]).map((x) => x.instrumentId));
  for (const l of links) if (!have.has(l.instrumentId)) { have.add(l.instrumentId); await setHeldOn(l.instrument.courseId, l.instrumentId, new Date(l.lectureRow.actualDate!)).catch(() => null); }
  const open = (await db.marksDeadline.findMany({ where: { enteredAt: null } }).catch(() => [])) as { instrumentId: string; courseId: string; heldOn: Date; remindedJson: string; escalatedAt: Date | null }[];
  for (const d of open) {
    const c = await courseScope(d.courseId); if (!c) continue;
    const w = await courseWarnSettings(d.courseId);
    const cal = await workCalendar(c.coordinator.managedById || "");
    const st = marksStatus(cal, new Date(d.heldOn), now, null, w);
    const inst = await prisma.assessmentInstrument.findUnique({ where: { id: d.instrumentId }, select: { label: true, type: true } });
    const isLab = /^lab$/i.test(c.courseType) || /lab/i.test(inst?.type || "");
    const owner = isLab && c.labEngineerId ? c.labEngineerId : c.instructorId;
    const done = J<number[]>(d.remindedJson, []);
    if (st.remind && !done.includes(st.day)) {
      await notifyUsers([owner], { kind: "DEADLINE", title: `Marks due${st.day === w.marksDays ? " today" : " tomorrow"}: ${c.code} ${inst?.label}`, body: `Held ${new Date(d.heldOn).toISOString().slice(0, 10)} — marks are due on working day ${w.marksDays}.`, href: `/instructor/courses/${d.courseId}/marks` });
      await db.marksDeadline.update({ where: { instrumentId: d.instrumentId }, data: { remindedJson: JSON.stringify([...done, st.day]) } });
      reminded++;
    }
    if (st.stage === "ESCALATED" && !d.escalatedAt) {
      const { approverFor } = await import("./approvers");
      const hod = await approverFor(c.coordinator.managedById || "", "HEAD_OF_DEPARTMENT", { departmentId: c.coordinator.departmentId }).catch(() => ({ ids: [] as string[] }));
      await notifyUsers(hod.ids, { kind: "DEADLINE", title: `Marks overdue (working day ${st.day}): ${c.code} ${inst?.label}`, body: `Not entered yet — due working day ${w.marksDays}.`, href: `/instructor/courses/${d.courseId}/marks` });
      await db.marksDeadline.update({ where: { instrumentId: d.instrumentId }, data: { escalatedAt: now } });
      escalated++;
    }
  }
  // Warnings nobody answered: to the SE after respondDays, then to the Program Lead / HOD.
  const ws = (await db.itemWarning.findMany({ where: { respondedAt: null } }).catch(() => [])) as { id: string; courseId: string; stage: string; raisedAt: Date; topic: string | null; belowPct: number }[];
  for (const x of ws) {
    const w = await courseWarnSettings(x.courseId);
    const stage = escalationStage(new Date(x.raisedAt), now, null, w);
    if (stage === x.stage) continue;
    const c = await courseScope(x.courseId); if (!c) continue;
    let to: (string | null)[] = [];
    if (stage === "SE") to = [c.subjectExpertId];
    else if (stage === "HOD") { const { approverFor } = await import("./approvers"); to = [c.coordinatorId, ...((await approverFor(c.coordinator.managedById || "", "HEAD_OF_DEPARTMENT", { departmentId: c.coordinator.departmentId }).catch(() => ({ ids: [] as string[] }))).ids)]; }
    await notifyUsers(to, { kind: "EARLY_WARNING", title: `No response: ${c.code} early warning${x.topic ? ` (${x.topic})` : ""}`, body: `${Math.round(x.belowPct)}% below the pass mark — the teacher has not chosen a CQI action.`, href: `/courses/${x.courseId}/clo-attainment#warnings` });
    await db.itemWarning.update({ where: { id: x.id }, data: { stage } });
    escalated++;
  }
  return { reminded, escalated };
}
export { workdayNumber };

/** With "locked" late entry: marks after the due day wait for the HOD to unlock the item (with a reason). */
export async function lateLock(courseId: string, instrumentId: string): Promise<string | null> {
  const d = await db.marksDeadline.findUnique({ where: { instrumentId } }).catch(() => null);
  if (!d || d.enteredAt || d.unlockedById) return null;
  const w = await courseWarnSettings(courseId);
  if (w.lateMode !== "LOCK") return null;
  const c = await courseScope(courseId);
  const st = marksStatus(await workCalendar(c?.coordinator.managedById || ""), new Date(d.heldOn), new Date(), null, w);
  return st.day > w.marksDays ? `Marks for this item were due on working day ${w.marksDays}. Entry is locked until the HOD unlocks it.` : null;
}
export async function unlockLate(user: { id: string }, instrumentId: string, reason: string) {
  if (reason.trim().length < 3) throw new Error("Give the reason.");
  await db.marksDeadline.update({ where: { instrumentId }, data: { unlockedById: user.id, unlockReason: reason.trim().slice(0, 300) } });
}
