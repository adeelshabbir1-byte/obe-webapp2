import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";

const ALLOWED_ROLES = ["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR"];

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const body = await req.json();
  if (!body.alumniId || !body.degreeName || !body.institution) {
    return NextResponse.json({ error: "alumniId, degreeName, and institution are required" }, { status: 400 });
  }

  const alum = await prisma.alumni.findUnique({ where: { id: body.alumniId } });
  if (!alum || alum.chairmanId !== chairmanId) return NextResponse.json({ error: "alumni not found" }, { status: 404 });

  const degree = await prisma.alumniAdditionalDegree.create({
    data: {
      alumniId: body.alumniId, degreeName: body.degreeName, institution: body.institution,
      completionYear: body.completionYear ? parseInt(body.completionYear, 10) : null,
      addedById: user.id, status: "PENDING",
    },
  });

  return NextResponse.json({ degree }, { status: 201 });
}
