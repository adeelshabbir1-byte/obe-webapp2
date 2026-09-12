import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { chairmanIdFor } from "../../../../../../lib/reportScope";

const MODEL_FOR_TYPE = { alumni: "alumni", employer: "employer", employment: "alumniEmployment" } as const;

export async function PUT(req: NextRequest, { params }: { params: { type: string; id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.isAlumniCustodian) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const type = params.type as keyof typeof MODEL_FOR_TYPE;
  if (!MODEL_FOR_TYPE[type]) return NextResponse.json({ error: "invalid type" }, { status: 400 });

  const body = await req.json();
  const decision = body.decision; // "APPROVED" | "REJECTED"
  if (!["APPROVED", "REJECTED"].includes(decision)) return NextResponse.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 });

  if (type === "alumni") {
    const record = await prisma.alumni.findUnique({ where: { id: params.id } });
    if (!record || record.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.alumni.update({ where: { id: params.id }, data: { status: decision, reviewedById: user.id, reviewNote: body.reviewNote || null } });
  } else if (type === "employer") {
    const record = await prisma.employer.findUnique({ where: { id: params.id } });
    if (!record || record.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.employer.update({ where: { id: params.id }, data: { status: decision, reviewedById: user.id, reviewNote: body.reviewNote || null } });
  } else {
    const record = await prisma.alumniEmployment.findUnique({ where: { id: params.id }, include: { alumni: true } });
    if (!record || record.alumni.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.alumniEmployment.update({ where: { id: params.id }, data: { status: decision, reviewedById: user.id, reviewNote: body.reviewNote || null } });
  }

  return NextResponse.json({ ok: true });
}
