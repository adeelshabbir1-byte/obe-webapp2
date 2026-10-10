import { prisma } from "./db";
import { coordinatorIdsFor } from "./reportScope";
import { ensureCoursePloMapping } from "./coursePloSync";
import { syncCourseContentToLinkedCourses } from "./contentSync";

// Pushes an institute's own master curriculum (its edited copy) down into the real courses of its batches:
// CLOs (statement, Bloom level, PLO by number), contribution % (shared equally per PLO), the course-to-PLO matrix,
// and - only where the course has none yet - the lecture topics, textbook, description and reference material.
//
// Existing CLOs are updated in place by position (CLO-1 <- the master's 1st CLO, ...), so lecture topics that point
// at a CLO keep pointing at it. Extra CLOs the master doesn't have are removed only if nothing uses them.

const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };

export type PlanRow = { courseId: string; code: string; title: string; batch: string; action: "fill" | "update" | "skip"; reason?: string; masterClos: number; courseClos: number };

async function ownedCurriculum(user: Who, curriculumId: string) {
  if (user.role !== "OMC" && user.role !== "CHAIRMAN") return null;
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  const c = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId } });
  return c && c.chairmanId === chairmanId ? c : null;
}

/** Which real courses this curriculum feeds, each paired with the master course of the same code. */
async function matchCourses(user: Who, curriculumId: string) {
  const cur = await ownedCurriculum(user, curriculumId);
  if (!cur) return null;
  // Courses adopted from the official copy (or a sibling program copy of the same grand curriculum) still count as this curriculum's.
  const lineage = new Set<string>([cur.id]);
  if (cur.parentCurriculumId) {
    lineage.add(cur.parentCurriculumId);
    const siblings = await prisma.masterCurriculum.findMany({ where: { parentCurriculumId: cur.parentCurriculumId }, select: { id: true } });
    siblings.forEach((s) => lineage.add(s.id));
  }
  const masterCourses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: cur.id }, select: { id: true, code: true } });
  const masterByCode = new Map(masterCourses.map((m) => [normCode(m.code), m.id]));
  const coordinatorIds = await coordinatorIdsFor(user);
  const program = (cur.degreeProgram || cur.title || "").trim().toLowerCase();
  const courses = await prisma.course.findMany({
    where: {
      coordinatorId: { in: coordinatorIds.length ? coordinatorIds : ["none"] }, batchId: { not: null },
      OR: [{ masterCourse: { masterCurriculumId: { in: Array.from(lineage) } } }, ...(program ? [{ batch: { degreeProgram: { equals: program, mode: "insensitive" as const } } }] : [])],
    },
    select: { id: true, code: true, title: true, templateStatus: true, masterCourse: { select: { code: true } }, batch: { select: { degreeProgram: true, batchName: true } } },
    orderBy: [{ batchId: "asc" }, { code: "asc" }],
  });
  return courses
    .map((c) => ({ course: c, masterCourseId: masterByCode.get(normCode(c.masterCourse?.code || c.code)) || masterByCode.get(normCode(c.code)) || null }))
    .filter((x) => !!x.masterCourseId) as { course: (typeof courses)[number]; masterCourseId: string }[];
}

export async function planMasterPush(user: Who, curriculumId: string, onlyIds?: string[]): Promise<PlanRow[] | null> {
  const all = await matchCourses(user, curriculumId);
  if (!all) return null;
  const matched = onlyIds ? all.filter((m) => onlyIds.includes(m.course.id)) : all;
  const ids = matched.map((m) => m.course.id);
  const [cloCounts, masterCloCounts, marks] = await Promise.all([
    prisma.cLO.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "SE" }, _count: { _all: true } }),
    prisma.masterCourseClo.groupBy({ by: ["masterCourseId"], where: { masterCourseId: { in: matched.map((m) => m.masterCourseId) } }, _count: { _all: true } }),
    prisma.studentMark.groupBy({ by: ["courseId"], where: { courseId: { in: ids } }, _count: { _all: true } }),
  ]);
  // Courses that follow a base course, in one query rather than one per course.
  const followers = new Set((await prisma.courseContentSyncMember.findMany({ where: { courseId: { in: ids.length ? ids : ["none"] }, isBase: false }, select: { courseId: true } })).map((m) => m.courseId));
  const rows: PlanRow[] = [];
  for (const { course, masterCourseId } of matched) {
    const courseClos = cloCounts.find((x) => x.courseId === course.id)?._count._all || 0;
    const masterClos = masterCloCounts.find((x) => x.masterCourseId === masterCourseId)?._count._all || 0;
    const base = { courseId: course.id, code: course.code, title: course.title, batch: course.batch ? `${course.batch.degreeProgram} — ${course.batch.batchName}` : "—", masterClos, courseClos };
    let reason = "";
    if (masterClos === 0) reason = "the master course has no CLOs";
    else if (course.templateStatus === "approved") reason = "approved by the OMC and locked";
    else if ((marks.find((x) => x.courseId === course.id)?._count._all || 0) > 0) reason = "students already have marks in it";
    else if (followers.has(course.id)) reason = "follows a base course (updated through it)";
    rows.push(reason ? { ...base, action: "skip", reason } : { ...base, action: courseClos === 0 ? "fill" : "update" });
  }
  return rows;
}

