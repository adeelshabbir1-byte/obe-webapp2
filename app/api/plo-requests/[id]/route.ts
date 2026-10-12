import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { deptScope } from "../../../../lib/omcScope";
import { pdb, decide, type PloRequestRow } from "../../../../lib/ploRequests";

// PATCH { decision: APPROVE | REJECT | CANCEL, note } — the OMC decides; the person who asked may withdraw it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  let r: PloRequestRow | null = null;
  try { r = (await pdb.ploChangeRequest.findUnique({ where: { id: params.id } })) as PloRequestRow | null; } catch { /* table missing */ }
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (r.status !== "PENDING") return NextResponse.json({ error: "This request was already settled." }, { status: 400 });
  const note = String(b.note || "").trim().slice(0, 1000);
  if (b.decision === "CANCEL") {
    if (r.requestedById !== user.id) return NextResponse.json({ error: "Only the person who asked can withdraw it." }, { status: 403 });
    await pdb.ploChangeRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", decidedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  if (user.role !== "OMC") return NextResponse.json({ error: "Only the OMC decides PLO changes." }, { status: 403 });
  const c = await prisma.course.findUnique({ where: { id: r.courseId }, select: { coordinator: { select: { managedById: true, departmentId: true } } } });
  const scope = deptScope(user);
  if (!c || c.coordinator.managedById !== user.managedById || (scope.departmentId && c.coordinator.departmentId !== scope.departmentId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (b.decision === "REJECT" && note.length < 3) return NextResponse.json({ error: "Say why, so they know what to change." }, { status: 400 });
  try {
    const unmapped = await decide(r, b.decision === "APPROVE", note, { id: user.id, name: user.name });
    return NextResponse.json({ ok: true, unmapped });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not apply." }, { status: 400 });
  }
}
