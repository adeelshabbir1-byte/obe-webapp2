import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { withErrors } from "../../../../../../lib/apiHandler";

async function PUT_handler(req: NextRequest, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  if (body.open) { // a batch taken from a curriculum opens only once its courses are synced and have home departments
    const st = await (await import("../../../../../../lib/batchSetup")).setupStatus(batch.id).catch(() => null);
    if (st && !st.done) return NextResponse.json({ error: `Finish this batch's set-up first (courses page): ${st.open} course(s) to sync or mark new, ${st.noHome} without a home department.` }, { status: 409 });
    // Every course offered this semester needs an OMC-approved Subject Expert plan (a synced, approved plan counts).
    const gate = await (await import("../../../../../../lib/sePlan")).registrationGate(batch.id);
    if (gate.missing.length) return NextResponse.json({ error: `Registration waits for the OMC-approved plan of ${gate.missing.length} of ${gate.offered} offered course(s): ${gate.missing.slice(0, 6).map((m) => `${m.code} (${m.line})`).join("; ")}${gate.missing.length > 6 ? " …" : ""}.`, missing: gate.missing }, { status: 409 });
  }
  const updated = await prisma.batch.update({ where: { id: batch.id }, data: { registrationOpen: !!body.open } });
  return NextResponse.json({ registrationOpen: updated.registrationOpen });
}
export const PUT = withErrors(PUT_handler);
