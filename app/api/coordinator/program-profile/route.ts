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

// NBEAC SAR details of the program: its level, launch, approvals, and which PLOs serve each PEO.
const LEVELS = ["UG16", "GRAD18", "PHD"];
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T00:00:00Z") : null);
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.degreeProgram) return NextResponse.json({ error: "degreeProgram is required" }, { status: 400 });
  const map: Record<string, number[]> = {};
  if (body.peoPlo && typeof body.peoPlo === "object") {
    for (const [peo, plos] of Object.entries(body.peoPlo as Record<string, unknown>)) {
      if (!/^PEO\d{1,2}$/.test(peo) || !Array.isArray(plos)) continue;
      map[peo] = Array.from(new Set(plos.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 50))).sort((a, b) => a - b);
    }
  }
  const data = {
    programLevel: LEVELS.includes(body.programLevel) ? body.programLevel : null,
    launchDate: day(body.launchDate), academicCouncilDate: day(body.academicCouncilDate), hecNocDate: day(body.hecNocDate),
    peoPloJson: JSON.stringify(map),
  };
  try {
    const profile = await prisma.programProfile.upsert({
      where: { coordinatorId_degreeProgram: { coordinatorId: user.id, degreeProgram: body.degreeProgram } },
      create: { coordinatorId: user.id, degreeProgram: body.degreeProgram, ...data },
      update: data,
    });
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Run prisma/migration_nbeac_sar.sql in Supabase first." }, { status: 500 });
  }
}
