import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { importClosIntoMasterCurriculum } from "../../../../../../lib/masterClos";

export const maxDuration = 300;

// Loads CLOs (with their PLO mapping) into the courses of THIS institute's own master curriculum, from an Excel file
// with the columns of the Export's "CLOs and PLO mapping" sheet. See lib/masterClos.ts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const curriculum = await prisma.masterCurriculum.findUnique({ where: { id: params.id }, select: { id: true, chairmanId: true } });
  if (!curriculum || curriculum.chairmanId !== user.managedById) {
    return NextResponse.json({ error: "Only your own copy can be changed. Clone the curriculum first (button above), then import into the clone." }, { status: 403 });
  }
  const file = (await req.formData()).get("file") as File | null;
  if (!file) return NextResponse.json({ error: "choose a file first" }, { status: 400 });
  const r = await importClosIntoMasterCurriculum(curriculum.id, file);
  if (!r.ok) return NextResponse.json({ error: r.error, errors: r.errors }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_CLOS_IMPORTED_FROM_FILE", entityType: "MasterCurriculum", entityId: curriculum.id, metadata: { courses: r.courses, clos: r.clos, problems: r.errors.length } });
  return NextResponse.json({ courses: r.courses, clos: r.clos, errors: r.errors });
}
