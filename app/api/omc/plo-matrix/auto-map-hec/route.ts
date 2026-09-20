import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const [courses, plos] = await Promise.all([
    prisma.course.findMany({ where: { batchId: batch.id }, include: { masterCourse: { select: { code: true } } } }),
    prisma.pLO.findMany({ where: { batchId: batch.id } }),
  ]);
  const ploByNumber = new Map(plos.map((p) => [p.number, p]));

  // Prefer the course's explicitly-linked MasterCourse's own code over
  // the course's own code string — HEC suggestions are keyed by HEC's
  // code convention, which often doesn't match what actually got
  // imported as this course's local code.
  const lookupCode = (c: (typeof courses)[number]) => c.masterCourse?.code || c.code;
  const codes = Array.from(new Set(courses.map(lookupCode)));
  const suggestions = await prisma.hecPloSuggestion.findMany({ where: { courseCode: { in: codes } } });
  const suggestionsByCode = new Map<string, number[]>();
  for (const s of suggestions) suggestionsByCode.set(s.courseCode, [...(suggestionsByCode.get(s.courseCode) || []), s.ploNumber]);

  let created = 0, skippedNoPlo = 0, skippedNoSuggestion = 0, alreadyMapped = 0;

  for (const course of courses) {
    const ploNumbers = suggestionsByCode.get(lookupCode(course));
    if (!ploNumbers) { skippedNoSuggestion++; continue; }

    for (const num of ploNumbers) {
      const plo = ploByNumber.get(num);
      if (!plo) { skippedNoPlo++; continue; }

      const existing = await prisma.coursePloMapping.findUnique({ where: { courseId_ploId: { courseId: course.id, ploId: plo.id } } });
      if (existing) { alreadyMapped++; continue; }

      await prisma.coursePloMapping.create({ data: { courseId: course.id, ploId: plo.id, assignedById: user.id } });
      created++;
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "PLO_MAPPING_AUTO_MAPPED_HEC", entityType: "Batch", entityId: batch.id, metadata: { created, alreadyMapped, skippedNoPlo, skippedNoSuggestion } });

  return NextResponse.json({ created, alreadyMapped, skippedNoPlo, skippedNoSuggestion });
}
