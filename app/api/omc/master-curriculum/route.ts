import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

// Lists every Master Curriculum with a course/PLO count, for the picker
// on the editing page — the shared official copies (chairmanId null),
// plus this chairman's own clones, but never another chairman's clones,
// since those are private to them.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curricula = await prisma.masterCurriculum.findMany({
    where: { OR: [{ chairmanId: null }, { chairmanId: user.managedById || "" }] },
    select: { id: true, title: true, authority: true, version: true, status: true, chairmanId: true, _count: { select: { courses: true, plos: true } } },
    orderBy: { title: "asc" },
  });

  return NextResponse.json({
    curricula: curricula.map((c) => ({ ...c, isOwned: c.chairmanId === user.managedById })),
  });
}
