import { prisma } from "./db";

// "Carry lab marks forward" (Adeel prompt §31.5, Controller setting lab.carryForward): a student repeating a combined
// course whose lab part he passed before keeps his old lab marks; only the theory is repeated. Copies the latest earlier
// lab course with the same code where his lab total was at or above the lab pass mark (the course's lab pass %, else 50).
export async function carryCandidates(labCourseId: string) {
  const lab = await prisma.course.findUnique({ where: { id: labCourseId }, select: { id: true, code: true, coordinator: { select: { managedById: true } } } });
  if (!lab) return { on: false, rows: [] as { studentId: string; name: string; fromCourseId: string; pct: number }[] };
  const cid = lab.coordinator?.managedById || "";
  const on = await import("./scopedSettings").then(async (m) => (await m.allStored(cid)).find((r) => r.key === "lab.carryForward" && r.scopeType === "INSTITUTE")?.value === "1").catch(() => false);
  if (!on) return { on, rows: [] };
  const pass = await import("./cloMethods").then((m) => m.courseSettings(labCourseId)).then((s) => s.labPassPct || 50).catch(() => 50);
  const en = await prisma.studentEnrollment.findMany({ where: { courseId: labCourseId, status: { not: "WITHDRAWN" } }, select: { studentId: true, student: { select: { name: true } } } });
  const have = new Set((await prisma.labMark.groupBy({ by: ["studentId"], where: { courseId: labCourseId } })).map((x) => x.studentId));
  const need = en.filter((e) => !have.has(e.studentId));
  const old = need.length ? await prisma.labMark.findMany({ where: { studentId: { in: need.map((e) => e.studentId) }, courseId: { not: labCourseId }, course: { code: { equals: lab.code, mode: "insensitive" } } }, select: { studentId: true, courseId: true, score: true, maxScore: true, updatedAt: true } }) : [];
  const rows: { studentId: string; name: string; fromCourseId: string; pct: number }[] = [];
  for (const e of need) {
    const by = new Map<string, { s: number; m: number; at: number }>();
    for (const o of old.filter((x) => x.studentId === e.studentId)) { const b = by.get(o.courseId) || { s: 0, m: 0, at: 0 }; b.s += o.score; b.m += o.maxScore; b.at = Math.max(b.at, o.updatedAt.getTime()); by.set(o.courseId, b); }
    const best = Array.from(by.entries()).filter(([, b]) => b.m && (100 * b.s) / b.m >= pass).sort((a, b) => b[1].at - a[1].at)[0];
    if (best) rows.push({ studentId: e.studentId, name: e.student.name, fromCourseId: best[0], pct: Math.round((100 * best[1].s) / best[1].m) });
  }
  return { on, rows };
}
export async function carryForward(labCourseId: string, byId: string) {
  const { on, rows } = await carryCandidates(labCourseId);
  if (!on) throw new Error("The Controller hasn't turned on “carry lab marks forward”.");
  for (const r of rows) {
    const marks = await prisma.labMark.findMany({ where: { courseId: r.fromCourseId, studentId: r.studentId } });
    for (const m of marks) await prisma.labMark.upsert({ where: { courseId_studentId_labNumber: { courseId: labCourseId, studentId: r.studentId, labNumber: m.labNumber } }, create: { courseId: labCourseId, studentId: r.studentId, labNumber: m.labNumber, score: m.score, maxScore: m.maxScore, enteredById: byId, levelsJson: m.levelsJson }, update: {} });
  }
  await (await import("./audit")).writeAuditLog({ actorUserId: byId, action: "LAB_MARKS_CARRIED", entityType: "Course", entityId: labCourseId, metadata: { students: rows.length } }).catch(() => null);
  return rows.length;
}
