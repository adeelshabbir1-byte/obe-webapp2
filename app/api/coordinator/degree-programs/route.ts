import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const programs = await prisma.degreeProgram.findMany({ where: { coordinatorId: user.id }, orderBy: { name: "asc" } });
  return NextResponse.json({ programs });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !body.shortCode) return NextResponse.json({ error: "name and shortCode are required" }, { status: 400 });

  const existing = await prisma.degreeProgram.findUnique({ where: { coordinatorId_shortCode: { coordinatorId: user.id, shortCode: body.shortCode } } });
  if (existing) return NextResponse.json({ error: `a program with short code "${body.shortCode}" already exists` }, { status: 409 });

  const program = await prisma.degreeProgram.create({
    data: {
      coordinatorId: user.id, name: body.name, shortCode: body.shortCode,
      defaultIntakeSize: body.defaultIntakeSize ? parseInt(body.defaultIntakeSize, 10) : 30,
      usuallyOfferedInFall: body.usuallyOfferedInFall !== false,
      usuallyOfferedInSpring: !!body.usuallyOfferedInSpring,
    },
  });
  return NextResponse.json({ program }, { status: 201 });
}
