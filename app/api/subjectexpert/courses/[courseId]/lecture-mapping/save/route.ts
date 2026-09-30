import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { recomputeAffectedRows, recomputeRows } from "../../../../../../../lib/lectureWeights";

// Batched version of instrument-toggle + set-questions. The per-click
// versions of those two routes each finish by re-syncing this course's
// FULL content out to every linked follower course in its Content Sync
// group — an intentionally heavy, multi-table operation. That's fine
// for one edit, but the "Save Mapping Changes" button on the Assessments
// screen can carry dozens of individual tick/question changes at once,
// and firing all of them as separate parallel requests meant dozens of
// full content-syncs running concurrently — which is what made a save
// take "ages", and (since those parallel requests could race each
// other, each recomputing weights from its own stale read) is also the
// likely cause of weights coming out wrong. This route applies every
// change in the batch first, recomputes weight exactly once, and syncs
// to linked courses exactly once, at the very end.
type TogglePayload = { lectureRowId: string; instrumentId: string; linked: boolean };
type QuestionsPayload = { lectureRowId: string; type: "Midterm" | "Final"; numbers: string };

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const body = await req.json();
  const toggles: TogglePayload[] = Array.isArray(body.toggles) ? body.toggles : [];
  const questions: QuestionsPayload[] = Array.isArray(body.questions) ? body.questions : [];
  if (toggles.length === 0 && questions.length === 0) return NextResponse.json({ rows: [] });

  // Validate every row/instrument referenced actually belongs to this
  // course (and to SE) up front, in bulk, instead of once per item.
  const rowIds = new Set([...toggles.map((t) => t.lectureRowId), ...questions.map((q) => q.lectureRowId)]);
  const instrumentIds = new Set(toggles.map((t) => t.instrumentId));
  const [validRows, validInstruments] = await Promise.all([
    prisma.lectureRow.findMany({ where: { id: { in: Array.from(rowIds) }, courseId: course.id, source: "SE" } }),
    prisma.assessmentInstrument.findMany({ where: { id: { in: Array.from(instrumentIds) }, courseId: course.id, source: "SE" } }),
  ]);
  const validRowIds = new Set(validRows.map((r) => r.id));
  const validInstrumentIds = new Set(validInstruments.map((i) => i.id));
  const safeToggles = toggles.filter((t) => validRowIds.has(t.lectureRowId) && validInstrumentIds.has(t.instrumentId));
  const safeQuestions = questions.filter((q) => validRowIds.has(q.lectureRowId) && (q.type === "Midterm" || q.type === "Final"));

  const touchedInstrumentIds = new Set<string>(safeToggles.map((t) => t.instrumentId));
  // Every row a toggle or a question-number edit actually touches — used
  // below to force a weight recompute on each one directly, so a row that
  // just got UNCHECKED (or had its Q# cleared) is recomputed down to 0
  // instead of keeping its old weight (see recomputeRows' doc comment).
  const touchedRowIds = new Set<string>([...safeToggles.map((t) => t.lectureRowId), ...safeQuestions.map((q) => q.lectureRowId)]);

  // Apply every toggle first.
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

  // Then every question-number change — same "replace this row's links
  // of this type" logic as the single-row route, validating labels
  // against this course's own Midterm/Final instruments.
  if (safeQuestions.length > 0) {
    const allNumbered = await prisma.assessmentInstrument.findMany({
      where: { courseId: course.id, source: "SE", type: { in: ["Midterm", "Final"] } },
    });
    const byTypeLabel = new Map(allNumbered.map((i) => [`${i.type}:${i.label}`, i]));
    const badLabels: string[] = [];

    for (const q of safeQuestions) {
      const numbers = (q.numbers || "").split(",").map((n) => n.trim()).filter((n) => n.length > 0);
      const resolved = numbers.map((n) => byTypeLabel.get(`${q.type}:${n}`));
      const missing = numbers.filter((n, idx) => !resolved[idx]);
      if (missing.length > 0) { badLabels.push(...missing.map((n) => `${q.type} ${n}`)); continue; }

      const existingLinksOfType = await prisma.lectureRowInstrument.findMany({
        where: { lectureRowId: q.lectureRowId, instrument: { type: q.type, source: "SE" } },
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
      return NextResponse.json({ error: `Question(s) not defined yet: ${badLabels.join(", ")} — add them on the Quizzes/Assignments/Exams tab first` }, { status: 400 });
    }
  }

  await recomputeAffectedRows(Array.from(touchedInstrumentIds));
  await recomputeRows(Array.from(touchedRowIds));
  await writeAuditLog({
    actorUserId: user.id, action: "LECTURE_MAPPING_SAVED", entityType: "Course", entityId: course.id,
    metadata: { toggleCount: safeToggles.length, questionRowCount: safeQuestions.length },
  });
  await syncCourseContentToLinkedCourses(course.id);

  const allRows = await prisma.lectureRow.findMany({
    where: { courseId: course.id, source: "SE" }, orderBy: { lectureNumber: "asc" },
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
