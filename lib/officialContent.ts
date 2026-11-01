import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { fromMasterTopics, parseOutline, spreadTo32, planLine, PLACEHOLDER, type OfficialPlan } from "./officialContentCore";

// Official content into the base courses of QR-I, QR-II and Discrete Structures (Part 5). Sources, never invented:
//  · Discrete Structures — the owner's own course data already in the master curriculum (GE116: lectures, sub-topics
//    with their [CLO] tags, week and lecture order; CLO statements when the master course has them, else numbered
//    placeholders to fill in);
//  · QR-I / QR-II — the HEC QR course outline (uploaded Markdown; weekly modules and topics, spread over 32 lectures by
//    the published weekly order) and the CLOs of GE117 / GE118 in the master curriculum.
// The current plan is saved first (restorable); an OMC-approved plan gets a change request instead, applied once the
// OMC reopens it. Followers are synced from the base; the Course Catalog entry is updated; a system-generated
// duplicate master course (IDS-D01) is retired: hidden from pickers, its courses re-pointed, kept in the history.

const db = prisma as unknown as Record<string, any>;
export const OFFICIAL_HINT = "Run prisma/migration_official_content.sql in Supabase first.";
export type Kind = "DS" | "QR1" | "QR2";
type Who = { id: string; role: string; name: string };

export const KINDS: Record<Kind, { title: string; codes: string[]; titleRe: RegExp; outlineCourse: string | null; label: string }> = {
  DS: { title: "Discrete Structures", codes: ["GE116", "GE-116"], titleRe: /discrete\s+(structure|math)/i, outlineCourse: null, label: "Discrete Structures (GE116, the institute's own course data)" },
  QR1: { title: "Quantitative Reasoning-I", codes: ["GE117", "GE-117"], titleRe: /quantitative\s+reasoning[\s-]*(i\b|1\b|-i\b)(?!i)/i, outlineCourse: "Course I", label: "Quantitative Reasoning I (HEC QR Course I — Exploring Quantitative Skills)" },
  QR2: { title: "Quantitative Reasoning-II", codes: ["GE118", "GE-118"], titleRe: /quantitative\s+reasoning[\s-]*(ii\b|2\b)/i, outlineCourse: "Course II", label: "Quantitative Reasoning II (HEC QR Course II — Tools for Quantitative Reasoning)" },
};
export const DUPLICATE_CODES = ["IDS-D01"];

/** The master course a kind is read from: its code in the latest curriculum that has it. */
export async function masterOf(kind: Kind, code?: string) {
  const codes = code ? [code] : KINDS[kind].codes;
  return prisma.masterCourse.findFirst({
    where: { OR: codes.map((c) => ({ code: { equals: c, mode: "insensitive" as const } })) },
    include: { seedClos: { orderBy: { orderIndex: "asc" } }, seedTopics: { orderBy: { lectureNumber: "asc" } }, masterCurriculum: { select: { id: true, authority: true, title: true, version: true } } },
    orderBy: { masterCurriculum: { createdAt: "desc" } },
  });
}

/** The official plan of a kind, from its sources; what is not in them is listed, never made up. */
export async function sourcePlan(kind: Kind, outline: string | null, code?: string): Promise<OfficialPlan & { source: string; masterId: string | null; masterCode: string | null; of: string; creditHours: number; semester: number | null }> {
  const m = await masterOf(kind, code);
  const missing: string[] = [];
  const clos = (m?.seedClos || []).map((c, i) => ({ code: `CLO-${i + 1}`, statement: c.statement, bloom: c.bloomLevel || "C2" }));
  const base = { masterId: m?.id || null, masterCode: m?.code || null, of: m?.masterCurriculum ? `${m.masterCurriculum.authority} ${m.masterCurriculum.title} ${m.masterCurriculum.version}` : "HEC BS Computer Science 2025", creditHours: m?.creditHours || 3, semester: m?.semesterNumber ?? null, description: m?.catalogDescription || null };
  if (!m) missing.push(`the master course ${KINDS[kind].codes[0]} is not in the master curriculum`);
  if (kind === "DS") {
    const { lectures, tagged } = fromMasterTopics(m?.seedTopics || [], clos.length);
    if (!lectures.length) missing.push("GE116's lectures (none stored with the master course)");
    if (!clos.length && tagged.length) {
      for (let n = 1; n <= Math.max(...tagged); n++) clos.push({ code: `CLO-${n}`, statement: PLACEHOLDER(`CLO-${n}`), bloom: "C2", placeholder: true } as never);
      missing.push(`CLO statements (CLO-1…CLO-${Math.max(...tagged)} kept as numbered placeholders — fill them in from the NCEAC Autogenerator)`);
    } else if (!clos.length) missing.push("CLOs");
    return { ...base, clos, lectures, missing, source: `${m?.code || "GE116"} in ${base.of} (the institute's own course data)` };
  }
  if (!clos.length) missing.push(`CLOs (${KINDS[kind].codes[0]} in the master curriculum has none)`);
  const weeks = outline ? parseOutline(outline, KINDS[kind].outlineCourse || undefined) : [];
  if (!outline) missing.push("the HEC QR course outline (upload sources/HEC-QR-course-outline-2021.md)");
  else if (!weeks.length) missing.push(`the weekly breakdown of ${KINDS[kind].outlineCourse} (not found in the outline file)`);
  const lectures = spreadTo32(weeks);
  if (lectures.length && !lectures.some((l) => l.clo)) missing.push("topic → CLO links (the outline does not tag topics with CLOs; set them in the Topic Workspace)");
  return { ...base, clos, lectures, missing, source: `HEC QR outline (${KINDS[kind].outlineCourse}) + ${m?.code || KINDS[kind].codes[0]} CLOs` };
}

