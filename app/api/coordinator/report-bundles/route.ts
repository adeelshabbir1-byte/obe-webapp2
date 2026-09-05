import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [own, platform] = await Promise.all([
    prisma.reportBundle.findMany({ where: { scope: "COORDINATOR", ownerId: user.id } }),
    prisma.reportBundle.findMany({ where: { scope: "PLATFORM" } }),
  ]);
  return NextResponse.json({
    own: own.map((b) => ({ ...b, reportIds: JSON.parse(b.reportIds) })),
    platform: platform.map((b) => ({ ...b, reportIds: JSON.parse(b.reportIds) })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !Array.isArray(body.reportIds) || body.reportIds.length === 0) {
    return NextResponse.json({ error: "name and at least one report are required" }, { status: 400 });
  }

  const bundle = await prisma.reportBundle.create({
    data: { name: body.name, description: body.description || null, scope: "COORDINATOR", ownerId: user.id, reportIds: JSON.stringify(body.reportIds) },
  });

  return NextResponse.json({ bundle: { ...bundle, reportIds: body.reportIds } }, { status: 201 });
}
