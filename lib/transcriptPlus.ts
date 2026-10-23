import { prisma } from "./db";
import { academicRules } from "./academicRules";

// Two more views of a student's record:
//  • the PLO transcript — every PLO / GA with each course that assessed it, the student's % in it, and whether the
//    PLO is attained overall (credit-weighted average at or above the pass mark);
//  • the degree audit — the program's requirements by course type against what is passed, in progress, failed and
//    still to take; graduation checks (credits, CGPA, every PLO, deficiency courses); and record checks that catch
//    mistakes in the transcript itself (duplicate entries, grade / points that disagree, credit hours that differ
//    from the curriculum, courses outside the scheme).

const PASS = 50;
const num = (label: string) => Number((/(\d+)/.exec(label) || [])[1] || 0);
const up = (s: string) => s.trim().toUpperCase();

export type PloLine = { number: number; label: string; title: string; courses: { code: string; title: string; term: string; pct: number; passed: boolean; ch: number }[]; avg: number | null; attained: boolean | null };

export async function ploTranscript(studentId: string): Promise<PloLine[]> {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true } });
  const [recs, plos] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, orderBy: [{ termYear: "asc" }, { termName: "desc" }], select: { courseCode: true, courseTitle: true, creditHours: true, termName: true, termYear: true, ploAttainmentJson: true } }),
    st ? prisma.pLO.findMany({ where: { batchId: st.batchId }, orderBy: { number: "asc" }, select: { number: true, title: true } }) : Promise.resolve([]),
  ]);
  const lines = new Map<number, PloLine>();
  for (const p of plos) lines.set(p.number, { number: p.number, label: `PLO-${p.number}`, title: p.title, courses: [], avg: null, attained: null });
  for (const r of recs) {
    let xs: { label: string; pct?: number; passed: boolean }[] = [];
    try { xs = JSON.parse(r.ploAttainmentJson); } catch { xs = []; }
    for (const x of xs) {
      const n = num(x.label);
      const l = lines.get(n) || { number: n, label: x.label, title: "", courses: [], avg: null, attained: null };
      l.label = x.label;
      l.courses.push({ code: r.courseCode, title: r.courseTitle, term: `${r.termName} ${r.termYear}`, pct: typeof x.pct === "number" ? x.pct : x.passed ? 100 : 0, passed: x.passed, ch: r.creditHours || 1 });
      lines.set(n, l);
    }
  }
  for (const l of Array.from(lines.values())) if (l.courses.length) {
    const w = l.courses.reduce((a, c) => a + c.ch, 0);
    l.avg = Math.round((10 * l.courses.reduce((a, c) => a + c.pct * c.ch, 0)) / w) / 10;
    l.attained = l.avg >= PASS;
  }
  return Array.from(lines.values()).sort((a, b) => a.number - b.number);
}

export type AuditGroup = { type: string; required: number; passed: number; inProgress: number; courses: { code: string; title: string; ch: number; semester: number | null; status: "PASSED" | "IN_PROGRESS" | "FAILED" | "TO_TAKE"; grade: string | null }[] };
export type AuditCheck = { label: string; ok: boolean; detail: string };

