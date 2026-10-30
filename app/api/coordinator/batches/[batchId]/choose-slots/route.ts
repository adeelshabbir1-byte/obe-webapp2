import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { chooseSlots } from "../../../../../../lib/slotChoice";
import { withErrors } from "../../../../../../lib/apiHandler";

// POST { flavour: "IDS" | "Elective", masterCourseIds } — the Program Lead (or OMC) sets which list options fill the batch's slots.
async function POST_handler(req: NextRequest, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "PROGRAM_COORDINATOR" && user.role !== "OMC")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const batch = await prisma.batch.findUnique({ where: { id: params.batchId }, select: { id: true, coordinatorId: true, coordinator: { select: { managedById: true } } } });
  if (!batch || (user.role === "PROGRAM_COORDINATOR" ? batch.coordinatorId !== user.id : batch.coordinator.managedById !== user.managedById)) return NextResponse.json({ error: "Not your batch." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const fl = b.flavour === "IDS" ? "IDS" : "Elective";
  try {
    const message = await chooseSlots({ id: user.id, name: user.name }, batch.id, fl, Array.isArray(b.masterCourseIds) ? b.masterCourseIds.map(String) : []);
    return NextResponse.json({ ok: true, message });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
