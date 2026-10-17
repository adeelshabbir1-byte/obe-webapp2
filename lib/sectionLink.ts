import { prisma } from "./db";

// "Teach as one": one teacher's sections of the same course share a main section's plan. The main section is edited as
// usual; its CLOs, weights, assessments, lecture plan and paper are copied into the linked sections, matched by code /
// label / lecture number so marks, attendance and the lecture log (held dates) of each section are never touched.
export const sdb = prisma as unknown as Record<string, any>;
export type Link = { courseId: string; masterId: string; lastSyncedAt: Date | null };

export async function linkOf(courseId: string) {
  return (await sdb.sectionLink.findUnique({ where: { courseId } }).catch(() => null)) as Link | null;
}
export async function followersOf(masterId: string) {
  return ((await sdb.sectionLink.findMany({ where: { masterId } }).catch(() => [])) as Link[]).map((l) => l.courseId);
}

const WEIGHT_FIELDS = ["instructorAssignmentPct", "instructorQuizPct", "instructorProjectPct", "instructorLabPct", "instructorMidtermPct", "instructorFinalPct", "instructorAssignmentCount", "instructorQuizCount", "instructorProjectCount", "instructorLabCount", "instructorMidtermCount", "instructorFinalCount"] as const;

/** Copy the main section's plan into one linked section. */
export async function syncSection(masterId: string, targetId: string) {
  const [m, t] = await Promise.all([prisma.course.findUnique({ where: { id: masterId } }), prisma.course.findUnique({ where: { id: targetId } })]);
  if (!m || !t) return;
  // Weights
  await prisma.course.update({ where: { id: t.id }, data: Object.fromEntries(WEIGHT_FIELDS.map((f) => [f, (m as Record<string, unknown>)[f] ?? null])) as never });
  // PLOs may belong to another batch: map by PLO number.
  const [mPlos, tPlos] = await Promise.all([m.batchId ? prisma.pLO.findMany({ where: { batchId: m.batchId }, select: { id: true, number: true } }) : [], t.batchId ? prisma.pLO.findMany({ where: { batchId: t.batchId }, select: { id: true, number: true } }) : []]);
  const ploMap = new Map(mPlos.map((p) => [p.id, tPlos.find((x) => x.number === p.number)?.id || (m.batchId === t.batchId ? p.id : null)]));

  // CLOs by code
  const [mClos, tClos] = await Promise.all([prisma.cLO.findMany({ where: { courseId: m.id, source: "INSTRUCTOR" } }), prisma.cLO.findMany({ where: { courseId: t.id, source: "INSTRUCTOR" } })]);
  const cloMap = new Map<string, string>(); // master CLO id -> target CLO id
  for (const c of mClos) {
    const data = { statement: c.statement, bloomLevel: c.bloomLevel, mappedPloId: c.mappedPloId ? ploMap.get(c.mappedPloId) ?? null : null, ploContributionPct: c.ploContributionPct, orderIndex: c.orderIndex, targetPct: c.targetPct, ploMappingSource: c.ploMappingSource };
    const ex = tClos.find((x) => x.code === c.code);
    if (ex) { await prisma.cLO.update({ where: { id: ex.id }, data }); cloMap.set(c.id, ex.id); }
    else { const n = await prisma.cLO.create({ data: { courseId: t.id, source: "INSTRUCTOR", code: c.code, ...data } }); cloMap.set(c.id, n.id); }
  }
  const extraClos = tClos.filter((x) => !mClos.some((c) => c.code === x.code)).map((x) => x.id);

  // Assessments by type + label (never delete one that has marks)
  const [mInst, tInst] = await Promise.all([prisma.assessmentInstrument.findMany({ where: { courseId: m.id, source: "INSTRUCTOR" } }), prisma.assessmentInstrument.findMany({ where: { courseId: t.id, source: "INSTRUCTOR" } })]);
  const instMap = new Map<string, string>();
  for (const i of mInst) {
    const ex = tInst.find((x) => x.type === i.type && x.label === i.label);
    const data = { marksPct: i.marksPct, maxScore: i.maxScore, cloId: i.cloId ? cloMap.get(i.cloId) ?? null : null };
    if (ex) { await prisma.assessmentInstrument.update({ where: { id: ex.id }, data }); instMap.set(i.id, ex.id); }
    else { const n = await prisma.assessmentInstrument.create({ data: { courseId: t.id, source: "INSTRUCTOR", type: i.type, label: i.label, ...data } }); instMap.set(i.id, n.id); }
  }
  for (const i of mInst) if (i.partOfId && instMap.get(i.id)) await prisma.assessmentInstrument.update({ where: { id: instMap.get(i.id)! }, data: { partOfId: instMap.get(i.partOfId) ?? null } });
  const extraInst = tInst.filter((x) => !mInst.some((i) => i.type === x.type && i.label === x.label));
  for (const x of extraInst) if (!(await prisma.studentMark.count({ where: { instrumentId: x.id } }))) { await prisma.lectureRowInstrument.deleteMany({ where: { instrumentId: x.id } }); await prisma.assessmentInstrument.delete({ where: { id: x.id } }).catch(() => null); }

  // Lecture plan by lecture number (keeps each section's held dates and attendance)
  const [mRows, tRows] = await Promise.all([prisma.lectureRow.findMany({ where: { courseId: m.id, source: "INSTRUCTOR" } }), prisma.lectureRow.findMany({ where: { courseId: t.id, source: "INSTRUCTOR" } })]);
  const rowMap = new Map<string, string>();
  for (const r of mRows) {
    const data = { week: r.week, topic: r.topic, subtopic: r.subtopic, cloId: r.cloId ? cloMap.get(r.cloId) ?? null : null, bloomLevel: r.bloomLevel, weightPct: r.weightPct, teachingMethod: r.teachingMethod, teachingMaterials: r.teachingMaterials };
    const ex = tRows.find((x) => x.lectureNumber === r.lectureNumber);
    if (ex) { await prisma.lectureRow.update({ where: { id: ex.id }, data }); rowMap.set(r.id, ex.id); }
    else { const n = await prisma.lectureRow.create({ data: { courseId: t.id, source: "INSTRUCTOR", lectureNumber: r.lectureNumber, ...data } }); rowMap.set(r.id, n.id); }
  }
  for (const x of tRows.filter((x) => !mRows.some((r) => r.lectureNumber === x.lectureNumber))) {
    if (!x.actualDate && !(await prisma.attendanceRecord.count({ where: { lectureRowId: x.id } }))) { await prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: x.id } }); await prisma.paperDistributionItem.deleteMany({ where: { lectureRowId: x.id } }); await prisma.lectureRow.delete({ where: { id: x.id } }).catch(() => null); }
  }
  // Topic ↔ assessment links, rebuilt for the mapped rows
  const links = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId: { in: mRows.map((r) => r.id) } } });
  await prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: Array.from(rowMap.values()) } } });
  const linkData = links.map((l) => ({ lectureRowId: rowMap.get(l.lectureRowId)!, instrumentId: instMap.get(l.instrumentId)! })).filter((l) => l.lectureRowId && l.instrumentId);
  if (linkData.length) await prisma.lectureRowInstrument.createMany({ data: linkData, skipDuplicates: true });

  // Paper distribution: replaced (it carries no student data)
  const items = await prisma.paperDistributionItem.findMany({ where: { courseId: m.id, source: "INSTRUCTOR" } });
  await prisma.paperDistributionItem.deleteMany({ where: { courseId: t.id, source: "INSTRUCTOR" } });
  if (items.length) await prisma.paperDistributionItem.createMany({ data: items.map((i) => ({ courseId: t.id, source: "INSTRUCTOR", examType: i.examType, questionNo: i.questionNo, lectureRowId: i.lectureRowId ? rowMap.get(i.lectureRowId) ?? null : null, topicText: i.topicText, cloId: i.cloId ? cloMap.get(i.cloId) ?? null : null, cognitiveLevel: i.cognitiveLevel, marks: i.marks, orderIndex: i.orderIndex })) });

  // CLOs no longer in the main section: removed when nothing refers to them any more
  for (const id of extraClos) {
    const used = (await prisma.lectureRow.count({ where: { cloId: id } })) + (await prisma.assessmentInstrument.count({ where: { cloId: id } })) + (await prisma.paperDistributionItem.count({ where: { cloId: id } }));
    if (!used) await prisma.cLO.delete({ where: { id } }).catch(() => null);
  }
  await sdb.sectionLink.update({ where: { courseId: t.id }, data: { lastSyncedAt: new Date() } }).catch(() => null);
}

