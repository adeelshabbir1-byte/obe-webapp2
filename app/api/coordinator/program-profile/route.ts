import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const degreeProgram = req.nextUrl.searchParams.get("degreeProgram");
  if (!degreeProgram) return NextResponse.json({ error: "degreeProgram is required" }, { status: 400 });
  const profile = await prisma.programProfile.findUnique({ where: { coordinatorId_degreeProgram: { coordinatorId: user.id, degreeProgram } } });
  return NextResponse.json({ profile });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.degreeProgram) return NextResponse.json({ error: "degreeProgram is required" }, { status: 400 });

  const profile = await prisma.programProfile.upsert({
    where: { coordinatorId_degreeProgram: { coordinatorId: user.id, degreeProgram: body.degreeProgram } },
    create: {
      coordinatorId: user.id, degreeProgram: body.degreeProgram,
      departmentIntro: body.departmentIntro || null, departmentVision: body.departmentVision || null,
      departmentMission: body.departmentMission || null, peos: body.peos ? JSON.stringify(body.peos) : null,
    },
    update: {
      departmentIntro: body.departmentIntro || null, departmentVision: body.departmentVision || null,
      departmentMission: body.departmentMission || null, peos: body.peos ? JSON.stringify(body.peos) : null,
    },
  });

  return NextResponse.json({ profile });
}
