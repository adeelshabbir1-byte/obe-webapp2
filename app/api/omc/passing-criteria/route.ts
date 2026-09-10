import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  const cloPassingPct = parseInt(body.cloPassingPct, 10);
  const ploPassingPct = parseInt(body.ploPassingPct, 10);
  if (isNaN(cloPassingPct) || cloPassingPct < 1 || cloPassingPct > 100) return NextResponse.json({ error: "CLO passing % must be between 1 and 100" }, { status: 400 });
  if (isNaN(ploPassingPct) || ploPassingPct < 1 || ploPassingPct > 100) return NextResponse.json({ error: "PLO passing % must be between 1 and 100" }, { status: 400 });

  const criteria = await prisma.passingCriteria.upsert({
    where: { chairmanId: user.managedById },
    create: { chairmanId: user.managedById, cloPassingPct, ploPassingPct },
    update: { cloPassingPct, ploPassingPct },
  });

  return NextResponse.json({ criteria });
}
