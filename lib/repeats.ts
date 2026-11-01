import { prisma } from "./db";

// Failed and weak courses of a student (Adeel prompt §21.1–2): F must be repeated, D can be improved (W / I shown too),
// and for each, where it can be retaken: the same course code offered now, or next term to another batch (its students'
// semester + 1 = the course's semester), of any program of the institute. The advisor confirms; an out-of-batch request
// is raised when registration opens (the existing Out-of-Batch Requests).
export type Repeat = { code: string; title: string; grade: string; term: string; kind: "MUST" | "IMPROVE" | "OTHER"; options: { courseId: string; label: string; when: "now" | "next" }[] };
const kindOf = (g: string): Repeat["kind"] | null => (/^F$/i.test(g) ? "MUST" : /^D\+?$/i.test(g) ? "IMPROVE" : /^(W|I|ABS)$/i.test(g) ? "OTHER" : null);

export async function repeatsOf(studentId: string): Promise<Repeat[]> {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true, batch: { select: { coordinator: { select: { managedById: true } } } } } });
  if (!st) return [];
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { studentId }, orderBy: [{ termYear: "desc" }], select: { courseCode: true, courseTitle: true, grade: true, termName: true, termYear: true } });
  // The latest attempt of each course decides.
  const latest = new Map<string, (typeof recs)[number]>();
  for (const r of recs) if (!latest.has(r.courseCode.trim().toUpperCase())) latest.set(r.courseCode.trim().toUpperCase(), r);
  const out: Repeat[] = [];
  for (const r of Array.from(latest.values())) {
    const kind = kindOf(r.grade.trim());
    if (!kind) continue;
    const copies = await prisma.course.findMany({ where: { code: { equals: r.courseCode.trim(), mode: "insensitive" }, coordinator: { managedById: st.batch.coordinator.managedById }, NOT: { batchId: st.batchId } }, select: { id: true, isOffered: true, semesterNumber: true, batch: { select: { degreeProgram: true, batchName: true, students: { take: 1, where: { status: "ACTIVE" }, select: { currentSemesterNumber: true } } } } }, take: 20 });
    const options: Repeat["options"] = [];
    for (const c of copies) {
      const sem = c.batch?.students[0]?.currentSemesterNumber ?? null;
      const label = `with ${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""} (semester ${c.semesterNumber ?? "?"})`.trim();
      if (c.isOffered) options.push({ courseId: c.id, label, when: "now" });
      else if (sem != null && c.semesterNumber === sem + 1) options.push({ courseId: c.id, label, when: "next" });
    }
    out.push({ code: r.courseCode, title: r.courseTitle, grade: r.grade, term: `${r.termName} ${r.termYear}`, kind, options: options.slice(0, 3) });
  }
  return out.sort((a, b) => (a.kind === "MUST" ? 0 : 1) - (b.kind === "MUST" ? 0 : 1));
}