export async function degreeAudit(studentId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true, currentSemesterNumber: true, batch: { select: { degreeProgram: true, coordinator: { select: { managedById: true } } } } } });
  if (!st) return null;
  const [scheme, recs, enr, scale] = await Promise.all([
    prisma.course.findMany({ where: { batchId: st.batchId, semesterNumber: { not: null } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { code: true, title: true, creditHours: true, courseType: true, semesterNumber: true, isNonCredit: true } }),
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, courseTitle: true, creditHours: true, termName: true, termYear: true, grade: true, gpaPoints: true, courseType: true } }),
    prisma.studentEnrollment.findMany({ where: { studentId, status: { not: "WITHDRAWN" }, course: { isOffered: true } }, select: { course: { select: { code: true } } } }),
    prisma.gradingScale.findMany({ where: { coordinator: { batches: { some: { id: st.batchId } } } }, select: { letter: true, gpaValue: true } }).catch(() => []),
  ]);
  const rules = await academicRules(st.batch.coordinator.managedById);
  const isPass = (r: { grade: string; gpaPoints: number | null }) => (r.grade === "P" || r.grade === "TR" || r.grade === "IT") || (r.gpaPoints !== null && r.gpaPoints > 0);
  const best = new Map<string, (typeof recs)[number]>();
  for (const r of recs) { const k = up(r.courseCode), b = best.get(k); if (!b || (r.gpaPoints ?? -1) > (b.gpaPoints ?? -1)) best.set(k, r); }
  const now = new Set(enr.map((e) => up(e.course.code)));
  const groups = new Map<string, AuditGroup>();
  for (const c of scheme) {
    const t = c.courseType || "Other";
    const g = groups.get(t) || { type: t, required: 0, passed: 0, inProgress: 0, courses: [] };
    const b = best.get(up(c.code));
    const status = b && isPass(b) ? "PASSED" : now.has(up(c.code)) ? "IN_PROGRESS" : b ? "FAILED" : "TO_TAKE";
    g.required += c.creditHours;
    if (status === "PASSED") g.passed += c.creditHours; else if (status === "IN_PROGRESS") g.inProgress += c.creditHours;
    g.courses.push({ code: c.code, title: c.title, ch: c.creditHours, semester: c.semesterNumber, status, grade: b?.grade || null });
    groups.set(t, g);
  }
  const ORDER = ["General Education", "IDS", "Core", "Elective", "Lab", "Capstone Project", "Field Experience"];
  const list = Array.from(groups.values()).sort((a, b) => (ORDER.indexOf(a.type) + 1 || 99) - (ORDER.indexOf(b.type) + 1 || 99));
  const required = list.reduce((a, g) => a + g.required, 0), passed = list.reduce((a, g) => a + g.passed, 0), inProgress = list.reduce((a, g) => a + g.inProgress, 0);
  // CGPA, best attempt.
  let P = 0, C = 0; for (const b of Array.from(best.values())) if (b.gpaPoints !== null) { P += b.gpaPoints * b.creditHours; C += b.creditHours; }
  const cgpa = C ? Math.round((100 * P) / C) / 100 : null;
  const plos = await ploTranscript(studentId);
  const graduation: AuditCheck[] = [
    { label: "Credit hours of the scheme passed", ok: passed >= required && required > 0, detail: `${passed} of ${required} passed${inProgress ? `, ${inProgress} in progress` : ""} — ${Math.max(0, required - passed - inProgress)} still to take` },
    { label: `CGPA at least ${rules.probationCgpa.toFixed(2)}`, ok: cgpa !== null && cgpa >= rules.probationCgpa, detail: cgpa !== null ? `CGPA ${cgpa.toFixed(2)}` : "no results yet" },
    { label: "No failed course outstanding", ok: !list.some((g) => g.courses.some((c) => c.status === "FAILED")), detail: list.flatMap((g) => g.courses.filter((c) => c.status === "FAILED").map((c) => c.code)).join(", ") || "none" },
    { label: "Every PLO attained", ok: plos.length > 0 && plos.every((p) => p.attained !== false), detail: plos.filter((p) => p.attained === false).map((p) => `${p.label} ${p.avg}%`).join(", ") || (plos.some((p) => p.attained === null) ? `${plos.filter((p) => p.attained === null).length} PLO(s) not assessed yet` : "all attained") },
    { label: "Deficiency (non-credit) courses passed", ok: !scheme.filter((c) => c.isNonCredit).some((c) => !(best.get(up(c.code)) && isPass(best.get(up(c.code))!))), detail: scheme.filter((c) => c.isNonCredit).map((c) => c.code).join(", ") || "none in the scheme" },
  ];
  // Record checks.
  const schemeOf = new Map(scheme.map((c) => [up(c.code), c]));
  const pts = new Map(scale.map((s) => [s.letter, s.gpaValue]));
  const issues: AuditCheck[] = [];
  const seen = new Map<string, number>();
  for (const r of recs) { const k = `${up(r.courseCode)}|${r.termName}|${r.termYear}`; seen.set(k, (seen.get(k) || 0) + 1); }
  const dups = Array.from(seen.entries()).filter(([, n]) => n > 1).map(([k]) => k.replace(/\|/g, " "));
  issues.push({ label: "No course entered twice in the same term", ok: !dups.length, detail: dups.join(", ") || "OK" });
  const mismatch = recs.filter((r) => pts.has(r.grade) && r.gpaPoints !== null && Math.abs(pts.get(r.grade)! - r.gpaPoints) > 0.01).map((r) => `${r.courseCode} ${r.grade}=${r.gpaPoints}`);
  issues.push({ label: "Grade points match the grading scale", ok: !mismatch.length, detail: mismatch.join(", ") || "OK" });
  const missing = recs.filter((r) => r.gpaPoints === null && r.grade !== "P" && r.grade !== "W" && (r.creditHours || 0) > 0).map((r) => `${r.courseCode} (${r.termName} ${r.termYear})`);
  issues.push({ label: "Every credit course has grade points", ok: !missing.length, detail: missing.join(", ") || "OK" });
  const chDiff = recs.filter((r) => schemeOf.has(up(r.courseCode)) && schemeOf.get(up(r.courseCode))!.creditHours !== r.creditHours).map((r) => `${r.courseCode}: ${r.creditHours} vs ${schemeOf.get(up(r.courseCode))!.creditHours} in the scheme`);
  issues.push({ label: "Credit hours agree with the scheme of studies", ok: !chDiff.length, detail: chDiff.join(", ") || "OK" });
  const outside = Array.from(new Set(recs.filter((r) => !schemeOf.has(up(r.courseCode))).map((r) => `${r.courseCode} ${r.courseTitle}`)));
  issues.push({ label: "Courses outside the scheme (transfer / substitutes) approved", ok: !outside.length, detail: outside.length ? `${outside.join(", ")} — check an equivalence or exemption is on file` : "none" });
  const typeDiff = recs.filter((r) => schemeOf.has(up(r.courseCode)) && r.courseType && schemeOf.get(up(r.courseCode))!.courseType !== r.courseType).map((r) => r.courseCode);
  issues.push({ label: "Course type agrees with the scheme", ok: !typeDiff.length, detail: typeDiff.join(", ") || "OK" });
  return { program: st.batch.degreeProgram, semester: st.currentSemesterNumber, groups: list, required, passed, inProgress, cgpa, graduation, issues, eligible: graduation.every((g) => g.ok) };
}
