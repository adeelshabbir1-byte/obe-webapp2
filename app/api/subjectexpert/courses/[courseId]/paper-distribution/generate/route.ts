import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";
import { renumberPaperDistribution } from "../../../../../../../lib/paperDistributionOrdering";
import { writeAuditLog } from "../../../../../../../lib/audit";

// Builds (or rebuilds) this exam's paper-distribution list straight from
// what's already been set up on the Assessments & Submit tab — SE already
// told the system "Midterm Q1 tests these topics" there (via the
// Midterm/Final Q# columns on the "Which Lectures Does Each Instrument
// Test?" grid), and having to re-pick the same topic/CLO/marks by hand
// again here was pure duplicate data entry. One Midterm/Final instrument
// becomes one paper-distribution question: its marksPct becomes the
// question's marks, and whichever lecture row(s) are linked to it supply
// the topic text, CLO, and cognitive level — matching the label SE
// already gave that question ("Midterm Q1" -> this course's question #1).
//
// This REPLACES the exam's current item list rather than merging into
// it, same "Generate" semantics as the 32-lecture template — so any
// cognitive-level tweaks or manual topic edits made after a previous
// generate are reset. The page warns about this before calling it.
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const examType = body.examType;
  if (examType !== "Midterm" && examType !== "Final") {
    return NextResponse.json({ error: "examType must be Midterm or Final" }, { status: 400 });
  }

  const instruments = await prisma.assessmentInstrument.findMany({
    where: { courseId: course.id, source: "SE", type: examType },
  });
  if (instruments.length === 0) {
    return NextResponse.json({ error: `No ${examType} questions are defined yet on the Assessments & Submit tab — add some there first.` }, { status: 400 });
  }
  instruments.sort((a, b) => (parseInt(a.label, 10) || 0) - (parseInt(b.label, 10) || 0));

  const links = await prisma.lectureRowInstrument.findMany({
    where: { instrumentId: { in: instruments.map((i) => i.id) } },
    include: { lectureRow: true },
  });
  const rowsByInstrument = new Map<string, typeof links[number]["lectureRow"][]>();
  for (const l of links) {
    if (l.lectureRow.source !== "SE") continue;
    const arr = rowsByInstrument.get(l.instrumentId) || [];
    arr.push(l.lectureRow);
    rowsByInstrument.set(l.instrumentId, arr);
  }

  // Cognitive level: the topic's own level if set; otherwise its CLO's level. A question covering several topics takes the highest level.
  const closForBloom = await prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" }, select: { id: true, bloomLevel: true } });
  const cloBloom = new Map<string, string>(closForBloom.map((c: { id: string; bloomLevel: string }) => [c.id, c.bloomLevel]));
  const levelNo = (lv: string) => parseInt(lv.replace(/\D/g, ""), 10) || 0;

  // Replace this exam's current list entirely.
  await prisma.paperDistributionItem.deleteMany({ where: { courseId: course.id, source: "SE", examType } });

  let orderIndex = 0;
  for (const inst of instruments) {
    const rows = rowsByInstrument.get(inst.id) || [];
    // Show the subtopic (what the question is really about); fall back to the topic when no subtopic is set.
    const topicText = Array.from(new Set(rows.map((r) => (r.subtopic || "").trim() || r.topic.trim()).filter((t) => t.length > 0))).join("; ");
    // CLO: the one most of the question's topics belong to (first one wins a tie).
    const cloCount = new Map<string, number>();
    for (const r of rows) if (r.cloId) cloCount.set(r.cloId, (cloCount.get(r.cloId) || 0) + 1);
    let mainClo: string | null = null;
    cloCount.forEach((n, id) => { if (mainClo === null || n > (cloCount.get(mainClo) || 0)) mainClo = id; });
    const levels = rows.map((r) => r.bloomLevel || (r.cloId ? cloBloom.get(r.cloId) : null)).filter((lv): lv is string => !!lv);
    const topLevel = levels.length ? levels.reduce((a, b) => (levelNo(b) > levelNo(a) ? b : a)) : null;
    await prisma.paperDistributionItem.create({
      data: {
        courseId: course.id, source: "SE", examType,
        questionNo: orderIndex + 1, orderIndex,
        lectureRowId: rows.length === 1 ? rows[0].id : null,
        topicText: topicText || "(not yet linked to a topic on the Assessments tab)",
        cloId: mainClo,
        cognitiveLevel: topLevel,
        marks: inst.marksPct,
      },
    });
    orderIndex++;
  }

  await renumberPaperDistribution(course.id, "SE", examType);
  await writeAuditLog({
    actorUserId: user.id, action: "PAPER_DISTRIBUTION_GENERATED", entityType: "Course", entityId: course.id,
    metadata: { examType, questionCount: instruments.length },
  });
  await syncCourseContentToLinkedCourses(course.id);

  const items = await prisma.paperDistributionItem.findMany({ where: { courseId: course.id, source: "SE", examType }, orderBy: { orderIndex: "asc" } });
  return NextResponse.json({ items });
}
