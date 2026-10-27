import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { timetableActor, READ_ONLY } from "../../../../../lib/timetableAccess";
import { writeAuditLog } from "../../../../../lib/audit";
import { getOrCreateVisitingFaculty } from "../../../../../lib/departments";
import { ensureBatchSections, getMaxSection, planSections, sectionKey, STUDENT_SECTIONS_HINT, type PlanCourse, type PlanGroup, type StudentSection } from "../../../../../lib/studentSections";

// Makes the timetable sections of EVERY offered course and combined group of every batch on this timetable (the whole
// department, or the shared timetable): one section per student section (a batch over the limit — default 50 — is split
// into Section A, B, … shared by all its courses); combined groups packed into classes of at most the limit. Existing
// sections are kept where they still match (so a generated timetable stays valid), adopted when they were made before
// student sections existed, and retired (never deleted) when they no longer fit. Sections without a teacher are created
// for "Visiting Faculty (to be decided)" and listed as to be assigned — nothing is dropped silently.
const db = prisma as unknown as Record<string, any>;

export async function POST() {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });
  const { user, scope, chairmanId } = actor;
  const max = await getMaxSection(chairmanId, scope.key);

  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: scope.coordinatorIds.concat("none") } }, select: { id: true, degreeProgram: true, batchName: true } });
  const batchIds = batches.map((b) => b.id);
  const label = new Map(batches.map((b) => [b.id, `${b.degreeProgram} ${b.batchName}`]));
  const courses = await prisma.course.findMany({
    where: { batchId: { in: batchIds.concat("none") }, isOffered: true },
    include: { sectionAssignments: { orderBy: { createdAt: "asc" } }, equivalenceMember: true },
  });
  const groupIds = Array.from(new Set(courses.map((c) => c.equivalenceMember?.groupId).filter((x): x is string => !!x)));
  const groups = await prisma.courseEquivalenceGroup.findMany({ where: { id: { in: groupIds.concat("none") } }, include: { sectionAssignments: { orderBy: { createdAt: "asc" } } } });

  const sectionsByBatch = new Map<string, StudentSection[]>();
  try {
    for (const b of new Set(courses.map((c) => c.batchId).filter((x): x is string => !!x))) sectionsByBatch.set(b, await ensureBatchSections(b, max));
  } catch { return NextResponse.json({ error: STUDENT_SECTIONS_HINT }, { status: 500 }); }

  const planCourses: PlanCourse[] = courses.filter((c) => c.batchId).map((c) => ({
    id: c.id, code: c.code, batchId: c.batchId!, batchLabel: label.get(c.batchId!) || "", courseType: c.courseType, isNonCredit: c.isNonCredit, contactHours: c.contactHours,
    instructorId: c.instructorId, assignments: c.sectionAssignments.map((a) => ({ instructorId: a.instructorId, sectionCount: a.sectionCount })), groupId: c.equivalenceMember?.groupId || null,
  }));
  const planGroups: PlanGroup[] = groups.map((g) => ({ id: g.id, name: g.name, assignments: g.sectionAssignments.map((a) => ({ instructorId: a.instructorId, sectionCount: a.sectionCount })) }));
  const plan = planSections(planCourses, planGroups, sectionsByBatch, max);

  // ------------------------------------------------------------------ reconcile with what exists
  try { await db.scheduleSectionCover.count({ where: { scheduleSectionId: "none" } }); } catch { return NextResponse.json({ error: STUDENT_SECTIONS_HINT }, { status: 500 }); }
  const existing = await prisma.scheduleSection.findMany({ where: { OR: [{ courseId: { in: courses.map((c) => c.id).concat("none") } }, { groupId: { in: groupIds.concat("none") } }] }, orderBy: [{ sectionLabel: "asc" }, { createdAt: "asc" }] });
  const coverRows = ((await db.scheduleSectionCover.findMany({ where: { scheduleSectionId: { in: existing.map((e) => e.id).concat("none") } } })) as { scheduleSectionId: string; batchId: string; label: string; size: number }[]);
  const retiredRows = new Set(((await db.scheduleSectionRetired.findMany({ where: { scheduleSectionId: { in: existing.map((e) => e.id).concat("none") } } })) as { scheduleSectionId: string }[]).map((r) => r.scheduleSectionId));
  const coverKey = (cs: { batchId: string; label: string }[]) => cs.map((c) => sectionKey(c.batchId, c.label)).sort().join(",");
  const keyOf = new Map(existing.map((e) => [e.id, coverKey(coverRows.filter((r) => r.scheduleSectionId === e.id))]));
  const free = new Set(existing.filter((e) => !retiredRows.has(e.id)).map((e) => e.id));
  const owner = (x: { courseId: string | null; groupId: string | null }) => x.courseId || x.groupId;
  const ty = (t: string) => (t === "LAB" ? "LAB" : "LECTURE");
  let placeholder: string | null = null;
  const tba = async () => (placeholder ||= (await getOrCreateVisitingFaculty(chairmanId)).id);
  let created = 0, kept = 0, adopted = 0;

  for (const d of plan.sections) {
    const want = coverKey(d.covers);
    const same = (e: (typeof existing)[number]) => free.has(e.id) && owner(e) === (d.courseId || d.groupId) && ty(e.roomTypeNeeded) === ty(d.roomType);
    let match = existing.find((e) => same(e) && keyOf.get(e.id) === want);
    let how: "kept" | "adopted" | "created" = "kept";
    // A section made before student sections existed (no covers): adopt the one with the same label, else any of the course.
    if (!match) { match = existing.find((e) => same(e) && !keyOf.get(e.id) && e.sectionLabel === d.label) || existing.find((e) => same(e) && !keyOf.get(e.id)); how = "adopted"; }
    if (match) {
      free.delete(match.id);
      const data: Record<string, unknown> = {};
      if (match.sectionLabel !== d.label) data.sectionLabel = d.label;
      if (d.instructorId && match.instructorId !== d.instructorId) data.instructorId = d.instructorId;
      if (Object.keys(data).length) await prisma.scheduleSection.update({ where: { id: match.id }, data });
      if (how === "adopted") {
        await db.scheduleSectionCover.deleteMany({ where: { scheduleSectionId: match.id } });
        await db.scheduleSectionCover.createMany({ data: d.covers.map((c) => ({ scheduleSectionId: match!.id, ...c })) });
        adopted++;
      } else {
        // sizes follow the student sections
        for (const c of d.covers) await db.scheduleSectionCover.updateMany({ where: { scheduleSectionId: match.id, batchId: c.batchId, label: c.label }, data: { size: c.size } });
        kept++;
      }
      continue;
    }
    const s = await prisma.scheduleSection.create({
      data: { courseId: d.courseId, groupId: d.groupId, instructorId: d.instructorId || (await tba()), sectionLabel: d.label, roomTypeNeeded: d.roomType, sessionsPerWeek: d.sessionsPerWeek, sessionDurationMinutes: d.durationMinutes },
    });
    await db.scheduleSectionCover.createMany({ data: d.covers.map((c) => ({ scheduleSectionId: s.id, ...c })) });
    created++;
  }
  // Whatever is left no longer matches the student sections (e.g. a combined class now over the limit): retired, not
  // deleted, so earlier timetables keep their entries.
  const leftover = existing.filter((e) => free.has(e.id));
  for (const e of leftover) await db.scheduleSectionRetired.upsert({ where: { scheduleSectionId: e.id }, create: { scheduleSectionId: e.id, note: `replaced by auto-generate (sections of at most ${max})` }, update: {} });

  await writeAuditLog({ actorUserId: user.id, action: "TIMETABLE_SECTIONS_GENERATED", entityType: "TimetableScope", entityId: scope.key, metadata: { created, kept, adopted, retired: leftover.length, max } }).catch(() => null);
  const split = Array.from(sectionsByBatch.entries()).filter(([, s]) => s.length > 1).map(([b, s]) => `${label.get(b)}: ${s.map((x) => `${x.label} ${x.size}`).join(" · ")}`);
  return NextResponse.json({
    created, kept, adopted, retired: leftover.length, max,
    toAssign: plan.toAssign, extraUnits: plan.extraUnits, groupNotes: plan.groupNotes.filter((g) => g.note), splitBatches: split,
    // older screens read this list: the sections still waiting for a teacher
    skippedNoInstructor: plan.toAssign.map((t) => ({ code: t, title: "to be assigned" })),
  });
}
