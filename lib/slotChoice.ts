import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { LIST_TYPES } from "./autoCopyPreviousBatch";
import { seedFromMasterCourseIfAvailable } from "./benchmarkCopy";
import { deleteCourseCompletely } from "./deleteCourseCompletely";
import * as uc from "./universityCurriculum";
import { batchCurriculumId, curriculumPools, isPlaceholderTitle, type Flavour } from "./listCourses";
import { randomUUID } from "crypto";

// A Program Lead chooses which Elective / IDS list options a batch takes: each chosen option fills one slot of the batch
// (the slot keeps its slot type, so it counts once, with its credit hours). The choice is recorded (who, when, what the
// slot was before) so it can be changed until the course has students.

const db = prisma as unknown as Record<string, any>;
const IDS_RE = /\bids\b|interdisciplin/i;
export type SlotOption = { id: string; code: string; title: string; ch: number; tracks: string[]; clos: number; lectures: number };
export type SlotGroup = { flavour: Flavour; cap: number; slots: { id: string; code: string; title: string; semester: number | null; chosen: string | null; open: boolean; locked: boolean }[]; options: SlotOption[] };

const slotType = (fl: Flavour) => (fl === "IDS" ? "IDS" : "Elective");
const isSlotOf = (fl: Flavour, type: string | null) => !LIST_TYPES.includes(type || "") && (fl === "IDS" ? IDS_RE.test(type || "") : /elective/i.test(type || ""));

async function slotsOf(batchId: string, fl: Flavour, poolIds: Set<string>, flavourOf: Map<string, Flavour>) {
  const cs = await prisma.course.findMany({ where: { batchId }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, courseType: true, semesterNumber: true, masterCourseId: true, _count: { select: { studentEnrollments: true, studentMarks: true } } } });
  return cs.filter((c) => !LIST_TYPES.includes(c.courseType || "") && ((c.masterCourseId && poolIds.has(c.masterCourseId) ? flavourOf.get(c.masterCourseId) === fl : isSlotOf(fl, c.courseType))))
    .map((c) => ({ id: c.id, code: c.code, title: c.title, semester: c.semesterNumber, chosen: c.masterCourseId && poolIds.has(c.masterCourseId) ? c.masterCourseId : null, open: !c.masterCourseId || isPlaceholderTitle(c.title), locked: c._count.studentEnrollments > 0 || c._count.studentMarks > 0 }));
}

/** The pick-from-the-list groups of a batch (one per flavour that has options). */
export async function slotChooser(batchId: string): Promise<SlotGroup[]> {
  const curId = await batchCurriculumId(batchId);
  if (!curId) return [];
  const pool = (await curriculumPools([curId])).get(curId);
  if (!pool || !pool.ids.size) return [];
  const ms = await prisma.masterCourse.findMany({ where: { id: { in: Array.from(pool.ids) } }, select: { id: true, code: true, title: true, creditHours: true, _count: { select: { seedClos: true, seedTopics: true } } }, orderBy: [{ title: "asc" }] });
  const tracks = ((await db.curriculumTrack.findMany({ where: { curriculumId: curId }, orderBy: { position: "asc" } }).catch(() => [])) as { id: string; name: string }[]);
  const links = ((await db.masterCourseTrack.findMany({ where: { trackId: { in: tracks.map((t) => t.id).concat("none") } } }).catch(() => [])) as { masterCourseId: string; trackId: string }[]);
  const out: SlotGroup[] = [];
  for (const fl of ["IDS", "Elective"] as Flavour[]) {
    const options = ms.filter((m) => pool.flavour.get(m.id) === fl).map((m) => ({ id: m.id, code: m.code, title: m.title, ch: m.creditHours, tracks: links.filter((l) => l.masterCourseId === m.id).map((l) => tracks.find((t) => t.id === l.trackId)?.name || "").filter(Boolean), clos: m._count.seedClos, lectures: m._count.seedTopics }));
    if (!options.length) continue;
    const slots = await slotsOf(batchId, fl, pool.ids, pool.flavour);
    out.push({ flavour: fl, cap: pool.slots[fl] || slots.length, slots, options });
  }
  return out;
}

async function clearPlan(courseId: string) {
  if (await prisma.studentMark.count({ where: { courseId } })) return false;
  await prisma.$transaction([
    prisma.paperDistributionItem.deleteMany({ where: { courseId, source: "SE" } }),
    prisma.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId, source: "SE" } } }),
    prisma.lectureRow.deleteMany({ where: { courseId, source: "SE" } }),
    prisma.assessmentInstrument.deleteMany({ where: { courseId, source: "SE" } }),
    prisma.cLO.deleteMany({ where: { courseId, source: "SE" } }),
    prisma.coursePloMapping.deleteMany({ where: { courseId } }),
  ]).catch(() => null);
  return true;
}

async function seed(courseId: string, masterCourseId: string, byId: string) {
  if (await prisma.cLO.count({ where: { courseId } })) return;
  if (!(await uc.seedFromUniversityPlan(courseId, masterCourseId, byId).catch(() => false))) await seedFromMasterCourseIfAvailable(courseId, masterCourseId).catch(() => null);
}

