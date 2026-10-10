import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { recomputeCourseRows } from "../../../../../../../lib/lectureWeights";

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

export const maxDuration = 60;

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
  const touchedRowIds = new Set<string>([...safeToggles.map((t) => t.lectureRowId), ...safeQuestions.map((q) => q.lectureRowId)]);

  // Bulk apply: one insert for all new ticks, one delete per instrument for all unticks.
  const toAdd = safeToggles.filter((t) => t.linked).map((t) => ({ lectureRowId: t.lectureRowId, instrumentId: t.instrumentId }));
  if (toAdd.length > 0) await prisma.lectureRowInstrument.createMany({ data: toAdd, skipDuplicates: true });
  const removeByInstrument = new Map<string, string[]>();
  for (const t of safeToggles) if (!t.linked) removeByInstrument.set(t.instrumentId, [...(removeByInstrument.get(t.instrumentId) || []), t.lectureRowId]);
  for (const [instrumentId, rows] of Array.from(removeByInstrument.entries())) {
    await prisma.lectureRowInstrument.deleteMany({ where: { instrumentId, lectureRowId: { in: rows } } });
  }

  if (safeQuestions.length > 0) {
    const allNumbered = await prisma.assessmentInstrument.findMany({
      where: { courseId: course.id, source: "INSTRUCTOR", type: { in: ["Midterm", "Final"] } },
    });
    const byTypeLabel = new Map(allNumbered.map((i) => [`${i.type}:${i.label}`, i]));
    const badLabels: string[] = [];
    const creates: { lectureRowId: string; instrumentId: string }[] = [];
    const replaceRows = new Map<string, Set<string>>();

    for (const q of safeQuestions) {
      const numbers = (q.numbers || "").split(",").map((n) => n.trim()).filter((n) => n.length > 0);
      const resolved = numbers.map((n) => byTypeLabel.get(`${q.type}:${n}`));
      const missing = numbers.filter((n, idx) => !resolved[idx]);
      if (missing.length > 0) { badLabels.push(...missing.map((n) => `${q.type} ${n}`)); continue; }
      replaceRows.set(q.type, (replaceRows.get(q.type) || new Set<string>()).add(q.lectureRowId));
      for (const inst of resolved) if (inst) creates.push({ lectureRowId: q.lectureRowId, instrumentId: (inst as { id: string }).id });
    }
    if (badLabels.length > 0) {
      return NextResponse.json({ error: `Question(s) not defined yet: ${badLabels.join(", ")} — add them on the Instruments tab first` }, { status: 400 });
    }
    for (const [type, rowSet] of Array.from(replaceRows.entries())) {
      await prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: Array.from(rowSet) }, instrument: { type, source: "INSTRUCTOR" } } });
    }
    if (creates.length > 0) await prisma.lectureRowInstrument.createMany({ data: creates, skipDuplicates: true });
  }

  await recomputeCourseRows(course.id, "INSTRUCTOR");

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
