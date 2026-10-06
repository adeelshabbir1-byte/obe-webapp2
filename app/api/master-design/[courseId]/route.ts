import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

const BLOOM = ["C1", "C2", "C3", "C4", "C5", "C6"];

async function ownedMasterCourse(userId: string, role: string, isPlatformExpert: boolean, id: string) {
  if (role !== "SUBJECT_EXPERT" || !isPlatformExpert) return null;
  const c = await prisma.masterCourse.findUnique({ where: { id }, include: { masterCurriculum: true } });
  if (!c || c.designerId !== userId || c.masterCurriculum.chairmanId !== null) return null;
  return c;
}

export async function GET(_req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = user && await ownedMasterCourse(user.id, user.role, user.isPlatformExpert, params.courseId);
  if (!course) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [clos, topics, plos] = await Promise.all([
    prisma.masterCourseClo.findMany({ where: { masterCourseId: course.id }, orderBy: { orderIndex: "asc" } }),
    prisma.masterCourseTopic.findMany({ where: { masterCourseId: course.id }, orderBy: { lectureNumber: "asc" } }),
    prisma.masterPLO.findMany({ where: { masterCurriculumId: course.masterCurriculumId }, orderBy: { number: "asc" } }),
  ]);
  return NextResponse.json({ course: { id: course.id, code: course.code, title: course.title, catalogDescription: course.catalogDescription, textbook: course.textbook, referenceMaterial: course.referenceMaterial }, clos, topics, plos });
}

// Saves the whole design in one go: description/books, CLOs and the lecture topics (replaced as a set).
export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = user && await ownedMasterCourse(user.id, user.role, user.isPlatformExpert, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();

  const clos: { statement: string; bloomLevel: string; mappedPloId: string | null }[] = Array.isArray(body.clos) ? body.clos : [];
  const topics: { lectureNumber: number; topic: string; subtopic: string | null }[] = Array.isArray(body.topics) ? body.topics : [];
  const plos = await prisma.masterPLO.findMany({ where: { masterCurriculumId: course.masterCurriculumId }, select: { id: true } });
  const ploIds = new Set(plos.map((p) => p.id));

  const cleanClos = clos.map((c) => ({ statement: String(c.statement || "").trim(), bloomLevel: BLOOM.includes(c.bloomLevel) ? c.bloomLevel : "C2", mappedPloId: c.mappedPloId && ploIds.has(c.mappedPloId) ? c.mappedPloId : null })).filter((c) => c.statement);
  const seen = new Set<number>();
  const cleanTopics = topics.map((t) => ({ lectureNumber: Math.trunc(Number(t.lectureNumber)), topic: String(t.topic || "").trim(), subtopic: t.subtopic ? String(t.subtopic).trim() : null }))
    .filter((t) => t.topic && t.lectureNumber >= 1 && t.lectureNumber <= 32 && !seen.has(t.lectureNumber) && (seen.add(t.lectureNumber), true));

  await prisma.$transaction([
    prisma.masterCourse.update({ where: { id: course.id }, data: {
      catalogDescription: body.catalogDescription ? String(body.catalogDescription) : null,
      textbook: body.textbook ? String(body.textbook) : null,
      referenceMaterial: body.referenceMaterial ? String(body.referenceMaterial) : null,
    } }),
    prisma.masterCourseClo.deleteMany({ where: { masterCourseId: course.id } }),
    prisma.masterCourseTopic.deleteMany({ where: { masterCourseId: course.id } }),
    prisma.masterCourseClo.createMany({ data: cleanClos.map((c, i) => ({ masterCourseId: course.id, statement: c.statement, bloomLevel: c.bloomLevel, orderIndex: i, mappedPloId: c.mappedPloId, ploMappingSource: c.mappedPloId ? "MANUAL" : null })) }),
    prisma.masterCourseTopic.createMany({ data: cleanTopics.map((t) => ({ masterCourseId: course.id, lectureNumber: t.lectureNumber, topic: t.topic, subtopic: t.subtopic })) }),
  ]);
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_DESIGNED", entityType: "MasterCourse", entityId: course.id, metadata: { clos: cleanClos.length, topics: cleanTopics.length } });
  return NextResponse.json({ ok: true, clos: cleanClos.length, topics: cleanTopics.length });
}
