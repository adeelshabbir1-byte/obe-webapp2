import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { officialCurriculumIsAssigned } from "../../../../../../lib/curriculumAccess";
import { buildExcelResponse } from "../../../../../../lib/excelExport";

// Excel download of one master curriculum: its PLOs, its courses, and every course's CLOs with the PLO each is tagged to.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curriculum = await prisma.masterCurriculum.findUnique({
    where: { id: params.id },
    include: {
      plos: { orderBy: { number: "asc" } },
      courses: { orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], include: { seedClos: { orderBy: { orderIndex: "asc" }, include: { mappedPlo: true } }, prerequisiteCourse: { select: { code: true } } } },
    },
  });
  if (!curriculum) return NextResponse.json({ error: "not found" }, { status: 404 });
  const visible = curriculum.chairmanId === null ? await officialCurriculumIsAssigned(curriculum.id, user.managedById) : curriculum.chairmanId === user.managedById;
  if (!visible) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The official HEC suggestions are keyed by course code, not by a link to the course.
  const codes = curriculum.courses.map((c) => c.code);
  const suggestions = codes.length ? await prisma.hecPloSuggestion.findMany({ where: { courseCode: { in: codes } } }) : [];
  const sugByCode = new Map<string, number[]>();
  for (const s of suggestions) sugByCode.set(s.courseCode, [...(sugByCode.get(s.courseCode) || []), s.ploNumber]);

  const courseRows = curriculum.courses.map((c) => ({
    code: c.code, title: c.title, credits: c.creditHours, category: c.category, semester: c.semesterNumber ?? "",
    prerequisite: c.prerequisiteCourse?.code || "", cloCount: c.seedClos.length,
    suggestedPlos: (sugByCode.get(c.code) || []).sort((a, b) => a - b).map((n) => `PLO-${n}`).join(", "),
    textbook: c.textbook || "",
  }));
  const cloRows = curriculum.courses.flatMap((c) =>
    c.seedClos.map((l, i) => ({
      code: c.code, title: c.title, clo: `CLO-${i + 1}`, statement: l.statement, bloom: l.bloomLevel,
      plo: l.mappedPlo ? `PLO-${l.mappedPlo.number}` : "", source: l.ploMappingSource === "HEC" ? "HEC document" : l.ploMappingSource === "SYSTEM" ? "System suggestion" : "",
    })));
  const ploRows = curriculum.plos.map((p) => ({ number: `PLO-${p.number}`, title: p.title, description: p.description }));

  const safe = `${curriculum.title}-${curriculum.version}`.replace(/[^A-Za-z0-9._-]+/g, "_");
  return buildExcelResponse(`${safe}.xlsx`, [
    { name: "Courses", columns: [
      { header: "Code", key: "code", width: 12 }, { header: "Title", key: "title", width: 44 }, { header: "Credit hours", key: "credits", width: 12 },
      { header: "Category", key: "category", width: 20 }, { header: "Semester", key: "semester", width: 10 }, { header: "Prerequisite", key: "prerequisite", width: 14 },
      { header: "CLOs", key: "cloCount", width: 8 }, { header: "HEC-suggested PLOs", key: "suggestedPlos", width: 26 }, { header: "Textbook", key: "textbook", width: 36 },
    ], rows: courseRows },
    { name: "CLOs and PLO mapping", columns: [
      { header: "Course code", key: "code", width: 12 }, { header: "Course title", key: "title", width: 36 }, { header: "CLO", key: "clo", width: 8 },
      { header: "Statement", key: "statement", width: 70 }, { header: "Bloom level", key: "bloom", width: 10 }, { header: "Mapped PLO", key: "plo", width: 11 }, { header: "Mapping source", key: "source", width: 18 },
    ], rows: cloRows },
    { name: "PLOs", columns: [{ header: "PLO", key: "number", width: 8 }, { header: "Title", key: "title", width: 40 }, { header: "Description", key: "description", width: 90 }], rows: ploRows },
  ]);
}
