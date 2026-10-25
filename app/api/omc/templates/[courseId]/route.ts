import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { coordinator: true } });
  if (!course || course.coordinator.managedById !== user.managedById) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json();
  if (!body.status || !["approved", "changes-requested"].includes(body.status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'changes-requested'" }, { status: 400 });
  }

  // A single member's decision is now a vote; the Convener confirms on a majority (lib/planVote).
  const r = await (await import("../../../../../lib/planVote")).planAct({ id: user.id, name: user.name, role: user.role }, course.id, { action: "vote", approve: body.status === "approved", comment: body.comment || "" });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, voted: true });
}