/** The base course of the kind's content-sync group in the institute; else the latest copy. */
export async function targetOf(chairmanId: string, kind: Kind, masterIds: string[]) {
  const all = await prisma.course.findMany({
    where: { coordinator: { managedById: chairmanId }, OR: [{ masterCourseId: { in: masterIds.length ? masterIds : ["none"] } }, { title: { contains: KINDS[kind].title.split(/[\s-]/)[0], mode: "insensitive" } }] },
    select: { id: true, code: true, title: true, templateStatus: true, masterCourseId: true, createdAt: true, subjectExpertId: true, batch: { select: { batchName: true, startYear: true, startTerm: true, degreeProgram: true } } },
  });
  const cands = all.filter((c) => (c.masterCourseId && masterIds.includes(c.masterCourseId)) || KINDS[kind].titleRe.test(c.title));
  if (!cands.length) return null;
  const mem = await prisma.courseContentSyncMember.findMany({ where: { courseId: { in: cands.map((c) => c.id) } }, select: { courseId: true, groupId: true, isBase: true } });
  const sizes = new Map<string, number>(); mem.forEach((x) => sizes.set(x.groupId, (sizes.get(x.groupId) || 0) + 1));
  const bigGroup = Array.from(sizes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  let baseId: string | null = null;
  if (bigGroup) {
    const b = await prisma.courseContentSyncMember.findFirst({ where: { groupId: bigGroup, isBase: true }, select: { courseId: true } });
    baseId = b?.courseId || null;
  }
  const base = (baseId && (cands.find((c) => c.id === baseId) || (await prisma.course.findUnique({ where: { id: baseId }, select: { id: true, code: true, title: true, templateStatus: true, masterCourseId: true, createdAt: true, subjectExpertId: true, batch: { select: { batchName: true, startYear: true, startTerm: true, degreeProgram: true } } } })))) ||
    cands.filter((c) => !mem.some((m) => m.courseId === c.id && !m.isBase)).sort((a, b) => (b.batch?.startYear || 0) - (a.batch?.startYear || 0) || +b.createdAt - +a.createdAt)[0] || null;
  if (!base) return null;
  const followers = bigGroup ? await prisma.courseContentSyncMember.count({ where: { groupId: bigGroup, isBase: false } }) : 0;
  return { ...base, groupId: bigGroup || null, followers, others: cands.filter((c) => c.id !== base.id).map((c) => ({ id: c.id, code: c.code, title: c.title, batch: c.batch?.batchName || "" })) };
}

async function snapshot(courseId: string) {
  const [clos, rows] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source: "SE" } }),
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" } }),
  ]);
  const ids = rows.map((r) => r.id).concat("none");
  const [links, papers, meta] = await Promise.all([
    prisma.lectureRowInstrument.findMany({ where: { lectureRowId: { in: ids } } }),
    prisma.paperDistributionItem.findMany({ where: { lectureRowId: { in: ids } }, select: { id: true, lectureRowId: true } }),
    db.topicMeta.findMany({ where: { lectureRowId: { in: ids } } }).catch(() => []),
  ]);
  return { clos, rows, links, papers, meta };
}
type Snap = Awaited<ReturnType<typeof snapshot>>;

