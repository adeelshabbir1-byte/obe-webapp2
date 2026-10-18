import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { reviewBatchWhere } from "../../../../lib/reviewScope";
import { outcomesData, FORMATS, toCsv } from "../../../../lib/outcomesReport";
import { SOURCES } from "../../../../lib/indirectPlo";
import { pdb } from "../../../../lib/portfolio";

// One-click evidence bundle for a cohort: outcome tables, course CLO results, CQI log, work-sample and portfolio indexes.
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const where = await reviewBatchWhere(user);
  const url = new URL(req.url);
  const batch = where ? await prisma.batch.findFirst({ where: { id: url.searchParams.get("batch") || "", ...where }, select: { id: true } }) : null;
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  const fk = FORMATS[url.searchParams.get("format") || ""] ? url.searchParams.get("format")! : "NCEAC";
  const d = (await outcomesData(batch.id))!;
  const zip = new JSZip();
  const f = FORMATS[fk];
  zip.file("README.txt", `Outcomes evidence bundle — ${f.name}\n${d.batch.degreeProgram} ${d.batch.batchName}\nGenerated ${new Date().toISOString()}\n\n1-outcomes.csv: direct, indirect and blended attainment per outcome (target ${d.plo.target}%)\n2-course-clo-results.csv: share of students meeting each CLO per course\n3-cqi-log.csv: findings and actions\n4-work-samples.csv: sampled scripts with links\n5-portfolio-verified.csv: verified student portfolio entries\n\nThe full printable report is at /accreditation/outcomes-report?batch=${d.batch.id}&format=${fk}\n`);
  zip.file("1-outcomes.csv", toCsv([["GA", "Title", ...(f.outcomes.length ? [`${fk} attribute`] : []), ...SOURCES.map(([, v]) => v), "Blended %", "Met"], ...d.plo.rows.map((r) => [`GA-${r.number}`, r.title, ...(f.outcomes.length ? [f.outcomes[r.number - 1] || ""] : []), ...SOURCES.map(([k]) => (r.cells[k] ? `${r.cells[k]!.pct}% (n=${r.cells[k]!.n})` : "")), r.blended, r.met === null ? "" : r.met ? "Yes" : "No"])]));
  zip.file("2-course-clo-results.csv", toCsv([["Course", "Title", "Term", "Students", "Failed", "CLO", "% meeting"], ...d.courses.flatMap((c) => (c.clos.length ? c.clos : [{ code: "", pct: "" as unknown as number, n: 0 }]).map((x) => [c.code, c.title, c.term, c.n, c.fails, x.code, x.pct]))]));
  zip.file("3-cqi-log.csv", toCsv([["Outcome", "Finding", "Action", "Before", "After", "Status", "Raised"], ...d.cqi.map((c) => [c.sourceReference, c.finding, c.actionTaken, c.metricBefore, c.metricAfter, c.status, c.createdAt.toISOString().slice(0, 10)])]));
  const courses = await prisma.course.findMany({ where: { batchId: batch.id }, select: { id: true, code: true } });
  const cOf = new Map(courses.map((c) => [c.id, c.code]));
  const samples = ((await pdb.studentWorkSample.findMany({ where: { courseId: { in: courses.map((c) => c.id) } } }).catch(() => [])) as { courseId: string; instrumentId: string; studentId: string; level: string; score: number | null; fileName: string; fileUrl: string }[]);
  const insts = new Map((await prisma.assessmentInstrument.findMany({ where: { id: { in: samples.map((s) => s.instrumentId) } }, select: { id: true, label: true, maxScore: true } })).map((i) => [i.id, i]));
  const studs = new Map((await prisma.student.findMany({ where: { batchId: batch.id }, select: { id: true, rollNumber: true, name: true } })).map((s) => [s.id, s]));
  zip.file("4-work-samples.csv", toCsv([["Course", "Assessment", "Level", "Roll no", "Score", "Out of", "File", "Link"], ...samples.map((s) => [cOf.get(s.courseId), insts.get(s.instrumentId)?.label, s.level, studs.get(s.studentId)?.rollNumber, s.score, insts.get(s.instrumentId)?.maxScore, s.fileName, s.fileUrl.startsWith("data:") ? "(stored in system)" : s.fileUrl])]));
  const port = ((await pdb.studentPortfolioItem.findMany({ where: { studentId: { in: Array.from(studs.keys()) }, verifiedAt: { not: null } } }).catch(() => [])) as { studentId: string; title: string; kind: string; ploCodes: string | null; link: string | null; fileUrl: string | null }[]);
  zip.file("5-portfolio-verified.csv", toCsv([["Roll no", "Name", "Entry", "Type", "GAs", "Link"], ...port.map((p) => [studs.get(p.studentId)?.rollNumber, studs.get(p.studentId)?.name, p.title, p.kind, p.ploCodes, p.link || (p.fileUrl && !p.fileUrl.startsWith("data:") ? p.fileUrl : "")])]));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const name = `${d.batch.degreeProgram}-${d.batch.batchName}-${fk}-evidence.zip`.replace(/[^\w.-]+/g, "_");
  return new NextResponse(buf as unknown as BodyInit, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` } });
}
