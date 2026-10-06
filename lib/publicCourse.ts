import { prisma } from "./db";
import { randomUUID } from "crypto";

export type Plan = "SE" | "INSTRUCTOR";

export type Snapshot = {
  clos: { code: string; statement: string; bloomLevel: string; orderIndex: number; targetPct: number; ploNumber: number | null; ploTitle: string | null; ploContributionPct: number | null }[];
  instruments: { key: number; type: string; label: string; marksPct: number; maxScore: number }[];
  lectureRows: { week: number; lectureNumber: number; topic: string; subtopic: string | null; cloCode: string | null; bloomLevel: string | null; weightPct: number; instrumentKeys: number[] }[];
  paperItems: { examType: string | null; questionNo: number; topicText: string; cognitiveLevel: string | null; marks: number; orderIndex: number; lectureNumber: number | null; cloCode: string | null }[];
  weights: { assignmentPct: number; quizPct: number; projectPct: number; labPct: number; midtermPct: number; finalPct: number };
  textbook: string | null; referenceMaterial: string | null; catalogDescription: string | null;
};

/** Freezes one version of a course's plan (the Subject Expert's, or the Instructor's own) into a portable snapshot. */
export async function buildSnapshot(courseId: string, plan: Plan): Promise<Snapshot | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return null;
  const [clos, lectureRows, instruments, paperItems] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source: plan }, include: { mappedPlo: true }, orderBy: { orderIndex: "asc" } }),
    prisma.lectureRow.findMany({ where: { courseId, source: plan }, include: { instrumentLinks: true }, orderBy: { lectureNumber: "asc" } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source: plan } }),
    prisma.paperDistributionItem.findMany({ where: { courseId, source: plan }, orderBy: { orderIndex: "asc" } }),
  ]);
  const instrumentKey = new Map(instruments.map((i, idx) => [i.id, idx]));
  const cloCode = new Map(clos.map((c) => [c.id, c.code]));
  const lectureNumberById = new Map(lectureRows.map((r) => [r.id, r.lectureNumber]));
  const instructorPlan = plan === "INSTRUCTOR";
  return {
    clos: clos.map((c) => ({ code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, orderIndex: c.orderIndex, targetPct: c.targetPct, ploNumber: c.mappedPlo?.number ?? null, ploTitle: c.mappedPlo?.title ?? null, ploContributionPct: c.ploContributionPct })),
    instruments: instruments.map((i, idx) => ({ key: idx, type: i.type, label: i.label, marksPct: i.marksPct, maxScore: i.maxScore })),
    lectureRows: lectureRows.map((r) => ({
      week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic, cloCode: r.cloId ? cloCode.get(r.cloId) || null : null,
      bloomLevel: r.bloomLevel, weightPct: r.weightPct,
      instrumentKeys: r.instrumentLinks.map((l) => instrumentKey.get(l.instrumentId)).filter((k): k is number => k !== undefined),
    })),
    paperItems: paperItems.map((p) => ({ examType: p.examType, questionNo: p.questionNo, topicText: p.topicText, cognitiveLevel: p.cognitiveLevel, marks: p.marks, orderIndex: p.orderIndex, lectureNumber: p.lectureRowId ? lectureNumberById.get(p.lectureRowId) ?? null : null, cloCode: p.cloId ? cloCode.get(p.cloId) || null : null })),
    weights: instructorPlan
      ? { assignmentPct: course.instructorAssignmentPct ?? course.assignmentPct, quizPct: course.instructorQuizPct ?? course.quizPct, projectPct: course.instructorProjectPct ?? course.projectPct, labPct: course.instructorLabPct ?? course.labPct, midtermPct: course.instructorMidtermPct ?? course.midtermPct, finalPct: course.instructorFinalPct ?? course.finalPct }
      : { assignmentPct: course.assignmentPct, quizPct: course.quizPct, projectPct: course.projectPct, labPct: course.labPct, midtermPct: course.midtermPct, finalPct: course.finalPct },
    textbook: course.textbook, referenceMaterial: course.referenceMaterial, catalogDescription: course.catalogDescription,
  };
}

/** The lower-cased text that search matches against. */
export function buildSearchText(parts: (string | null | undefined)[], snapshot: Snapshot) {
  return [...parts, snapshot.catalogDescription, snapshot.textbook, ...snapshot.clos.map((c) => c.statement), ...snapshot.lectureRows.map((r) => r.topic)]
    .filter((x): x is string => !!x).join(" \n ").toLowerCase().slice(0, 20000);
}

/**
 * Writes a snapshot into one of the importer's own courses as an independent, editable copy.
 * `plan` says which version of the target it fills: "SE" (the Subject Expert's plan) or
 * "INSTRUCTOR" (the instructor's own delivery plan). Replaces that plan's existing content;
 * the caller must already have checked permission and that no marks/attendance exist.
 */