/** Bring a linked section up to date when it is opened (at most every ten seconds), and every follower of a main section. */
export async function ensureSynced(courseId: string) {
  try {
    const l = await linkOf(courseId);
    if (l && (!l.lastSyncedAt || Date.now() - l.lastSyncedAt.getTime() > 10000)) await syncSection(l.masterId, courseId);
  } catch { /* never block a page */ }
}
export async function syncFollowers(masterId: string) {
  for (const id of await followersOf(masterId)) await syncSection(masterId, id).catch(() => null);
}

/** On a linked section, the plan is edited in the main section: refuse plan changes here (marks, attendance and the log stay open). */
export async function followerBlocked(courseId: string) {
  let method = "GET", path = "";
  try { const { headers } = await import("next/headers"); method = headers().get("x-method") || "GET"; path = headers().get("x-pathname") || ""; } catch { return false; }
  if (method === "GET" || !/\/(clo|weights|instruments|lecture-mapping|paper-distribution|refresh-plan|sync-to-linked-sections)(\/|$)/.test(path)) return false;
  return !!(await linkOf(courseId));
}

/** The same assessment in a linked section (matched by type and label). */
export async function mirrorInstrument(instrumentId: string | null, targetCourseId: string) {
  if (!instrumentId) return null;
  const i = await prisma.assessmentInstrument.findUnique({ where: { id: instrumentId }, select: { type: true, label: true } });
  if (!i) return null;
  return (await prisma.assessmentInstrument.findFirst({ where: { courseId: targetCourseId, source: "INSTRUCTOR", type: i.type, label: i.label }, select: { id: true } }))?.id || null;
}
