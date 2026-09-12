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
  if (!body.alumniId || !body.employerId) return NextResponse.json({ error: "alumniId and employerId are required" }, { status: 400 });

  const [alum, employer] = await Promise.all([
    prisma.alumni.findUnique({ where: { id: body.alumniId } }),
    prisma.employer.findUnique({ where: { id: body.employerId } }),
  ]);
  if (!alum || alum.chairmanId !== chairmanId) return NextResponse.json({ error: "alumni not found" }, { status: 404 });
  if (!employer || employer.chairmanId !== chairmanId) return NextResponse.json({ error: "employer not found" }, { status: 404 });

  const employment = await prisma.alumniEmployment.create({
    data: {
      alumniId: body.alumniId, employerId: body.employerId, jobTitle: body.jobTitle || null,
      startDate: body.startDate ? new Date(body.startDate) : null, endDate: body.endDate ? new Date(body.endDate) : null,
      salaryRange: body.salaryRange || null, addedById: user.id, status: "PENDING",
    },
  });

  return NextResponse.json({ employment }, { status: 201 });
}
