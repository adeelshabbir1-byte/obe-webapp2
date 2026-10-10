import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { buildExcelResponse } from "../../../../../../../lib/excelExport";

// Excel download of this course's CLOs with their PLO mapping. The same file can be edited and uploaded back through Import.
export async function GET(_req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [clos, plos] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { orderIndex: "asc" }, include: { mappedPlo: true } }),
    course.batchId ? prisma.pLO.findMany({ where: { batchId: course.batchId }, orderBy: { number: "asc" } }) : Promise.resolve([]),
  ]);
  const safe = `${course.code}-CLOs`.replace(/[^A-Za-z0-9._-]+/g, "_");
  return buildExcelResponse(`${safe}.xlsx`, [
    { name: "CLOs", columns: [
      { header: "CLO", key: "code", width: 9 }, { header: "Statement", key: "statement", width: 80 }, { header: "Bloom level (C1-C6)", key: "bloom", width: 18 },
      { header: "PLO number", key: "plo", width: 12 }, { header: "Contribution to PLO %", key: "pct", width: 20 }, { header: "Target % of students", key: "target", width: 20 },
    ], rows: clos.map((c) => ({ code: c.code, statement: c.statement, bloom: c.bloomLevel, plo: c.mappedPlo?.number ?? "", pct: c.ploContributionPct ?? "", target: c.targetPct })) },
    { name: "PLO reference", columns: [{ header: "PLO number", key: "n", width: 12 }, { header: "Title", key: "t", width: 44 }, { header: "Description", key: "d", width: 90 }],
      rows: plos.map((p) => ({ n: p.number, t: p.title, d: p.description })) },
  ]);
}
