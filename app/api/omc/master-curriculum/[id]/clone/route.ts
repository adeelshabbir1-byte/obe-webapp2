import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

// Clones a curriculum — the official shared one, or another chairman's
// own copy — into a NEW copy owned by this chairman, freely editable
// from then on without ever touching the original others rely on too.
// Copies everything a course actually carries: seed CLOs, seed topics,
// and HEC's own PLO suggestions (keyed by code, so they only carry over
// correctly when this clone's courses keep the same codes as the
// source).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const source = await prisma.masterCurriculum.findUnique({
    where: { id: params.id },
    include: { courses: { include: { seedClos: true, seedTopics: true } }, plos: true },
  });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const newVersion = body.newVersion?.trim() || `${source.version} (your copy)`;

  const clone = await prisma.masterCurriculum.create({
    data: {
      authority: source.authority, title: source.title, version: newVersion, status: "PUBLISHED",
      sourceReference: source.sourceReference, chairmanId: user.managedById,
    },
  });

  if (source.plos.length > 0) {
    await prisma.masterPLO.createMany({
      data: source.plos.map((p) => ({ masterCurriculumId: clone.id, number: p.number, title: p.title, description: p.description })),
    });
  }

  const hecCodes = source.courses.map((c) => c.code);
  const suggestions = hecCodes.length > 0 ? await prisma.hecPloSuggestion.findMany({ where: { courseCode: { in: hecCodes } } }) : [];
  const suggestionsByCode = new Map<string, number[]>();
  for (const s of suggestions) suggestionsByCode.set(s.courseCode, [...(suggestionsByCode.get(s.courseCode) || []), s.ploNumber]);

  let coursesCloned = 0, closCloned = 0, ploSuggestionsCloned = 0;
  for (const mc of source.courses) {
    const newCourse = await prisma.masterCourse.create({
      data: {
        masterCurriculumId: clone.id, code: mc.code, title: mc.title, creditHours: mc.creditHours,
        category: mc.category, semesterNumber: mc.semesterNumber, textbook: mc.textbook,
        catalogDescription: mc.catalogDescription, referenceMaterial: mc.referenceMaterial,
      },
    });
    coursesCloned++;

    if (mc.seedClos.length > 0) {
      await prisma.masterCourseClo.createMany({
        data: mc.seedClos.map((clo) => ({ masterCourseId: newCourse.id, statement: clo.statement, bloomLevel: clo.bloomLevel, orderIndex: clo.orderIndex })),
      });
      closCloned += mc.seedClos.length;
    }
    if (mc.seedTopics.length > 0) {
      await prisma.masterCourseTopic.createMany({
        data: mc.seedTopics.map((t) => ({ masterCourseId: newCourse.id, lectureNumber: t.lectureNumber, topic: t.topic, subtopic: t.subtopic })),
      });
    }
    // Same course CODE carries the same HEC suggestions forward — this
    // is why editing a clone's PLO suggestions doesn't disturb the
    // source's own (different MasterCourse, but sharing the code, which
    // is what HecPloSuggestion is actually keyed by).
    const ploNumbers = suggestionsByCode.get(mc.code);
    if (ploNumbers) ploSuggestionsCloned += ploNumbers.length;
  }

  await writeAuditLog({ actorUserId: user.id, action: "MASTER_CURRICULUM_CLONED_FOR_CHAIRMAN", entityType: "MasterCurriculum", entityId: clone.id, metadata: { sourceId: source.id, coursesCloned, closCloned } });

  return NextResponse.json({ curriculum: clone, coursesCloned, closCloned, ploSuggestionsCarriedForward: ploSuggestionsCloned });
}
