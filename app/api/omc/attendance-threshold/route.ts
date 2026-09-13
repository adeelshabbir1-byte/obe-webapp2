import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  const minPercentage = parseInt(body.minPercentage, 10);
  if (isNaN(minPercentage) || minPercentage < 1 || minPercentage > 100) return NextResponse.json({ error: "minimum % must be between 1 and 100" }, { status: 400 });

  const threshold = await prisma.attendanceThreshold.upsert({
    where: { chairmanId: user.managedById },
    create: { chairmanId: user.managedById, minPercentage },
    update: { minPercentage },
  });

  return NextResponse.json({ threshold });
}
