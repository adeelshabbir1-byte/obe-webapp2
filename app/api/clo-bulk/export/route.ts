import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { batchForBulkClos, buildBulkCloWorkbook } from "../../../../lib/cloBulk";

// The template for bulk CLO import: every course of the batch with its current CLOs (blank row for courses without any).
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const batch = await batchForBulkClos(user, new URL(req.url).searchParams.get("batchId") || "");
  if (!batch) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const buf = await buildBulkCloWorkbook(batch.id);
  const name = `CLOs-${batch.degreeProgram}-${batch.batchName}`.replace(/[^A-Za-z0-9-]+/g, "_");
  return new NextResponse(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
}
