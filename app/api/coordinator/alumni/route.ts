import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";

const ALLOWED_ROLES = ["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR"];

/** Any faculty member can add/view alumni & employer records, but they all
 * share the same institution's pool (resolved via the Chairman, since
 * faculty may be spread across several Coordinators under one institution).
 * New records start PENDING until the chairman-designated custodian
 * (User.isAlumniCustodian) approves or rejects them. */

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const alumni = await prisma.alumni.findMany({ where: { chairmanId }, orderBy: { graduationYear: "desc" } });
  return NextResponse.json({ alumni });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const body = await req.json();
  if (!body.name || !body.rollNumber || !body.degreeProgram || !body.graduationYear) {
    return NextResponse.json({ error: "name, rollNumber, degreeProgram, and graduationYear are required" }, { status: 400 });
  }

  const existing = await prisma.alumni.findUnique({ where: { chairmanId_rollNumber: { chairmanId, rollNumber: body.rollNumber } } });
  if (existing) return NextResponse.json({ error: `an alumni record with roll number "${body.rollNumber}" already exists (${existing.name}) — it can't be added again` }, { status: 409 });

  const alum = await prisma.alumni.create({
    data: {
      chairmanId, name: body.name, email: body.email || null, rollNumber: body.rollNumber,
      degreeProgram: body.degreeProgram, graduationYear: parseInt(body.graduationYear, 10),
      totalWorkExperienceYears: body.totalWorkExperienceYears ? parseInt(body.totalWorkExperienceYears, 10) : null,
      addedById: user.id, status: "PENDING",
    },
  });

  return NextResponse.json({ alumni: alum }, { status: 201 });
}
