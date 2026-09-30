import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { renumberPaperDistribution } from "../../../../../../../lib/paperDistributionOrdering";

// Instructor counterpart to the SE version — builds this exam's paper
// distribution list from whatever the Instructor has already linked on
// their own Assessments tab (Midterm/Final Q# -> topics), instead of
// re-entering the same topic/CLO/marks here by hand. REPLACES the
// exam's current item list, same as the SE version.
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const examType = body.examType;
  if (examType !== "Midterm" && examType !== "Final") {
    return NextResponse.json({ error: "examType must be Midterm or Final" }, { status: 400 });
  }

  const instruments = await prisma.assessmentInstrument.findMany({
    where: { courseId: course.id, source: "INSTRUCTOR", type: examType },
  });
  if (instruments.length === 0) {
    return NextResponse.json({ error: `No ${examType} questions are defined yet on the Instruments tab — add some there first.` }, { status: 400 });
  }
  instruments.sort((a, b) => (parseInt(a.label, 10) || 0) - (parseInt(b.label, 10) || 0));

  const links = await prisma.lectureRowInstrument.findMany({
    where: { instrumentId: { in: instruments.map((i) => i.id) } },
    include: { lectureRow: true },
  });
  const rowsByInstrument = new Map<string, typeof links[number]["lectureRow"][]>();
  for (const l of links) {
    if (l.lectureRow.source !== "INSTRUCTOR") continue;
    const arr = rowsByInstrument.get(l.instrumentId) || [];
    arr.push(l.lectureRow);
    rowsByInstrument.set(l.instrumentId, arr);
  }

  await prisma.paperDistributionItem.deleteMany({ where: { courseId: course.id, source: "INSTRUCTOR", examType } });

  let orderIndex = 0;
  for (const inst of instruments) {
    const rows = rowsByInstrument.get(inst.id) || [];
    const topicText = rows.map((r) => r.topic).filter((t) => t.trim().length > 0).join("; ");
    const distinctCloIds = new Set(rows.map((r) => r.cloId).filter((id): id is string => !!id));
    const distinctLevels = new Set(rows.map((r) => r.bloomLevel).filter((lv): lv is string => !!lv));
    await prisma.paperDistributionItem.create({
      data: {
        courseId: course.id, source: "INSTRUCTOR", examType,
        questionNo: orderIndex + 1, orderIndex,
        lectureRowId: rows.length === 1 ? rows[0].id : null,
        topicText: topicText || "(not yet linked to a topic on the Assessments tab)",
        cloId: distinctCloIds.size === 1 ? Array.from(distinctCloIds)[0] : null,
        cognitiveLevel: distinctLevels.size === 1 ? Array.from(distinctLevels)[0] : null,
        marks: inst.marksPct,
      },
    });
    orderIndex++;
  }

  await renumberPaperDistribution(course.id, "INSTRUCTOR", examType);

  const items = await prisma.paperDistributionItem.findMany({ where: { courseId: course.id, source: "INSTRUCTOR", examType }, orderBy: { orderIndex: "asc" } });
  return NextResponse.json({ items });
}