/** A course chosen by hand: of this institute, and not a synced follower (its base is loaded instead). */
async function chosenTarget(chairmanId: string, courseId: string) {
  const c = await prisma.course.findFirst({ where: { id: courseId, coordinator: { managedById: chairmanId } }, select: { id: true, code: true, title: true, templateStatus: true, masterCourseId: true, createdAt: true, subjectExpertId: true, batch: { select: { batchName: true, startYear: true, startTerm: true, degreeProgram: true } } } });
  if (!c) throw new Error("That course is not in this institute.");
  const m = await prisma.courseContentSyncMember.findUnique({ where: { courseId } });
  if (m && !m.isBase) throw new Error("That course follows a base course — load into the base course instead.");
  const followers = m ? await prisma.courseContentSyncMember.count({ where: { groupId: m.groupId, isBase: false } }) : 0;
  return { ...c, groupId: m?.groupId || null, followers, others: [] as { id: string; code: string; title: string; batch: string }[] };
}

export async function preview(chairmanId: string, kind: Kind, outline: string | null, courseId?: string | null) {
  const plan = await sourcePlan(kind, outline);
  const target = courseId ? await chosenTarget(chairmanId, courseId) : await targetOf(chairmanId, kind, plan.masterId ? [plan.masterId] : []);
  const now = target ? await Promise.all([prisma.cLO.count({ where: { courseId: target.id, source: "SE" } }), prisma.lectureRow.count({ where: { courseId: target.id, source: "SE" } })]) : [0, 0];
  return { kind, label: KINDS[kind].label, plan, line: planLine(plan), target, now: { clos: now[0], lectures: now[1] }, approved: target?.templateStatus === "approved" };
}

/** Load (or ask the OMC to load) the official content into the base course. */
export async function load(user: Who, chairmanId: string, kind: Kind, outline: string | null, courseId?: string | null) {
  const pv = await preview(chairmanId, kind, outline, courseId);
  if (!pv.target) throw new Error(`No ${KINDS[kind].title} course in this institute yet — add it to a batch first.`);
  if (!pv.plan.lectures.length) throw new Error(`Nothing to load: ${pv.plan.missing.join("; ")}.`);
  const id = randomUUID();
  const base = { id, chairmanId, courseId: pv.target.id, kind, sourceLabel: pv.plan.source.slice(0, 300), contentJson: JSON.stringify(pv.plan), summary: pv.line, byUserId: user.id };
  if (pv.approved) {
    const cr = await prisma.templateChangeRequest.create({ data: { courseId: pv.target.id, requestedById: user.id, reason: `Load the official content — ${pv.plan.source}: ${pv.line}. The current plan is replaced; it is saved first and can be restored.` } });
    await db.officialContentLoad.create({ data: { ...base, status: "PENDING", changeRequestId: cr.id } });
    await writeAuditLog({ actorUserId: user.id, action: "OFFICIAL_CONTENT_REQUESTED", entityType: "Course", entityId: pv.target.id, metadata: { kind, summary: pv.line } });
    return { requested: true, id, course: `${pv.target.code} ${pv.target.title}`, line: pv.line, missing: pv.plan.missing };
  }
  await db.officialContentLoad.create({ data: { ...base, status: "APPLYING", beforeJson: JSON.stringify(await snapshot(pv.target.id)) } });
  const r = await apply(user, id).catch(async (e) => { await restore(id).catch(() => null); await db.officialContentLoad.update({ where: { id }, data: { status: "FAILED" } }); throw e; });
  return { applied: true, id, course: `${pv.target.code} ${pv.target.title}`, line: pv.line, missing: pv.plan.missing, ...r };
}

/** A pending load once the OMC has reopened the approved plan. */
export async function applyPending(user: Who, loadId: string) {
  const l = await db.officialContentLoad.findUnique({ where: { id: loadId } });
  if (!l || l.status !== "PENDING") throw new Error("No pending load.");
  const c = await prisma.course.findUniqueOrThrow({ where: { id: l.courseId }, select: { templateStatus: true } });
  if (c.templateStatus === "approved") throw new Error("The plan is still approved: the OMC has not reopened it yet.");
  await db.officialContentLoad.update({ where: { id: loadId }, data: { status: "APPLYING", beforeJson: JSON.stringify(await snapshot(l.courseId)) } });
  return apply(user, loadId).catch(async (e) => { await restore(loadId).catch(() => null); await db.officialContentLoad.update({ where: { id: loadId }, data: { status: "PENDING" } }); throw e; });
}

