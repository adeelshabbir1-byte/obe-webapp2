import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const alumni = await prisma.alumni.findMany({ where: { coordinatorId: user.id }, orderBy: { graduationYear: "desc" } });
  return NextResponse.json({ alumni });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !body.degreeProgram || !body.graduationYear) {
    return NextResponse.json({ error: "name, degreeProgram, and graduationYear are required" }, { status: 400 });
  }

  const alum = await prisma.alumni.create({
    data: { coordinatorId: user.id, name: body.name, email: body.email || null, degreeProgram: body.degreeProgram, graduationYear: parseInt(body.graduationYear, 10) },
  });

  return NextResponse.json({ alumni: alum }, { status: 201 });
}
