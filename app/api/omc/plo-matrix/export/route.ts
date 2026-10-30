import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildExcelResponse } from "../../../../../lib/excelExport";
import { withErrors } from "../../../../../lib/apiHandler";

// Excel download of one batch's PLO-Course matrix: a row per course, a column per PLO, "X" where mapped.
// The same sheet can be edited and uploaded back through Import (it only ever adds mappings).
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const batchId = new URL(req.url).searchParams.get("batchId") || "";
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, include: { coordinator: { select: { managedById: true } } } });
  if (!batch || batch.coordinator.managedById !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [plos, courses] = await Promise.all([
    prisma.pLO.findMany({ where: { batchId }, orderBy: { number: "asc" } }),
    prisma.course.findMany({ where: { batchId }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], include: { ploMappings: true } }),
  ]);
  const rows = courses.map((c) => {
    const r: Record<string, any> = { code: c.code, title: c.title, sem: c.semesterNumber ?? "", type: c.courseType };
    const mapped = new Set(c.ploMappings.map((m) => m.ploId));
    for (const p of plos) r[`p${p.number}`] = mapped.has(p.id) ? "X" : "";
    return r;
  });
  const safe = `GA-matrix-${batch.degreeProgram}-${batch.batchName}`.replace(/[^A-Za-z0-9._-]+/g, "_");
  return buildExcelResponse(`${safe}.xlsx`, [
    { name: "GA matrix", columns: [
      { header: "Course code", key: "code", width: 14 }, { header: "Course title", key: "title", width: 42 }, { header: "Semester", key: "sem", width: 10 }, { header: "Type", key: "type", width: 14 },
      ...plos.map((p) => ({ header: `PLO-${p.number}`, key: `p${p.number}`, width: 8 })),
    ], rows },
    { name: "GA reference", columns: [{ header: "GA", key: "n", width: 8 }, { header: "Title", key: "t", width: 44 }, { header: "Description", key: "d", width: 90 }], rows: plos.map((p) => ({ n: `GA-${p.number}`, t: p.title, d: p.description })) },
  ]);
}
export const GET = withErrors(GET_handler);