async function apply(user: Who, loadId: string) {
  const l = await db.officialContentLoad.findUniqueOrThrow({ where: { id: loadId } });
  const plan = JSON.parse(l.contentJson) as Awaited<ReturnType<typeof sourcePlan>>;
  const courseId: string = l.courseId;
  const kept: string[] = [];
  await prisma.$transaction(async (tx) => {
    // CLOs: the official ones by number (statement and Bloom level); CLOs beyond them are kept and reported.
    const existing = await tx.cLO.findMany({ where: { courseId, source: "SE" }, orderBy: { orderIndex: "asc" } });
    const cloId = new Map<string, string>();
    for (const [i, c] of plan.clos.entries()) {
      const cur = existing.find((e) => e.code === c.code);
      if (cur) { await tx.cLO.update({ where: { id: cur.id }, data: { statement: c.statement, bloomLevel: c.bloom } }); cloId.set(c.code, cur.id); }
      else { const n = await tx.cLO.create({ data: { courseId, source: "SE", code: c.code, statement: c.statement, bloomLevel: c.bloom, orderIndex: existing.length + i, targetPct: 60 } }); cloId.set(c.code, n.id); }
    }
    existing.filter((e) => !plan.clos.some((c) => c.code === e.code)).forEach((e) => kept.push(e.code));
    const bloomOf = new Map(plan.clos.map((c) => [c.code, c.bloom]));
    // Lectures: the official ones replace the current topics, in order; lectures beyond them are removed
    // (their assessment links and exam-question links are let go — all saved in the version).
    const rows = await tx.lectureRow.findMany({ where: { courseId, source: "SE" }, orderBy: [{ lectureNumber: "asc" }, { id: "asc" }] });
    const used: string[] = [];
    for (const [i, x] of plan.lectures.entries()) {
      const note = x.splitFrom ? `split from ${x.splitFrom}` : x.midterm ? "Mid-term examination week" : null;
      const data = { lectureNumber: x.lecture, week: x.week, topic: x.topic.slice(0, 500), subtopic: x.subtopic || note, cloId: x.clo ? cloId.get(x.clo) || null : null, bloomLevel: x.clo ? bloomOf.get(x.clo) || null : null };
      const r = rows[i];
      if (r) { await tx.lectureRow.update({ where: { id: r.id }, data }); used.push(r.id); }
      else used.push((await tx.lectureRow.create({ data: { courseId, source: "SE", ...data } })).id);
    }
    const extra = rows.filter((r) => !used.includes(r.id)).map((r) => r.id);
    if (extra.length) {
      const att = await tx.attendanceRecord.count({ where: { lectureRowId: { in: extra } } });
      if (att) throw new Error("Lectures beyond the official plan have attendance marked — they cannot be removed.");
      await tx.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: extra } } });
      await tx.paperDistributionItem.updateMany({ where: { lectureRowId: { in: extra } }, data: { lectureRowId: null } });
      await tx.lectureRow.deleteMany({ where: { id: { in: extra } } });
    }
    // Importance starts again as "suggested" (the workspace pre-fills it); the old levels are in the version.
    await (tx as unknown as Record<string, any>).topicMeta.deleteMany({ where: { lectureRowId: { in: rows.map((r) => r.id).concat("none") } } }).catch(() => null);
  }, { timeout: 60000, maxWait: 15000 });
  if (plan.description) await prisma.course.update({ where: { id: courseId }, data: { catalogDescription: plan.description } }).catch(() => null);
  await import("./lectureWeights").then((m) => m.recomputeCourseRows(courseId, "SE")).catch(() => null);
  const sync = await import("./contentSync").then((m) => m.syncCourseContentToLinkedCourses(courseId)).catch(() => ({ synced: [] as string[] }));
  // The Course Catalog entry.
  let catalog: string | null = null;
  try {
    const { saveOfficialEntry } = await import("./courseCatalog");
    const e = await saveOfficialEntry(user, { title: KINDS[l.kind as Kind].title, instituteCode: plan.masterCode || KINDS[l.kind as Kind].codes[0], of: plan.of, creditHours: plan.creditHours, semester: plan.semester, clos: plan.clos.map((c, i) => ({ n: i + 1, statement: c.statement, bloom: c.bloom })), lectures: plan.lectures.map((x) => ({ n: x.lecture, topic: x.topic, sub: x.subtopic || (x.splitFrom ? `split from ${x.splitFrom}` : ""), clo: x.clo ? Number(x.clo.replace(/\D/g, "")) : null })), note: `Official content: ${plan.source}.` });
    catalog = `${e.code} v${e.version}`;
  } catch { catalog = null; }
  let retired: Awaited<ReturnType<typeof retireDuplicates>> | null = null;
  if (l.kind === "DS" && plan.masterId) retired = await retireDuplicates(user, l.chairmanId, plan.masterId, courseId).catch(() => null);
  await db.officialContentLoad.update({ where: { id: loadId }, data: { status: "APPLIED", appliedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "OFFICIAL_CONTENT_LOADED", entityType: "Course", entityId: courseId, metadata: { kind: l.kind, summary: l.summary, catalog: catalog || "" } });
  return { synced: (sync as { synced: string[] }).synced?.length || 0, keptClos: kept, catalog, retired };
}