function equalWhole(n: number) {
  const base = Math.floor(100 / n), rest = 100 - base * n;
  return Array.from({ length: n }, (_, i) => base + (i >= n - rest ? 1 : 0));
}

/** Applies the push to the given courses (call in small groups). Re-checks every rule per course. */
export async function applyMasterPush(user: Who, curriculumId: string, courseIds: string[]) {
  const matched = await matchCourses(user, curriculumId);
  if (!matched) return null;
  const plan = (await planMasterPush(user, curriculumId, courseIds))!;
  const out = { courses: 0, closAdded: 0, closUpdated: 0, closRemoved: 0, closKept: 0, topicsFilled: 0, mappingsAdded: 0 };
  for (const id of courseIds) {
    const row = plan.find((p) => p.courseId === id);
    const m = matched.find((x) => x.course.id === id);
    if (!row || !m || row.action === "skip") continue;
    const course = await prisma.course.findUnique({ where: { id }, select: { id: true, batchId: true, textbook: true, catalogDescription: true, referenceMaterial: true } });
    if (!course?.batchId) continue;
    const [master, mClos, mTopics, plos, existing] = await Promise.all([
      prisma.masterCourse.findUnique({ where: { id: m.masterCourseId } }),
      prisma.masterCourseClo.findMany({ where: { masterCourseId: m.masterCourseId }, orderBy: { orderIndex: "asc" }, include: { mappedPlo: { select: { number: true } } } }),
      prisma.masterCourseTopic.findMany({ where: { masterCourseId: m.masterCourseId }, orderBy: { lectureNumber: "asc" } }),
      prisma.pLO.findMany({ where: { batchId: course.batchId }, select: { id: true, number: true } }),
      prisma.cLO.findMany({ where: { courseId: id, source: "SE" }, orderBy: { orderIndex: "asc" } }),
    ]);
    const ploByNumber = new Map(plos.map((p) => [p.number, p.id]));
    // Equal share per PLO inside this course.
    const perPlo = new Map<string, number>();
    mClos.forEach((c) => { const p = c.mappedPlo ? ploByNumber.get(c.mappedPlo.number) : undefined; if (p) perPlo.set(p, (perPlo.get(p) || 0) + 1); });
    const shares = new Map(Array.from(perPlo.entries()).map(([p, n]) => [p, equalWhole(n)]));
    const used = new Map<string, number>();

    for (let i = 0; i < mClos.length; i++) {
      const mc = mClos[i];
      const ploId = mc.mappedPlo ? ploByNumber.get(mc.mappedPlo.number) || null : null;
      let pct: number | null = null;
      if (ploId) { const k = used.get(ploId) || 0; pct = shares.get(ploId)![k]; used.set(ploId, k + 1); }
      const data = { statement: mc.statement, bloomLevel: mc.bloomLevel, mappedPloId: ploId, ploMappingSource: ploId ? "MANUAL" : null, ploContributionPct: pct };
      if (existing[i]) { await prisma.cLO.update({ where: { id: existing[i].id }, data }); out.closUpdated++; }
      else { await prisma.cLO.create({ data: { courseId: id, source: "SE", code: `CLO-${i + 1}`, orderIndex: i, ...data } }); out.closAdded++; }
    }
    for (const extra of existing.slice(mClos.length)) {
      const inUse = await prisma.lectureRow.count({ where: { cloId: extra.id } });
      if (inUse > 0) { out.closKept++; continue; }
      await prisma.paperDistributionItem.updateMany({ where: { cloId: extra.id }, data: { cloId: null } });
      await prisma.cLO.delete({ where: { id: extra.id } });
      out.closRemoved++;
    }

    // Lecture topics only where the course has none written yet.
    const rows = await prisma.lectureRow.findMany({ where: { courseId: id, source: "SE" }, select: { id: true, lectureNumber: true, topic: true } });
    if (mTopics.length > 0 && rows.every((r) => !r.topic.trim())) {
      const byLecture = new Map(mTopics.map((t) => [t.lectureNumber, t]));
      if (rows.length === 0) {
        await prisma.lectureRow.createMany({ data: Array.from({ length: 32 }, (_, k) => ({ courseId: id, source: "SE", lectureNumber: k + 1, week: Math.ceil((k + 1) / 2), topic: byLecture.get(k + 1)?.topic || "", subtopic: byLecture.get(k + 1)?.subtopic || null, cloId: null, bloomLevel: null, weightPct: 0 })) });
      } else {
        for (const r of rows) { const t = byLecture.get(r.lectureNumber); if (t) await prisma.lectureRow.update({ where: { id: r.id }, data: { topic: t.topic, subtopic: t.subtopic || null } }); }
      }
      out.topicsFilled++;
    }
    if (master) {
      await prisma.course.update({ where: { id }, data: {
        textbook: course.textbook || master.textbook, catalogDescription: course.catalogDescription || master.catalogDescription, referenceMaterial: course.referenceMaterial || master.referenceMaterial,
      } });
    }
    for (const p of Array.from(perPlo.keys())) {
      const had = await prisma.coursePloMapping.findUnique({ where: { courseId_ploId: { courseId: id, ploId: p } } });
      if (!had) { await ensureCoursePloMapping(id, p, user.id, "MANUAL"); out.mappingsAdded++; }
    }
    await syncCourseContentToLinkedCourses(id).catch(() => {});
    out.courses++;
  }
  return out;
}
