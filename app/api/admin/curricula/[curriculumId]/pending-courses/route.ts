import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

// Bulk-stages newly-fetched/researched courses for Super User review,
// rather than writing them straight into the curriculum. Each entry:
// { title, source, category?, domain?, suggestedCode?, clos: [{ statement, bloomLevel }] }
export async function POST(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curriculum = await prisma.masterCurriculum.findUnique({ where: { id: params.curriculumId } });
  if (!curriculum) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const entries = body.courses;
  if (!Array.isArray(entries) || entries.length === 0) return NextResponse.json({ error: "courses must be a non-empty array" }, { status: 400 });

  let created = 0;
  for (const entry of entries) {
    if (!entry.title?.trim() || !entry.source?.trim()) continue;
    const pending = await prisma.pendingMasterCourse.create({
      data: {
        masterCurriculumId: curriculum.id, title: entry.title.trim(), source: entry.source.trim(),
        category: entry.category || null, domain: entry.domain || null, suggestedCode: entry.suggestedCode || null,
      },
    });
    const clos = Array.isArray(entry.clos) ? entry.clos : [];
    for (let i = 0; i < clos.length; i++) {
      const clo = clos[i];
      if (!clo.statement?.trim()) continue;
      await prisma.pendingMasterCourseClo.create({
        data: { pendingMasterCourseId: pending.id, statement: clo.statement.trim(), bloomLevel: clo.bloomLevel || "C2", orderIndex: i },
      });
    }
    created++;
  }

  return NextResponse.json({ created }, { status: 201 });
}