/** Back to the saved version: CLOs, lectures (with their ids), links, exam-question links and importance. */
async function restore(loadId: string) {
  const l = await db.officialContentLoad.findUniqueOrThrow({ where: { id: loadId } });
  const b = JSON.parse(l.beforeJson || "{}") as Snap;
  if (!b.rows) throw new Error("Nothing to restore.");
  const courseId: string = l.courseId;
  const date = (x: unknown) => (x ? new Date(x as string) : x);
  await prisma.$transaction(async (tx) => {
    const t = tx as unknown as Record<string, any>;
    const rowIds = new Set(b.rows.map((r) => r.id)), cloIds = new Set(b.clos.map((c) => c.id));
    const now = await tx.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { id: true } });
    const added = now.filter((r) => !rowIds.has(r.id)).map((r) => r.id);
    if (added.length) {
      await tx.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: added } } });
      await tx.paperDistributionItem.updateMany({ where: { lectureRowId: { in: added } }, data: { lectureRowId: null } });
      await t.topicMeta.deleteMany({ where: { lectureRowId: { in: added } } }).catch(() => null);
      await tx.lectureRow.deleteMany({ where: { id: { in: added } } });
    }
    for (const c of b.clos) await tx.cLO.update({ where: { id: c.id }, data: { code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, orderIndex: c.orderIndex } }).catch(() => null);
    const newClos = (await tx.cLO.findMany({ where: { courseId, source: "SE" }, select: { id: true } })).filter((c) => !cloIds.has(c.id)).map((c) => c.id);
    if (newClos.length) { await tx.lectureRow.updateMany({ where: { cloId: { in: newClos } }, data: { cloId: null } }); await tx.cLO.deleteMany({ where: { id: { in: newClos } } }).catch(() => null); }
    const have = new Set((await tx.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { id: true } })).map((r) => r.id));
    for (const r of b.rows) {
      const data = { lectureNumber: r.lectureNumber, week: r.week, topic: r.topic, subtopic: r.subtopic, cloId: r.cloId, bloomLevel: r.bloomLevel, weightPct: r.weightPct };
      if (have.has(r.id)) await tx.lectureRow.update({ where: { id: r.id }, data });
      else await tx.lectureRow.create({ data: { ...(r as never as Record<string, unknown>), createdAt: date((r as never as Record<string, unknown>).createdAt), actualDate: date(r.actualDate), updatedAt: date((r as never as Record<string, unknown>).updatedAt) } as never });
    }
    if (b.links.length) await tx.lectureRowInstrument.createMany({ data: b.links.map((x) => ({ lectureRowId: x.lectureRowId, instrumentId: x.instrumentId })), skipDuplicates: true });
    for (const p of b.papers) await tx.paperDistributionItem.update({ where: { id: p.id }, data: { lectureRowId: p.lectureRowId } }).catch(() => null);
    await t.topicMeta.deleteMany({ where: { lectureRowId: { in: b.rows.map((r) => r.id).concat("none") } } }).catch(() => null);
    if (b.meta.length) await t.topicMeta.createMany({ data: b.meta.map((m: Record<string, unknown>) => ({ ...m, updatedAt: date(m.updatedAt) })), skipDuplicates: true }).catch(() => null);
  }, { timeout: 60000, maxWait: 15000 });
  await import("./lectureWeights").then((m) => m.recomputeCourseRows(courseId, "SE")).catch(() => null);
  await import("./contentSync").then((m) => m.syncCourseContentToLinkedCourses(courseId)).catch(() => null);
}

