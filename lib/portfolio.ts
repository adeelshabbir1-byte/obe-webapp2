import { prisma } from "./db";
import { uploadEvidenceFile } from "./evidenceValidation";
import { directClos } from "./directClo";

export const pdb = prisma as unknown as Record<string, any>;
export const LEVELS: [string, string][] = [["HIGH", "Best"], ["MEDIUM", "Average"], ["LOW", "Weakest"]];
export const KINDS: [string, string][] = [["PROJECT", "Project"], ["CERTIFICATE", "Certificate / course"], ["INTERNSHIP", "Internship"], ["COMPETITION", "Competition / hackathon"], ["PUBLICATION", "Publication"], ["COMMUNITY", "Community service"], ["OTHER", "Other"]];
export const MAX_FILE = 8 * 1024 * 1024;

/** Store an uploaded file in Supabase Storage; if storage is not configured, keep small files inline. */
export async function storeFile(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  try { return await uploadEvidenceFile(buf, file.name, file.type || "application/octet-stream"); }
  catch (e) {
    if (buf.length > 2 * 1024 * 1024) throw new Error("File storage is not set up; files over 2 MB cannot be kept.");
    return `data:${file.type || "application/octet-stream"};base64,${buf.toString("base64")}`;
  }
}

/** Each assessment of a course with the CLOs it measures, its scored students and the suggested best / average / weakest. */
export async function courseSampling(courseId: string) {
  const [insts, marks, links, direct, clos, enr] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR" }, orderBy: [{ type: "asc" }, { label: "asc" }] }),
    prisma.studentMark.findMany({ where: { courseId }, select: { studentId: true, instrumentId: true, score: true } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId } }, select: { instrumentId: true, lectureRow: { select: { cloId: true } } } }),
    directClos(courseId),
    prisma.cLO.findMany({ where: { courseId }, select: { id: true, code: true } }),
    prisma.studentEnrollment.findMany({ where: { courseId }, select: { student: { select: { id: true, name: true, rollNumber: true } } } }),
  ]);
  const code = new Map(clos.map((c) => [c.id, c.code]));
  const stu = new Map(enr.map((e) => [e.student.id, e.student]));
  const samples = ((await pdb.studentWorkSample.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }).catch(() => null)) as { id: string; instrumentId: string; studentId: string; level: string; score: number | null; fileName: string; fileUrl: string }[] | null);
  const items = insts.filter((i) => i.marksPct > 0).map((i) => {
    const cl = new Set<string>();
    for (const l of links) if (l.instrumentId === i.id && l.lectureRow.cloId) cl.add(code.get(l.lectureRow.cloId) || "");
    const d = direct.get(i.id); if (d) cl.add(code.get(d) || "");
    const scored = marks.filter((m) => m.instrumentId === i.id && stu.has(m.studentId)).sort((a, b) => b.score - a.score);
    const pick = (idx: number) => (scored[idx] ? { ...stu.get(scored[idx].studentId)!, score: scored[idx].score } : null);
    return { id: i.id, label: i.label, type: i.type, maxScore: i.maxScore, clos: Array.from(cl).filter(Boolean).sort(), scored: scored.length,
      suggest: { HIGH: pick(0), MEDIUM: pick(Math.floor(scored.length / 2)), LOW: pick(scored.length - 1) },
      samples: (samples || []).filter((s) => s.instrumentId === i.id).map((s) => ({ ...s, student: stu.get(s.studentId) })) };
  });
  return { items, ready: samples !== null, students: Array.from(stu.values()).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber)) };
}
