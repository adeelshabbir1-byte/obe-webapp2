import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { recomputeAffectedRows } from "../../../../../../../lib/lectureWeights";

// Instructor counterpart to the SE lecture-mapping batch-save route —
// same "apply everything, recompute once" shape, for the same reason
// (the Assessments screen's mapping grid now saves in one batch instead
// of one request per tick). This side has no Content Sync propagation
// to worry about (Instructor rows are this section's own delivery copy,
// never shared across batches), so it's simpler than the SE version,
// but batching still avoids firing a pile of parallel requests for one
// Save click.
type TogglePayload = { lectureRowId: string; instrumentId: string; linked: boolean };
type QuestionsPayload = { lectureRowId: string; type: "Midterm" | "Final"; numbers: string };

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const toggles: TogglePayload[] = Array.isArray(body.toggles) ? body.toggles : [];
  const questions: QuestionsPayload[] = Array.isArray(body.questions) ? body.questions : [];
  if (toggles.length === 0 && questions.length === 0) return NextResponse.json({ rows: [] });

  const rowIds = new Set([...toggles.map((t) => t.lectureRowId), ...questions.map((q) => q.lectureRowId)]);
  const instrumentIds = new Set(toggles.map((t) => t.instrumentId));
  const [validRows, validInstruments] = await Promise.all([
    prisma.lectureRow.findMany({ where: { id: { in: Array.from(rowIds) }, courseId: course.id, source: "INSTRUCTOR" } }),
    prisma.assessmentInstrument.findMany({ where: { id: { in: Array.from(instrumentIds) }, courseId: course.id, source: "INSTRUCTOR" } }),
  ]);
  const validRowIds = new Set(validRows.map((r) => r.id));
  const validInstrumentIds = new Set(validInstruments.map((i) => i.id));
  const safeToggles = toggles.filter((t) => validRowIds.has(t.lectureRowId) && validInstrumentIds.has(t.instrumentId));
  const safeQuestions = questions.filter((q) => validRowIds.has(q.lectureRowId) && (q.type === "Midterm" || q.type === "Final"));

  const touchedInstrumentIds = new Set<string>(safeToggles.map((t) => t.instrumentId));

  for (const t of safeToggles) {
    if (t.linked) {
      await prisma.lectureRowInstrument.upsert({
        where: { lectureRowId_instrumentId: { lectureRowId: t.lectureRowId, instrumentId: t.instrumentId } },
        create: { lectureRowId: t.lectureRowId, instrumentId: t.instrumentId },
        update: {},
      });
    } else {
      await prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: t.lectureRowId, instrumentId: t.instrumentId } });
    }
  }

  if (safeQuestions.length > 0) {
    const allNumbered = await prisma.assessmentInstrument.findMany({
      where: { courseId: course.id, source: "INSTRUCTOR", type: { in: ["Midterm", "Final"] } },
    });
    const byTypeLabel = new Map(allNumbered.map((i) => [`${i.type}:${i.label}`, i]));
    const badLabels: string[] = [];

    for (const q of safeQuestions) {
      const numbers = (q.numbers || "").split(",").map((n) => n.trim()).filter((n) => n.length > 0);
      const resolved = numbers.map((n) => byTypeLabel.get(`${q.type}:${n}`));
      const missing = numbers.filter((n, idx) => !resolved[idx]);
      if (missing.length > 0) { badLabels.push(...missing.map((n) => `${q.type} ${n}`)); continue; }

      const existingLinksOfType = await prisma.lectureRowInstrument.findMany({
        where: { lectureRowId: q.lectureRowId, instrument: { type: q.type, source: "INSTRUCTOR" } },
      });
      for (const l of existingLinksOfType) touchedInstrumentIds.add(l.instrumentId);
      await prisma.lectureRowInstrument.deleteMany({ where: { id: { in: existingLinksOfType.map((l) => l.id) } } });

      for (const inst of resolved) {
        if (!inst) continue;
        touchedInstrumentIds.add(inst.id);
        await prisma.lectureRowInstrument.create({ data: { lectureRowId: q.lectureRowId, instrumentId: inst.id } });
      }
    }
    if (badLabels.length > 0) {
      return NextResponse.json({ error: `Question(s) not defined yet: ${badLabels.join(", ")} — add them on the Instruments tab first` }, { status: 400 });
    }
  }

  await recomputeAffectedRows(Array.from(touchedInstrumentIds));

  const allRows = await prisma.lectureRow.findMany({
    where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" },
    include: { instrumentLinks: { include: { instrument: true } } },
  });
  return NextResponse.json({
    rows: allRows.map((r) => ({
      id: r.id, weightPct: r.weightPct,
      linkedInstrumentIds: r.instrumentLinks.map((l) => l.instrumentId),
      midtermQuestions: r.instrumentLinks.filter((l) => l.instrument.type === "Midterm").map((l) => l.instrument.label).join(", "),
      finalQuestions: r.instrumentLinks.filter((l) => l.instrument.type === "Final").map((l) => l.instrument.label).join(", "),
    })),
  });
}