/** Undo a load: the plan goes back to how it was just before. A later load must be undone first. */
export async function undo(user: Who, loadId: string) {
  const l = await db.officialContentLoad.findUnique({ where: { id: loadId } });
  if (!l || l.status !== "APPLIED") throw new Error("Only an applied load can be restored.");
  const later = await db.officialContentLoad.findFirst({ where: { courseId: l.courseId, status: "APPLIED", createdAt: { gt: l.createdAt } } });
  if (later) throw new Error("A later load was applied after this one — restore that one first.");
  await restore(loadId);
  await db.officialContentLoad.update({ where: { id: loadId }, data: { status: "UNDONE", undoneAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "OFFICIAL_CONTENT_RESTORED", entityType: "Course", entityId: l.courseId, metadata: { kind: l.kind } });
  return { restored: true };
}

/** Master courses retired as duplicates (hidden from pickers). */
export async function retiredMasterIds(): Promise<string[]> {
  return ((await db.masterCourseRetired?.findMany({ select: { masterCourseId: true } }).catch(() => [])) || []).map((r: { masterCourseId: string }) => r.masterCourseId);
}

/**
 * The system-generated duplicates of a master course (IDS-D01 for GE116): retired (hidden from pickers, kept in the
 * history, never deleted), and every course adopted from them re-pointed to the official course; in this institute,
 * those without results join the base course's sync group so they show the same plan.
 */
export async function retireDuplicates(user: Who, chairmanId: string, keepMasterId: string, baseCourseId: string) {
  const keep = await prisma.masterCourse.findUniqueOrThrow({ where: { id: keepMasterId }, select: { id: true, code: true, title: true } });
  const dups = await prisma.masterCourse.findMany({ where: { OR: DUPLICATE_CODES.map((c) => ({ code: { equals: c, mode: "insensitive" as const } })), id: { not: keep.id } }, select: { id: true, code: true, title: true } });
  const out = { retired: [] as string[], repointed: 0, linked: 0, withResults: [] as string[] };
  for (const d of dups.filter((x) => /discrete/i.test(x.title) || /discrete/i.test(keep.title) === false)) {
    await db.masterCourseRetired.upsert({ where: { masterCourseId: d.id }, create: { masterCourseId: d.id, replacedById: keep.id, reason: `System-generated duplicate of ${keep.code} ${keep.title}`, byUserId: user.id }, update: { replacedById: keep.id } });
    out.retired.push(d.code);
    const courses = await prisma.course.findMany({ where: { masterCourseId: d.id }, select: { id: true, code: true, coordinator: { select: { managedById: true } } } });
    if (courses.length) out.repointed += (await prisma.course.updateMany({ where: { id: { in: courses.map((c) => c.id) } }, data: { masterCourseId: keep.id } })).count;
    const { linkAsFollowerOfSource } = await import("./contentSync");
    for (const c of courses.filter((x) => x.coordinator.managedById === chairmanId && x.id !== baseCourseId)) {
      const marks = await prisma.studentMark.count({ where: { instrument: { courseId: c.id } } });
      if (marks) { out.withResults.push(c.code); continue; }
      const member = await prisma.courseContentSyncMember.findUnique({ where: { courseId: c.id } });
      if (member) continue;
      await linkAsFollowerOfSource(baseCourseId, c.id, chairmanId).catch(() => null);
      out.linked++;
    }
    await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_RETIRED", entityType: "MasterCourse", entityId: d.id, metadata: { code: d.code, replacedBy: keep.code } });
  }
  if (out.linked) await import("./contentSync").then((m) => m.syncCourseContentToLinkedCourses(baseCourseId)).catch(() => null);
  return out;
}

export async function loadsOf(chairmanId: string) {
  const rows = ((await db.officialContentLoad?.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" }, take: 30 }).catch(() => [])) || []) as { id: string; courseId: string; kind: Kind; status: string; summary: string; sourceLabel: string; createdAt: Date; contentJson: string }[];
  const cs = new Map((await prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId).concat("none") } }, select: { id: true, code: true, title: true, templateStatus: true } })).map((c) => [c.id, c]));
  return rows.map((r) => ({ id: r.id, courseId: r.courseId, kind: r.kind, status: r.status, summary: r.summary, source: r.sourceLabel, at: r.createdAt, course: cs.get(r.courseId) ? `${cs.get(r.courseId)!.code} ${cs.get(r.courseId)!.title}` : "", approved: cs.get(r.courseId)?.templateStatus === "approved", missing: (JSON.parse(r.contentJson || "{}").missing || []) as string[] }));
}