/** Set the options a batch takes for one flavour's slots (the full chosen set). */
export async function chooseSlots(user: { id: string; name: string }, batchId: string, fl: Flavour, masterIds: string[]) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, coordinatorId: true, degreeProgram: true } });
  if (!batch) throw new Error("Batch not found.");
  const curId = await batchCurriculumId(batchId);
  const pool = curId ? (await curriculumPools([curId])).get(curId) : null;
  if (!pool) throw new Error("This batch has no curriculum with an elective / IDS list.");
  const want = Array.from(new Set(masterIds)).filter((id) => pool.ids.has(id) && pool.flavour.get(id) === fl);
  if (want.length !== new Set(masterIds).size) throw new Error(`Only courses of the curriculum's ${fl} list can be chosen.`);
  const cap = pool.slots[fl];
  if (cap && want.length > cap) throw new Error(`The curriculum has ${cap} ${fl} slot(s) — choose at most ${cap}.`);
  const slots = await slotsOf(batchId, fl, pool.ids, pool.flavour);
  const kept = new Set(slots.filter((s) => s.chosen && want.includes(s.chosen)).map((s) => s.chosen!));
  const lockedOut = slots.filter((s) => s.chosen && !want.includes(s.chosen) && s.locked);
  if (lockedOut.length) throw new Error(`${lockedOut.map((s) => s.title).join(", ")} already has students or marks and can't be changed here.`);
  let n = slots.filter((s) => s.chosen || s.open).length;
  // Free the slots whose choice was dropped: back to the placeholder they were.
  const free: typeof slots = slots.filter((s) => !s.chosen && s.open && !s.locked);
  for (const s of slots.filter((x) => x.chosen && !want.includes(x.chosen))) {
    const rec = (await db.batchSlotChoice.findUnique({ where: { courseId: s.id } }).catch(() => null)) as { oldCode: string; oldTitle: string; oldCh: number } | null;
    await clearPlan(s.id);
    await prisma.course.update({ where: { id: s.id }, data: { code: rec?.oldCode || `${slotType(fl).toUpperCase()}-${s.semester || "X"}${s.id.slice(-3)}`, title: rec?.oldTitle || `${slotType(fl)} ${free.length + 1}`, ...(rec ? { creditHours: rec.oldCh } : {}), masterCourseId: null } });
    await db.batchSlotChoice.delete({ where: { courseId: s.id } }).catch(() => null);
    free.push({ ...s, chosen: null, open: true });
  }
  free.sort((a, b) => (a.semester ?? 99) - (b.semester ?? 99));
  const picks = want.filter((id) => !kept.has(id));
  const ms = await prisma.masterCourse.findMany({ where: { id: { in: picks.concat("none") } } });
  const codes = new Set((await prisma.course.findMany({ where: { batchId }, select: { code: true } })).map((c) => c.code));
  let created = 0, filled = 0;
  for (const id of picks) {
    const m = ms.find((x) => x.id === id)!;
    let slot = free.shift();
    if (!slot) {
      // Older imports have no slot placeholders: make the slot, in the semester the curriculum places that slot.
      const ph = pool.placeholders[fl][n] || pool.placeholders[fl][pool.placeholders[fl].length - 1];
      const c = await prisma.course.create({ data: { code: `${slotType(fl).toUpperCase()}-${n + 1}-${randomUUID().slice(0, 4)}`, title: `${slotType(fl)} ${n + 1}`, creditHours: ph?.ch || m.creditHours, courseType: slotType(fl), semesterNumber: ph?.semester ?? null, coordinatorId: batch.coordinatorId, batchId } });
      slot = { id: c.id, code: c.code, title: c.title, semester: c.semesterNumber, chosen: null, open: true, locked: false };
      created++; n++;
    }
    const before = await prisma.course.findUnique({ where: { id: slot.id }, select: { code: true, title: true, creditHours: true, courseType: true, semesterNumber: true } });
    // The batch may still hold this option as a list course (with its Subject Expert's work): that course becomes the slot.
    const asList = await prisma.course.findFirst({ where: { batchId, masterCourseId: id, courseType: { in: LIST_TYPES } }, select: { id: true } });
    let target = slot.id;
    if (asList) {
      await prisma.course.update({ where: { id: asList.id }, data: { courseType: before?.courseType && !LIST_TYPES.includes(before.courseType) ? before.courseType : slotType(fl), semesterNumber: before?.semesterNumber ?? null } });
      if (!slot.locked) await deleteCourseCompletely(slot.id).catch(() => null);
      target = asList.id;
    } else {
      let code = m.code; codes.delete(before?.code || ""); if (codes.has(code)) code = `${m.code}-E`; codes.add(code);
      await clearPlan(slot.id);
      await prisma.course.update({ where: { id: slot.id }, data: { code, title: m.title, creditHours: m.creditHours, textbook: m.textbook, catalogDescription: m.catalogDescription, referenceMaterial: m.referenceMaterial, masterCourseId: m.id } });
      await seed(slot.id, m.id, user.id);
      await uc.assignDefaultSubjectExpert(slot.id, user.id).catch(() => null);
    }
    await db.batchSlotChoice.upsert({ where: { courseId: target }, create: { courseId: target, batchId, flavour: fl, masterCourseId: m.id, oldCode: before?.code || "", oldTitle: before?.title || "", oldCh: before?.creditHours || 0, byId: user.id, byName: user.name }, update: { masterCourseId: m.id, byId: user.id, byName: user.name, at: new Date() } });
    filled++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "BATCH_SLOTS_CHOSEN", entityType: "Batch", entityId: batchId, metadata: { flavour: fl, chosen: want.join(","), filled, created } });
  return `${want.length} ${fl} course(s) chosen${filled ? ` · ${filled} slot(s) filled` : ""}${created ? ` (${created} slot(s) added)` : ""}.`;
}

/** Who chose each filled slot of a batch, and when. */
export async function slotChoicesOf(batchId: string) {
  return ((await db.batchSlotChoice.findMany({ where: { batchId } }).catch(() => [])) as { courseId: string; masterCourseId: string; byName: string; at: Date }[]);
}