export async function applySnapshot(snapshot: Snapshot, targetCourseId: string, plan: Plan, assignedById: string) {
  const target = await prisma.course.findUnique({ where: { id: targetCourseId } });
  if (!target) return null;

  // Clear this plan's existing content, dependency-ordered.
  await prisma.instrumentEvidence.deleteMany({ where: { instrument: { courseId: targetCourseId, source: plan } } });
  await prisma.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId: targetCourseId, source: plan } } });
  await prisma.paperDistributionItem.deleteMany({ where: { courseId: targetCourseId, source: plan } });
  await prisma.lectureRow.deleteMany({ where: { courseId: targetCourseId, source: plan } });
  await prisma.assessmentInstrument.deleteMany({ where: { courseId: targetCourseId, source: plan } });
  await prisma.cLO.deleteMany({ where: { courseId: targetCourseId, source: plan } });

  // PLOs belong to a batch, so translate by PLO NUMBER into whatever the importer's batch has.
  const numbers = Array.from(new Set(snapshot.clos.map((c) => c.ploNumber).filter((n): n is number => n !== null)));
  const targetPlos = target.batchId && numbers.length > 0 ? await prisma.pLO.findMany({ where: { batchId: target.batchId, number: { in: numbers } } }) : [];
  const ploByNumber = new Map(targetPlos.map((p) => [p.number, p]));

  if (plan === "SE") {
    await prisma.coursePloMapping.deleteMany({ where: { courseId: targetCourseId } });
    if (targetPlos.length > 0) {
      await prisma.coursePloMapping.createMany({ data: targetPlos.map((p) => ({ courseId: targetCourseId, ploId: p.id, assignedById, source: "SYSTEM" })), skipDuplicates: true });
    }
  }

  const instrumentIds = new Map<number, string>();
  for (const i of snapshot.instruments) instrumentIds.set(i.key, randomUUID());
  if (snapshot.instruments.length > 0) {
    await prisma.assessmentInstrument.createMany({ data: snapshot.instruments.map((i) => ({ id: instrumentIds.get(i.key)!, courseId: targetCourseId, source: plan, type: i.type, label: i.label, marksPct: i.marksPct, maxScore: i.maxScore })) });
  }

  const cloIds = new Map<string, string>();
  for (const c of snapshot.clos) cloIds.set(c.code, randomUUID());
  if (snapshot.clos.length > 0) {
    await prisma.cLO.createMany({
      data: snapshot.clos.map((c) => {
        const plo = c.ploNumber !== null ? ploByNumber.get(c.ploNumber) : undefined;
        return {
          id: cloIds.get(c.code)!, courseId: targetCourseId, source: plan, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, orderIndex: c.orderIndex, targetPct: c.targetPct,
          mappedPloId: plo?.id || null, ploContributionPct: plo ? c.ploContributionPct : null, ploMappingSource: plo ? "SYSTEM" : null,
        };
      }),
    });
  }

  const rowIds = new Map<number, string>();
  for (const r of snapshot.lectureRows) rowIds.set(r.lectureNumber, randomUUID());
  if (snapshot.lectureRows.length > 0) {
    await prisma.lectureRow.createMany({
      data: snapshot.lectureRows.map((r) => ({ id: rowIds.get(r.lectureNumber)!, courseId: targetCourseId, source: plan, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic, cloId: r.cloCode ? cloIds.get(r.cloCode) || null : null, bloomLevel: r.bloomLevel, weightPct: r.weightPct })),
    });
    const links = snapshot.lectureRows.flatMap((r) => r.instrumentKeys.map((k) => instrumentIds.get(k)).filter((x): x is string => !!x).map((instrumentId) => ({ lectureRowId: rowIds.get(r.lectureNumber)!, instrumentId })));
    if (links.length > 0) await prisma.lectureRowInstrument.createMany({ data: links });
  }

  if (snapshot.paperItems.length > 0) {
    await prisma.paperDistributionItem.createMany({
      data: snapshot.paperItems.map((p) => ({ courseId: targetCourseId, source: plan, examType: p.examType, questionNo: p.questionNo, topicText: p.topicText, cognitiveLevel: p.cognitiveLevel, marks: p.marks, orderIndex: p.orderIndex, lectureRowId: p.lectureNumber !== null ? rowIds.get(p.lectureNumber) || null : null, cloId: p.cloCode ? cloIds.get(p.cloCode) || null : null })),
    });
  }

  const w = snapshot.weights;
  await prisma.course.update({
    where: { id: targetCourseId },
    data: plan === "SE"
      ? { assignmentPct: w.assignmentPct, quizPct: w.quizPct, projectPct: w.projectPct, labPct: w.labPct, midtermPct: w.midtermPct, finalPct: w.finalPct, textbook: target.textbook ?? snapshot.textbook, referenceMaterial: target.referenceMaterial ?? snapshot.referenceMaterial, catalogDescription: target.catalogDescription ?? snapshot.catalogDescription }
      : { instructorAssignmentPct: w.assignmentPct, instructorQuizPct: w.quizPct, instructorProjectPct: w.projectPct, instructorLabPct: w.labPct, instructorMidtermPct: w.midtermPct, instructorFinalPct: w.finalPct },
  });

  return { cloCount: snapshot.clos.length, lectureRowCount: snapshot.lectureRows.length, instrumentCount: snapshot.instruments.length, paperItemCount: snapshot.paperItems.length, ploMapped: snapshot.clos.filter((c) => c.ploNumber !== null && ploByNumber.has(c.ploNumber)).length, ploUnmapped: snapshot.clos.filter((c) => c.ploNumber !== null && !ploByNumber.has(c.ploNumber)).length };
}

/** The courses this user may publish from or import into, and which plan that touches. */
export async function eligibleCourses(user: { id: string; role: string }) {
  const where = user.role === "SUBJECT_EXPERT" ? { subjectExpertId: user.id } : user.role === "INSTRUCTOR" ? { instructorId: user.id } : user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : null;
  if (!where) return [];
  const courses = await prisma.course.findMany({ where, include: { batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" } });
  const plan: Plan = user.role === "INSTRUCTOR" ? "INSTRUCTOR" : "SE";
  return courses.map((c) => ({ id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType, batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "", plan }));
}
