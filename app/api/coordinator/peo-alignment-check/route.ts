import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { checkPeoAlignment } from "../../../../lib/peoAlignmentCheck";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.degreeProgram || !body.batchId) {
    return NextResponse.json({ error: "degreeProgram and batchId are required" }, { status: 400 });
  }

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const profile = await prisma.programProfile.findUnique({
    where: { coordinatorId_degreeProgram: { coordinatorId: user.id, degreeProgram: body.degreeProgram } },
  });
  const peos: string[] = profile?.peos ? JSON.parse(profile.peos) : [];

  const plos = await prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" } });

  const result = await checkPeoAlignment(
    chairmanId,
    peos,
    plos.map((p) => ({ number: p.number, title: p.title, description: p.description })),
  );

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ results: result.results });
}
