import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batchId = req.nextUrl.searchParams.get("batchId");
  const plos = await prisma.pLO.findMany({
    where: { coordinatorId: user.id, ...(batchId ? { batchId } : {}) },
    include: { batch: true },
    orderBy: [{ batchId: "asc" }, { number: "asc" }],
  });

  return buildExcelResponse("plos.xlsx", [{
    name: "Program Learning Outcomes",
    columns: [
      { header: "Batch", key: "batch", width: 26 },
      { header: "#", key: "number", width: 6 },
      { header: "Title", key: "title", width: 30 },
      { header: "Description", key: "description", width: 50 },
      { header: "Status", key: "status", width: 16 },
      { header: "Chairman Comment", key: "chairmanComment", width: 30 },
    ],
    rows: plos.map((p) => ({
      batch: p.batch ? `${p.batch.degreeProgram} — ${p.batch.batchName}` : "", number: p.number, title: p.title,
      description: p.description, status: p.status, chairmanComment: p.chairmanComment || "",
    })),
  }]);
}
